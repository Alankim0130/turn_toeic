import type { Metadata } from "next";
import { EmptyState } from "@/components/ui/EmptyState";
import { HomeworkAlertCard } from "@/components/my/homework/HomeworkAlertCard";
import { HomeworkCalendar, type HomeworkDay, type HomeworkMonth } from "@/components/my/homework/HomeworkCalendar";
import { SubmissionCard } from "@/components/my/homework/SubmissionCard";
import type { CalendarMark } from "@/components/my/MonthCalendar";
import { requireUser } from "@/lib/auth";
import { initialMonth } from "@/lib/class-day";
import { levelsOfDay } from "@/lib/homework";
import { classNotStartedYet, type DaySection, expectedSlotsOfDay, firstClassStart, homeworkStartDay, kstDayMinute, minuteLabel, sentKey } from "@/lib/homework-day";
import { studentDue } from "@/lib/homework-missing";
import { formatDate, todayKST } from "@/lib/utils";
import { getHomeworkDueDates, getHomeworkLevels, getMyHomework, getMyHomeworkAlert, getMyOrders, getMySessions, getMyStudyEligibility } from "../_lib/queries";

export const metadata: Metadata = {
  title: "숙제업로드",
  robots: { index: false },
};

type Course = { target_score?: number | null; includes_levels?: number[] | null } | null;

/**
 * 숙제업로드 — **달력에서 수업 날짜를 고른다** (2026-09-19 Alan).
 *
 * 줄은 여기(서버)에서 다 만들어 넘긴다 — 클라이언트로는 Map·중첩 객체가 못 넘어가고,
 * 넘길 수 있더라도 반·기수 전체를 실어 보낼 이유가 없다 (내 시간표와 같은 규칙).
 */
