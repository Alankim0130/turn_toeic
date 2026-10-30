import { homeworkTermRates, type HomeworkTermRate, type RateSection } from "@/lib/homework-rate";
import { readAll, readAllIn } from "@/lib/read-all";
import type { DB } from "../../_lib/queries";
import { groupClasses, type SectionMeta } from "../../homework/_lib/missing";

/**
 * 학생 관리(`/admin/students/[id]`)의 **숙제 제출률 — 달마다** (2026-10-30 Alan 이 받은 연락 — "이 학생이 이떄까지 숙제를 어떻게 했는지 보이고/
 * 숙제 제출률 이런거 있자나요. 퍼센트로 보이게, 각 달별루요!"). 계산은 `src/lib/homework-rate.ts` 한곳이다 — 숙제 미제출 알림과 같은 셈이다.
 *
 * **강사 · 관리자 화면이다** (`requireStaff`) — 지난 달의 반 · 회차까지 읽어야 해서 로그인한 강사 · 관리자의 세션으로 읽는다 (정책이 스태프에게 연다).
 * 읽는 것: 그 학생의 배정(반 · 배정일) → 그 달마다 품는 관계(DB `term_section_includes`) → 품은 반 · 회차 → 기한(DB `homework_due_dates`) · 낸 숙제 · 교재 레벨 목록.
 * 하나라도 못 읽으면 `ok` 가 거짓 — 화면은 숫자를 그리지 않는다 (낸 숙제를 못 읽었는데 0% 로 보이면 안 된다).
 */

export type StudentHomeworkMonth = HomeworkTermRate & {
  year: number;
  month: number;
  /** 그 달 직접 배정된 반 — `650+ · 주5일 10:00~12:10` (주5일은 한 줄) */
  classes: string[];
};

const SECTION_COLUMNS =
  "id, term_id, course_id, track, time_block, start_time, subject, enrollment_opens_at, closes_at, term:terms(year, month), course:courses(name, target_score, program)";

type SectionRow = {
  id: number;
  term_id: number;
  course_id: number;
  track: string;
  time_block: string | null;
  start_time: string | null;
  subject: string | null;
  enrollment_opens_at: string;
  closes_at: string;
  term: { year: number; month: number } | null;
  course: { name: string; target_score: number | null; program: string } | null;
};

/** KST 날짜 (배정한 날) — 미제출 알림과 같다 */
const kstDate = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

