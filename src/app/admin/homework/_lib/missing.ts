import type { MissingEnrollment, MissingSection, MissingSubmission } from "@/lib/homework-missing";
import { programRank } from "@/lib/timetable";
import { parseTimeBlock } from "@/lib/time-blocks";
import { collapseWeek5, week5SectionIds } from "@/lib/week5";
import { sectionChip, type DB, type TermLite } from "../../_lib/queries";
import { getProfileNames } from "../../_lib/profile-names";

/**
 * 숙제 미제출 알림(`/admin/homework/missing`)이 읽는 것 — 그 기수의 반 · 회차 · 품는 관계 · 배정 · 낸 숙제 · 이름 · 보낸 시각.
 * 계산은 `src/lib/homework-missing.ts` 한곳이고 화면과 서버 액션이 같은 데이터로 센다.
 *
 * **조교에게도 열린 화면이다** (숙제점검 아래) — 이름은 이름 · 등급만 주는 `getProfileNames` 로 읽는다 (조교는 profiles 를 못 읽는다, 등급 체계 9-2).
 * 반 · 회차 · 배정 · 숙제는 조교에게 열린 표다 (회차는 2026-10-03 불라방 링크 때문에, 숙제는 숙제점검 때문에).
 * 품는 관계는 DB `term_section_includes` 가 정한다 — 앱에서 따로 계산하지 않는다.
 *
 * PostgREST 는 한 번에 1,000줄까지만 준다 — 방학에 600명이면 배정 · 숙제가 넘는다. 개수를 먼저 받고 나머지 쪽은 함께 읽는다.
 */

const PAGE = 1000;

/** 반 이름 · 정렬에 쓰는 것 */
export type SectionMeta = {
  id: number;
  term_id: number;
  course_id: number;
  track: string;
  time_block: string | null;
  start_time: string | null;
  course: { name: string; target_score: number | null; program: string } | null;
};

export type MissingData = {
  sections: Map<number, MissingSection>;
  meta: Map<number, SectionMeta>;
  includes: Map<number, number[]>;
  enrollments: MissingEnrollment[];
  submissions: MissingSubmission[];
  people: Map<string, { name: string; staff: boolean }>;
};

/**
 * 강사 · 관리자 · 조교 계정 — 반에 배정돼 있어도 학생 화면을 보려는 테스트 배정이라 명단에 넣지 않는다
 * (2026-10-08 Alan "미제출 알림에 리스트 명단에 강사계정과 관리자 계정도 포함되어있어. 이건 빼줘" · 학생명단 `강사·조교` 탭과 같은 집합).
 * 진짜 등급으로 본다 — `profile_names` 가 주는 등급은 test_role 이 아니라 profiles.role 이다.
 */
const STAFF_ROLES = new Set(["instructor", "admin", "assistant"]);

/** KST 날짜 (배정한 날) */
const kstDate = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

type Page<T> = { data: T[] | null; error: unknown; count?: number | null };

/** 1,000줄씩 — 첫 쪽에서 개수를 받고 남은 쪽은 함께 읽는다. 읽다 실패하면 거기까지 (빈 칸이 '안 냄' 으로 보이지 않게 호출하는 쪽이 판단한다) */
async function readAll<T>(page: (from: number, to: number, count: boolean) => PromiseLike<Page<T>>): Promise<{ rows: T[]; ok: boolean }> {
  const first = await page(0, PAGE - 1, true);
  if (first.error) return { rows: [], ok: false };
  const rows = [...(first.data ?? [])];
  const total = first.count ?? rows.length;
  if (rows.length < PAGE || total <= PAGE) return { rows, ok: true };
  const rest = await Promise.all(Array.from({ length: Math.ceil(total / PAGE) - 1 }, (_, i) => page((i + 1) * PAGE, (i + 2) * PAGE - 1, false)));
  if (rest.some((r) => r.error)) return { rows, ok: false };
  for (const r of rest) rows.push(...(r.data ?? []));
  return { rows, ok: true };
}

/**
 * 그 기수의 데이터. `students` 를 주면 그 학생들 것만 남긴다 (보내기 직전 서버가 다시 셀 때 — 낸 숙제도 그 학생들 것만 읽는다).
 * `ok` 가 거짓이면 일부를 못 읽은 것이다 — 화면은 '안 냄' 을 믿을 수 없다고 말하고, 보내기는 멈춘다.
 */