export default async function HomeworkPage() {
  const [{ user }, sessions, levels, mine, { opensOn, untilByTerm }, alertOn, orders] = await Promise.all([
    requireUser("/my/homework"),
    getMySessions(),
    getHomeworkLevels(),
    getMyHomework(),
    getMyStudyEligibility(),
    getMyHomeworkAlert(),
    getMyOrders(),
  ]);
  const today = todayKST();

  // 같은 날 여러 반이 내려온다 (주5일 60분 둘 · 스파르타 셋) — 날짜로 묶어 레벨을 모은다
  // until = 그 날짜를 낼 수 있는 마지막 날 — 그 기수 내 반(직접 배정)의 가장 늦은 종강일. 그 다음 날부터는 그 날짜 숙제를 낼 수 없다
  // (RLS `has_term_access` · 제출 서버 액션의 `my_section_ids()`). 2주완성은 앞 절반 마지막 날 (2026-10-29)
  // sections — 그 날 내 반(레벨 · 과목 칸 · 시간대 · 인강) — 낼 숙제 칸과 첫 수업 시작을 안다 (`homework-day.ts`, 2026-10-30)
  const byDate = new Map<string, { courses: Set<string>; list: Course[]; track: string; until: string | null; sections: DaySection[] }>();
  for (const s of sessions) {
    const sec = s.section;
    if (!sec) continue;
    const b = byDate.get(s.date) ?? { courses: new Set<string>(), list: [], track: sec.track, until: null, sections: [] };
    if (sec.course?.name) b.courses.add(sec.course.name);
    b.list.push(sec.course ?? null);
    b.sections.push({ level: sec.course?.target_score ?? null, subject: sec.subject, timeBlock: sec.time_block, recorded: sec.recorded });
    const until = untilByTerm.get(sec.term_id) ?? null;
    if (until && (!b.until || until > b.until)) b.until = until;
    byDate.set(s.date, b);
  }

  // 숙제 기한 = 같은 트랙의 다음 수업일 오후 5시 (2026-10-14 Alan) — 날짜는 반 편성 달력에서. 못 읽으면 기한 줄을 그리지 않는다
  const due = await getHomeworkDueDates([...byDate.keys()]);
  // 그 날 낼 숙제 칸 ("레벨|과목") — 처음 고르는 날(`homeworkStartDay`)이 "다 냈나" 를 본다. 화면으로는 넘기지 않는다
  const expectOf = new Map<string, string[]>();
  const days: HomeworkDay[] = [...byDate.entries()]
    .map(([date, b]): HomeworkDay => {
      // lc_levels 에 없는 레벨은 뺀다 — 제출이 FK(23503)로 튕긴다
      const dayLevels = levelsOfDay(b.list).filter((l) => levels.includes(l));
      const starts = firstClassStart(b.sections);
      expectOf.set(date, expectedSlotsOfDay(dayLevels, b.sections));
      return {
        date,
        course: [...b.courses].join(" · ") || "수업",
        levels: dayLevels,
        // 기한 — 내 수업 기간이 먼저 끝나면 그 마지막 날까지 (`studentDue`, 2026-10-29)
        ...(due ? studentDue(due.get(date) ?? null, b.until) : {}),
        // 오늘 수업이 아직 시작 전이면 — 지난 수업 숙제를 이 날짜로 잘못 내지 않게 화면이 말한다 (2026-10-30)
        ...(date === today && starts != null && classNotStartedYet(starts) ? { startsAt: minuteLabel(starts) } : {}),
      };
    })
    .filter((d) => d.levels.length > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  // 달력 칸에는 그 날 낸 건수를 적는다 — 어느 날이 남았는지 한눈에 보이게
  const submittedOn = new Map<string, number>();
  const sent = new Set<string>();
  for (const s of mine) {
    if (!s.class_date) continue;
    submittedOn.set(s.class_date, (submittedOn.get(s.class_date) ?? 0) + 1);
    if (s.level != null && s.subject) sent.add(sentKey(s.class_date, s.level, s.subject));
  }
  // 배정일 — 그 앞의 수업은 내 것이 아니었다 (지금 배정 중 가장 이른 것, 한국 날짜)
  const from =
    orders
      .filter((o) => o.status === "active" || o.status === "preliminary")
      .flatMap((o) => o.enrollments.filter((e) => e.status === "active").map((e) => kstDayMinute(e.created_at)?.day ?? null))
      .filter((d): d is string => !!d)
      .sort()[0] ?? null;

  /**
   * 처음 고르는 날 = **숙제를 낼 수업** (2026-10-30 — `homeworkStartDay`): 기한이 안 지났고 다 내지 않은 가장 이른 수업일 → 오늘까지의 마지막 수업일.
   * 예전(`initialDay`)에는 수업이 없는 날 **다음 수업일**이, 기한 날 오전에는 **오늘**이 골라져 지난 수업 숙제가 그 날짜로 저장됐다 (문라경 학생 — `homework-day.ts` 머리말).
   * 달마다도 같은 규칙으로 고르고, 처음 여는 달은 그 날이 든 달이다 (다음 달 초에도 지난달 마지막 수업 숙제가 남았으면 지난달이 열린다)
   */
  const startOf = (list: readonly HomeworkDay[]) =>
    homeworkStartDay(
      list.map((d) => ({ ...d, expect: expectOf.get(d.date) ?? [] })),
      sent,
      today,
      from,
    );

  const groups = new Map<string, { year: number; month: number; marks: CalendarMark[]; days: HomeworkDay[] }>();
  for (const d of days) {
    const year = Number(d.date.slice(0, 4));
    const month = Number(d.date.slice(5, 7));
    const key = `${year}-${String(month).padStart(2, "0")}`;
    const g = groups.get(key) ?? { year, month, marks: [], days: [] };
    const n = submittedOn.get(d.date) ?? 0;
    g.marks.push({
      date: d.date,
      // 달력 색은 내 시간표와 같다 — 월수금 분홍 · 화목금 잉크 (도메인 규칙 1)
      track: byDate.get(d.date)?.track ?? "mwf",
      label: n > 0 ? `제출 ${n}` : d.levels.join("·"),
    });
    g.days.push(d);
    groups.set(key, g);
  }

  const start = startOf(days);
  const months: HomeworkMonth[] = [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, g]) => ({ year: g.year, month: g.month, marks: g.marks, initial: startOf(g.days) }));
  const startMonth = start ? months.findIndex((m) => m.year === Number(start.slice(0, 4)) && m.month === Number(start.slice(5, 7))) : -1;

  if (months.length === 0) {
    /**
     * 개강 전 배정이 있으면 "반에 배정되면" 이 아니라 **개강일을 적어 준다** (2026-10-02 Alan — 10월 반에 배정된 채 개강 전에 들어와
     * "반배정은 되어있잖아? 이런 메시지가 나오면 안되는거 아냐?"). 숙제는 개강일부터라 그 전에는 달력을 그리지 않는다 (LC음원과 같은 규칙).
     */
    const opens = [...opensOn.values()].sort()[0];
    return opens ? (
      <EmptyState
        icon="homework"
        title="개강일부터 올릴 수 있어요"
        description={`${formatDate(opens)} 개강부터 여기에 내 수업 달력이 나오고, 날짜를 눌러 그 날 숙제를 올릴 수 있어요.`}
        action={{ href: "/my/class", label: "내 시간표 보기" }}
      />
    ) : (
      <EmptyState
        icon="homework"
        title="아직 수업일이 없어요"
        description="반에 배정되면 여기에 내 수업 달력이 나오고, 날짜를 눌러 그 날 숙제를 올릴 수 있어요."
        action={{ href: "/my/class", label: "내 시간표 보기" }}
      />
    );
  }

  return (
    <div className="space-y-8">
      {/* 숙제 미제출 알림 (2026-10-15 Alan) — 기본으로 받고, 스위치로 끈 학생만 선생님의 미제출 알림 명단에서 빠진다 (2026-10-23 부터 켜고 끄는 스위치) */}
      <HomeworkAlertCard on={alertOn} />

      <HomeworkCalendar
        userId={user.id}
        today={today}
        months={months}
        days={days}
        submissions={mine}
        startIndex={startMonth >= 0 ? startMonth : initialMonth(months, today)}
      />

      {mine.length > 0 && (
        <details className="group rounded-xl2 border border-dashed border-line px-4 py-3">
          <summary className="cursor-pointer list-none text-sm font-bold text-slate transition hover:text-brand-600">
            <span className="mr-1 inline-block transition group-open:rotate-90">▸</span>
            지금까지 낸 숙제 전체 보기 ({mine.length})
          </summary>
          <ul className="mt-3 grid gap-4 lg:grid-cols-2">
            {mine.map((s) => (
              <li key={s.id}>
                <SubmissionCard submission={s} />
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* 비대면 스터디 인증(내 스터디)으로 가는 안내를 두지 않는다 — 두 일은 서로 다른 페이지에서 따로 관리한다 (2026-09-23 Alan
          "숙제랑 비대면 인증은 다른페이지에서 분리해서 관리해야하니 연결안지었으면 좋겠어"). 이 화면 머리글이 "정규 수업 숙제예요" 라고 말한다 */}
    </div>
  );
}
