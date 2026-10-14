import { buildClassRoster, type ClassRoster, type RosterEnrollment, type RosterPerson, type RosterSection, type RosterSubject } from "@/lib/class-roster";
import type { DB, TermLite } from "../../_lib/queries";

/**
 * 반별 명단(학생명단 PC 화면 · PDF 받기)이 읽는 것 — 그 기수의 반 · 품는 관계 · 배정 · 이름. 계산은 `src/lib/class-roster.ts` 한곳이다.
 * **강사 · 관리자 화면이다** (학생명단 · `requireStaff`) — 이름 · 등급은 배정에 붙여 profiles 에서 바로 읽는다 (조교 화면이 아니라 `getProfileNames` 를 거치지 않는다).
 * PostgREST 는 한 번에 1,000줄까지라 방학(600명 × 두 반)에는 배정을 나눠 읽는다. 읽다 실패하면 `ok` 가 거짓 — 화면이 "일부를 못 불러왔어요" 를 띄운다.
 */

const PAGE = 1000;
/** 강사 · 관리자 · 조교 계정 — 학생 화면을 보려고 넣은 테스트 배정이라 명단에 넣지 않는다 (숙제 미제출 알림 · 학생명단 강사·조교 탭과 같은 집합) */
const STAFF_ROLES = new Set(["instructor", "admin", "assistant"]);

const EMPTY = (subject: RosterSubject): ClassRoster => ({ subject, levels: [], empty: [], total: 0, elsewhere: 0 });

export async function loadClassRoster(supabase: DB, term: TermLite, subject: RosterSubject, today: string): Promise<{ roster: ClassRoster; ok: boolean }> {
  const { data: rows, error } = await supabase
    .from("class_sections")
    .select("id, track, time_block, subject, book_set, recorded, closes_at, course_id, course:courses(name, target_score, program)")
    .eq("term_id", term.id)
    .order("id");
  if (error) return { roster: EMPTY(subject), ok: false };
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
  if (ids.length === 0) return { roster: EMPTY(subject), ok: true };

  type Row = { student_id: string; section_id: number | null; mode: string; student: { name: string; role: string; merged_into: string | null } | null };
  const page = (from: number, count: boolean) =>
    supabase
      .from("enrollments")
      .select("student_id, section_id, mode, student:profiles!enrollments_student_id_fkey(name, role, merged_into)", count ? { count: "exact" } : undefined)
      .in("section_id", ids)
      .eq("status", "active")
      .order("id")
      .range(from, from + PAGE - 1);

  const [includeRows, first] = await Promise.all([supabase.rpc("term_section_includes", { p_term_id: term.id }), page(0, true)]);
  let ok = !includeRows.error && !first.error;
  const enrollRows: Row[] = [...((first.data ?? []) as Row[])];
  const total = first.count ?? enrollRows.length;
  if (!first.error && enrollRows.length === PAGE && total > PAGE) {
    const rest = await Promise.all(Array.from({ length: Math.ceil(total / PAGE) - 1 }, (_, i) => page((i + 1) * PAGE, false)));
    if (rest.some((r) => r.error)) ok = false;
    for (const r of rest) enrollRows.push(...((r.data ?? []) as Row[]));
  }

  const includes = new Map<number, number[]>();
  for (const r of includeRows.data ?? []) includes.set(r.section_id, [...(includes.get(r.section_id) ?? []), r.included_id]);
  const people = new Map<string, RosterPerson>();
  const enrollments: RosterEnrollment[] = [];
  for (const r of enrollRows) {
    // 합쳐진 옛 계정은 빼고 (배정은 남길 계정으로 옮겨졌다)
    if (r.section_id == null || r.student?.merged_into) continue;
    people.set(r.student_id, { name: r.student?.name ?? "", staff: STAFF_ROLES.has(r.student?.role ?? "") });
    enrollments.push({ studentId: r.student_id, sectionId: r.section_id, mode: r.mode });
  }
  return { roster: buildClassRoster({ sections, includes, enrollments, people, subject, today }), ok };
}
