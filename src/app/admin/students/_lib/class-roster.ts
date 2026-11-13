import { buildClassRoster, type ClassRoster, type RosterBy, type RosterEnrollment, type RosterPerson, type RosterSection } from "@/lib/class-roster";
import { hiddenFromRoster, isAssistantAccount } from "@/lib/roster-accounts";
import type { DB, TermLite } from "../../_lib/queries";
import type { PersonName } from "../../_lib/profile-names";

/**
 * 반별 명단 · 레벨별 명단(학생명단 화면 · PDF 받기)이 읽는 것 — 그 기수의 반 · 품는 관계 · 배정 · 이름. 계산은 `src/lib/class-roster.ts` 한곳이다
 * (`by` 는 칸 나누는 법만 정한다 — 읽는 것은 같다).
 * **강사 · 관리자 화면이다** (학생명단 · `requireStaff`) — 이름 · 등급은 배정에 붙여 profiles 에서 바로 읽는다 (조교 화면이 아니라 `getProfileNames` 를 거치지 않는다).
 * PostgREST 는 한 번에 1,000줄까지라 방학(600명 × 두 반)에는 배정을 나눠 읽는다. 읽다 실패하면 `ok` 가 거짓 — 화면이 "일부를 못 불러왔어요" 를 띄운다.
 *
 * **`names` 를 주면 이름 · 등급을 그 함수로 읽는다** — 조교 화면(숙제 미제출 알림의 `숙제 알림받기` · `숙제 알림끄기`, 2026-11-13)은 profiles 를 못 읽으므로
 * `getProfileNames`(이름 · 등급만 — 도메인 규칙 3)를 넘긴다. 그때 배정은 profiles 를 붙이지 않고 읽는다. 이름 · 등급을 하나도 못 받으면 강사 · 관리자 계정을
 * 가려낼 수 없으니 `ok` 가 거짓이다 (숙제 미제출 명단 `loadMissingData` 와 같다).
 */

const PAGE = 1000;

const emptyRoster = (by: RosterBy): ClassRoster => ({ by, levels: [], empty: [], total: 0, unplaced: 0 });

export async function loadClassRoster(
  supabase: DB,
  term: TermLite,
  today: string,
  by: RosterBy = "time",
  names?: (ids: string[]) => Promise<Map<string, PersonName>>,
): Promise<{ roster: ClassRoster; ok: boolean }> {
  const { data: rows, error } = await supabase
    .from("class_sections")
    .select("id, track, time_block, subject, book_set, recorded, closes_at, course_id, course:courses(name, target_score, program)")
    .eq("term_id", term.id)
    .order("id");
  if (error) return { roster: emptyRoster(by), ok: false };
  const sections: RosterSection[] = (rows ?? []).map((s) => ({
    id: s.id,
    track: s.track,
    timeBlock: s.time_block,
    subject: s.subject,
    bookSet: s.book_set,
    recorded: s.recorded,
    closesAt: s.closes_at,
    courseId: s.course_id,
    level: s.course?.target_score ?? null,
    program: s.course?.program ?? null,
    courseName: s.course?.name ?? null,
  }));
  const ids = sections.map((s) => s.id);
  if (ids.length === 0) return { roster: emptyRoster(by), ok: true };

  type Row = { student_id: string; section_id: number | null; mode: string; student: { name: string; role: string; merged_into: string | null } | null };
  type Page = { data: Row[] | null; error: unknown; count: number | null };
  const page = (from: number, count: boolean): PromiseLike<Page> =>
    names
      ? supabase
          .from("enrollments")
          .select("student_id, section_id, mode", count ? { count: "exact" } : undefined)
          .in("section_id", ids)
          .eq("status", "active")
          .order("id")
          .range(from, from + PAGE - 1)
          .then((r) => ({ data: r.data ? r.data.map((x) => ({ ...x, student: null })) : null, error: r.error, count: r.count }))
      : supabase
          .from("enrollments")
          .select("student_id, section_id, mode, student:profiles!enrollments_student_id_fkey(name, role, merged_into)", count ? { count: "exact" } : undefined)
          .in("section_id", ids)
          .eq("status", "active")
          .order("id")
          .range(from, from + PAGE - 1)
          .then((r) => ({ data: r.data as Row[] | null, error: r.error, count: r.count }));

  const [includeRows, first] = await Promise.all([supabase.rpc("term_section_includes", { p_term_id: term.id }), page(0, true)]);
  let ok = !includeRows.error && !first.error;
  const enrollRows: Row[] = [...(first.data ?? [])];
  const total = first.count ?? enrollRows.length;
  if (!first.error && enrollRows.length === PAGE && total > PAGE) {
    const rest = await Promise.all(Array.from({ length: Math.ceil(total / PAGE) - 1 }, (_, i) => page((i + 1) * PAGE, false)));
    if (rest.some((r) => r.error)) ok = false;
    for (const r of rest) enrollRows.push(...(r.data ?? []));
  }

  // 조교 화면 — 이름 · 등급을 따로 받아 붙인다 (합친 옛 계정은 배정이 남길 계정으로 옮겨져 여기 없다)
  if (names) {
    const want = [...new Set(enrollRows.map((r) => r.student_id))];
    const got = want.length ? await names(want) : new Map<string, PersonName>();
    if (want.length > 0 && got.size === 0) ok = false;
    for (const r of enrollRows) {
      const p = got.get(r.student_id);
      r.student = p ? { name: p.name, role: p.role, merged_into: null } : null;
    }
  }

  const includes = new Map<number, number[]>();
  for (const r of includeRows.data ?? []) includes.set(r.section_id, [...(includes.get(r.section_id) ?? []), r.included_id]);
  const people = new Map<string, RosterPerson>();
  const enrollments: RosterEnrollment[] = [];
  for (const r of enrollRows) {
    // 합쳐진 옛 계정은 빼고 (배정은 남길 계정으로 옮겨졌다).
    // 강사 · 관리자 계정은 명단에서 빠지고 조교 계정은 `(조교)` 로 선다 — 진짜 등급으로 본다 (`roster-accounts.ts`, 2026-10-16)
    if (r.section_id == null || r.student?.merged_into) continue;
    const role = r.student?.role ?? null;
    people.set(r.student_id, { name: r.student?.name ?? "", staff: hiddenFromRoster(role), assistant: isAssistantAccount(role) });
    enrollments.push({ studentId: r.student_id, sectionId: r.section_id, mode: r.mode });
  }
  return { roster: buildClassRoster({ sections, includes, enrollments, people, today, by }), ok };
}