export async function loadMissingData(supabase: DB, term: TermLite, opts: { students?: readonly string[] } = {}): Promise<MissingData & { ok: boolean }> {
  const { data: sectionRows, error: sectionError } = await supabase
    .from("class_sections")
    .select("id, term_id, course_id, track, time_block, start_time, subject, enrollment_opens_at, closes_at, course:courses(name, target_score, program)")
    .eq("term_id", term.id)
    .order("id");
  const sectionIds = (sectionRows ?? []).map((s) => s.id);
  const empty = { sections: new Map(), meta: new Map(), includes: new Map(), enrollments: [], submissions: [], people: new Map() };
  if (sectionError) return { ...empty, ok: false };
  if (sectionIds.length === 0) return { ...empty, ok: true };

  const [dates, includeRows, enrollRows] = await Promise.all([
    readAll<{ section_id: number; date: string }>((from, to, count) =>
      supabase
        .from("session_dates")
        .select("section_id, date", count ? { count: "exact" } : undefined)
        .in("section_id", sectionIds)
        .order("id")
        .range(from, to),
    ),
    supabase.rpc("term_section_includes", { p_term_id: term.id }),
    readAll<{ student_id: string; section_id: number | null; created_at: string }>((from, to, count) =>
      supabase
        .from("enrollments")
        .select("student_id, section_id, created_at", count ? { count: "exact" } : undefined)
        .in("section_id", sectionIds)
        .eq("status", "active")
        .order("id")
        .range(from, to),
    ),
  ]);

  const datesOf = new Map<number, string[]>();
  for (const d of dates.rows) datesOf.set(d.section_id, [...(datesOf.get(d.section_id) ?? []), d.date]);
  const sections = new Map<number, MissingSection>();
  const meta = new Map<number, SectionMeta>();
  for (const s of sectionRows ?? []) {
    sections.set(s.id, {
      id: s.id,
      track: s.track,
      level: s.course?.target_score ?? null,
      subject: s.subject,
      opens: s.enrollment_opens_at,
      closes: s.closes_at,
      dates: (datesOf.get(s.id) ?? []).sort(),
    });
    meta.set(s.id, { id: s.id, term_id: s.term_id, course_id: s.course_id, track: s.track, time_block: s.time_block, start_time: s.start_time, course: s.course });
  }
  const includes = new Map<number, number[]>();
  for (const r of includeRows.data ?? []) includes.set(r.section_id, [...(includes.get(r.section_id) ?? []), r.included_id]);

  const want = opts.students ? new Set(opts.students) : null;
  const enrollments: MissingEnrollment[] = enrollRows.rows
    .filter((e) => e.section_id != null && (!want || want.has(e.student_id)))
    .map((e) => ({ studentId: e.student_id, sectionId: e.section_id!, from: kstDate(e.created_at) }));
  const studentIds = [...new Set(enrollments.map((e) => e.studentId))];

  // 낸 숙제 — 그 기수 회차 날짜 범위 안 (반 날짜는 앞뒤 달로 넘어갈 수 있어 달력의 월로 자르지 않는다)
  const allDates = [...sections.values()].flatMap((s) => s.dates).sort();
  let submissions: MissingSubmission[] = [];
  let subsOk = true;
  if (allDates.length > 0 && studentIds.length > 0) {
    const [lo, hi] = [allDates[0], allDates[allDates.length - 1]];
    type Sub = { user_id: string; level: number; subject: string; class_date: string | null };
    const query = (ids: string[] | null) =>
      readAll<Sub>((from, to, count) => {
        let q = supabase
          .from("homework_submissions")
          .select("user_id, level, subject, class_date", count ? { count: "exact" } : undefined)
          .gte("class_date", lo)
          .lte("class_date", hi);
        if (ids) q = q.in("user_id", ids);
        return q.order("id").range(from, to);
      });
    // 보내기 직전에는 고른 학생 것만 — 주소에 id 를 싣는 조회라 100명씩 나눈다
    const chunks: (string[] | null)[] = [];
    if (want) for (let i = 0; i < studentIds.length; i += 100) chunks.push(studentIds.slice(i, i + 100));
    else chunks.push(null);
    const results = await Promise.all(chunks.map(query));
    subsOk = results.every((r) => r.ok);
    submissions = results
      .flatMap((r) => r.rows)
      .filter((s): s is Sub & { class_date: string } => !!s.class_date)
      .map((s) => ({ userId: s.user_id, date: s.class_date, level: s.level, subject: s.subject }));
  }

  const names = await getProfileNames(supabase, studentIds);
  const people = new Map(studentIds.map((id) => [id, { name: names.get(id)?.name ?? "", staff: STAFF_ROLES.has(names.get(id)?.role ?? "") }]));
  // 이름 · 등급을 못 읽으면(빈 Map) 강사 · 관리자 계정을 가려낼 수 없다 — 명단에 섞이고 알림이 갈 수 있으니 다 못 읽은 것으로 본다 (보내기도 멈춘다)
  const namesOk = studentIds.length === 0 || names.size > 0;

  return { sections, meta, includes, enrollments, submissions, people, ok: dates.ok && enrollRows.ok && !includeRows.error && subsOk && namesOk };
}

/** 반 정렬 키 — 과정(점수보장반 → 속성반 → 2주완성) · 레벨 · 시작 · 끝 · 트랙(월수금 먼저) */
export function sectionSortKey(meta: ReadonlyMap<number, SectionMeta>) {
  return (id: number): (number | string)[] => {
    const s = meta.get(id);
    if (!s) return [99, id];
    const span = parseTimeBlock(s.time_block);
    return [programRank(s.course?.program), s.course?.target_score ?? 9999, span?.start ?? 9999, span?.end ?? 9999, s.track === "mwf" ? 0 : 1, id];
  };
}

/** 묶음(직접 배정된 반들)의 이름 — `650+ · 주5일 10:00~12:10`. 주5일 짝은 한 줄로 합친다 (짝은 그 묶음 안에서만) */
export function groupClasses(meta: ReadonlyMap<number, SectionMeta>, sectionIds: readonly number[]): string[] {
  const key = sectionSortKey(meta);
  const list = [...sectionIds]
    .sort((a, b) => {
      const [x, y] = [key(a), key(b)];
      for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return typeof x[i] === "number" && typeof y[i] === "number" ? (x[i] as number) - (y[i] as number) : String(x[i]).localeCompare(String(y[i]));
      return 0;
    })
    .map((id) => meta.get(id))
    .filter((s): s is SectionMeta => !!s);
  const week5 = week5SectionIds(list);
  return collapseWeek5(list, (s) => s, week5).map((s) => sectionChip(s, week5, { withTerm: false }));
}
