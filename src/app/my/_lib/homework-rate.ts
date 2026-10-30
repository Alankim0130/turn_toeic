import { kstDayMinute } from "@/lib/homework-day";
import { homeworkTermRates, type HomeworkMonthRate, type RateSection } from "@/lib/homework-rate";
import type { MyOrder, MySession } from "./queries";

/**
 * 학생 화면의 **이번 달 숙제 제출률** (2026-10-30 — "숙제 달성률 이런거 보면 본인이 이번달에 얼마나 열씨미 했는지도 볼수있게").
 * 숙제제출(`/my/homework`) · 마이페이지가 **이미 읽은 것**(내 수업일 · 내 등록 · 내 숙제 · 기한)으로 센다 — 조회를 늘리지 않는다.
 * 계산은 `src/lib/homework-rate.ts` 한곳 — 강사 화면(학생 관리 · 숙제 미제출 알림)과 같은 숫자다.
 *
 * `terms` = 지금 수강 중인 기수(개강일 ~ 종강일 — `getMyStudyEligibility().accessTerms`)만 — 학생은 지난 달 반의 수업일을 못 읽는다(RLS),
 * 그리고 "이번 달" 이다. 2주완성은 앞 절반이 끝나면 그 달 카드가 사라진다 (그 뒤로는 숙제를 낼 수 없다).
 * `sessions` 는 내 반만(`my_section_ids()` · `my_schedule_section_ids()`), `orders` 는 내 등록(`user_id`)이라 이미 좁혀져 있다 (CLAUDE.md 등급 체계 10).
 */
export function myHomeworkRates(input: {
  sessions: readonly MySession[];
  orders: readonly MyOrder[];
  /** 반 → 품은 반 (`getMySectionIncludes` — DB `term_section_includes`) */
  includes: ReadonlyMap<number, ReadonlySet<number>>;
  submissions: readonly { class_date: string | null; level: number | null; subject: string | null }[];
  /** 수업일 → 기한 날짜 (`getHomeworkDueDates`) */
  due: ReadonlyMap<string, string | null>;
  /** 교재 레벨 목록 (`getHomeworkLevels`) */
  levels: readonly number[];
  terms: ReadonlySet<number>;
  now?: number;
}): HomeworkMonthRate[] {
  // 내 반(직접 배정 + 품은 반)과 그 반의 이번 달 수업일 — 수업일 줄마다 반이 붙어 온다
  const sectionOf = new Map<number, NonNullable<MySession["section"]>>();
  const datesOf = new Map<number, string[]>();
  for (const s of input.sessions) {
    const sec = s.section;
    if (!sec || !input.terms.has(sec.term_id)) continue;
    sectionOf.set(sec.id, sec);
    datesOf.set(sec.id, [...(datesOf.get(sec.id) ?? []), s.date]);
  }
  const sections = new Map<number, RateSection>();
  const termOf = new Map<number, { year: number; month: number }>();
  for (const [id, sec] of sectionOf) {
    sections.set(id, {
      id,
      termId: sec.term_id,
      track: sec.track,
      level: sec.course?.target_score ?? null,
      subject: sec.subject,
      opens: sec.enrollment_opens_at,
      closes: sec.closes_at,
      dates: (datesOf.get(id) ?? []).sort(),
    });
    if (sec.term) termOf.set(sec.term_id, sec.term);
  }

  // 직접 배정 — 살아 있는 배정, 이번 달 반만 (배정일은 한국 날짜)
  const enrollments = input.orders.flatMap((o) =>
    o.enrollments.flatMap((e) => {
      if (e.status !== "active" || !e.section || !input.terms.has(e.section.term_id) || !sections.has(e.section.id)) return [];
      const from = kstDayMinute(e.created_at)?.day;
      return from ? [{ sectionId: e.section.id, from }] : [];
    }),
  );
  if (enrollments.length === 0) return [];

  const includes = new Map<number, number[]>();
  for (const [parent, set] of input.includes) includes.set(parent, [...set]);

  return homeworkTermRates({
    now: input.now,
    due: input.due,
    sections,
    includes,
    enrollments,
    submissions: input.submissions.flatMap((s) => (s.class_date && s.level != null && s.subject ? [{ date: s.class_date, level: s.level, subject: s.subject }] : [])),
    levels: input.levels,
  }).map((r) => {
    const term = termOf.get(r.termId) ?? { year: Number(r.opens.slice(0, 4)), month: Number(r.opens.slice(5, 7)) };
    return { ...r, year: term.year, month: term.month };
  });
}