export async function loadStudentHomeworkRates(supabase: DB, studentId: string): Promise<{ months: StudentHomeworkMonth[]; ok: boolean }> {
  const fail = { months: [], ok: false };

  // 낸 숙제 · 교재 레벨 목록은 배정과 상관없이 바로 묻는다
  const submissionsP = readAll<{ class_date: string | null; level: number; subject: string }>((from, to, count) =>
    supabase
      .from("homework_submissions")
      .select("class_date, level, subject", count ? { count: "exact" } : undefined)
      .eq("user_id", studentId)
      .order("id")
      .range(from, to),
  );
  const levelsP = supabase.from("lc_levels").select("level");

  // 그 학생의 직접 배정 — 반 · 배정일 (지난 달 배정도 그대로 'active' 다 — 미제출 알림과 같은 조건)
  const { data: enrollRows, error: enrollError } = await supabase
    .from("enrollments")
    .select(`section_id, created_at, section:class_sections!enrollments_section_id_fkey(${SECTION_COLUMNS})`)
    .eq("student_id", studentId)
    .eq("status", "active")
    .order("id");
  if (enrollError) return fail;
  const direct = (enrollRows ?? []).filter((e): e is typeof e & { section: SectionRow } => e.section_id != null && !!e.section);
  if (direct.length === 0) {
    const [subs, levels] = await Promise.all([submissionsP, levelsP]);
    return { months: [], ok: subs.ok && !levels.error };
  }

  // 달마다 품는 관계 — 직접 배정된 반이 품은 시간 단위 반 (120 · 140분 묶음 · 속성반 · 2주완성). 앱에서 따로 계산하지 않는다
  const directIds = new Set(direct.map((e) => e.section.id));
  const termIds = [...new Set(direct.map((e) => e.section.term_id))];
  const includeResults = await Promise.all(termIds.map((t) => supabase.rpc("term_section_includes", { p_term_id: t })));
  if (includeResults.some((r) => r.error)) return fail;
  const includes = new Map<number, number[]>();
  for (const r of includeResults) {
    for (const row of r.data ?? []) {
      if (directIds.has(row.section_id)) includes.set(row.section_id, [...(includes.get(row.section_id) ?? []), row.included_id]);
    }
  }

  // 품은 반 (직접 배정이 아닌 것) · 모든 반의 회차 날짜
  const leafIds = [...new Set([...includes.values()].flat())].filter((id) => !directIds.has(id));
  const allIds = [...directIds, ...leafIds];
  const [leafRows, dates] = await Promise.all([
    readAllIn<SectionRow, number>(leafIds, (chunk, from, to, count) =>
      supabase
        .from("class_sections")
        .select(SECTION_COLUMNS, count ? { count: "exact" } : undefined)
        .in("id", chunk)
        .order("id")
        .range(from, to),
    ),
    readAllIn<{ section_id: number; date: string }, number>(allIds, (chunk, from, to, count) =>
      supabase
        .from("session_dates")
        .select("section_id, date", count ? { count: "exact" } : undefined)
        .in("section_id", chunk)
        .order("id")
        .range(from, to),
    ),
  ]);
  if (!leafRows.ok || !dates.ok) return fail;

  const datesOf = new Map<number, string[]>();
  for (const d of dates.rows) datesOf.set(d.section_id, [...(datesOf.get(d.section_id) ?? []), d.date]);
  const sections = new Map<number, RateSection>();
  const meta = new Map<number, SectionMeta>();
  const termOf = new Map<number, { year: number; month: number }>();
  for (const s of [...direct.map((e) => e.section), ...leafRows.rows]) {
    if (sections.has(s.id)) continue;
    sections.set(s.id, {
      id: s.id,
      termId: s.term_id,
      track: s.track,
      level: s.course?.target_score ?? null,
      subject: s.subject,
      opens: s.enrollment_opens_at,
      closes: s.closes_at,
      dates: (datesOf.get(s.id) ?? []).sort(),
    });
    meta.set(s.id, { id: s.id, term_id: s.term_id, course_id: s.course_id, track: s.track, time_block: s.time_block, start_time: s.start_time, course: s.course });
    if (s.term && !termOf.has(s.term_id)) termOf.set(s.term_id, s.term);
  }

  // 기한 날짜 — 수업일마다 같은 트랙의 다음 수업일 (반 편성 달력, 기수를 넘어서도)
  const uniqueDates = [...new Set(dates.rows.map((d) => d.date))];
  const [{ data: dueRows, error: dueError }, subs, levels] = await Promise.all([
    uniqueDates.length ? supabase.rpc("homework_due_dates", { p_dates: uniqueDates }) : Promise.resolve({ data: [], error: null }),
    submissionsP,
    levelsP,
  ]);
  if (dueError || !subs.ok || levels.error) return fail;

  const rates = homeworkTermRates({
    due: new Map((dueRows ?? []).map((r) => [r.class_date, r.due_date])),
    sections,
    includes,
    enrollments: direct.map((e) => ({ sectionId: e.section.id, from: kstDate(e.created_at) })),
    submissions: subs.rows.filter((s): s is typeof s & { class_date: string } => !!s.class_date).map((s) => ({ date: s.class_date, level: s.level, subject: s.subject })),
    levels: (levels.data ?? []).map((l) => l.level),
  });

  const months = rates
    .map((r): StudentHomeworkMonth => {
      const term = termOf.get(r.termId) ?? { year: Number(r.opens.slice(0, 4)), month: Number(r.opens.slice(5, 7)) };
      return { ...r, year: term.year, month: term.month, classes: groupClasses(meta, r.sectionIds) };
    })
    // 최근 달부터
    .sort((a, b) => b.year - a.year || b.month - a.month || b.termId - a.termId);
  return { months, ok: true };
}
