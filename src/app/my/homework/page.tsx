import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/ui/EmptyState";
import { HomeworkCalendar, type HomeworkDay, type HomeworkMonth } from "@/components/my/homework/HomeworkCalendar";
import { SubmissionCard } from "@/components/my/homework/SubmissionCard";
import type { CalendarMark } from "@/components/my/MonthCalendar";
import { requireUser } from "@/lib/auth";
import { initialDay, initialMonth } from "@/lib/class-day";
import { levelsOfDay } from "@/lib/homework";
import { todayKST } from "@/lib/utils";
import { getHomeworkLevels, getMyHomework, getMySessions } from "../_lib/queries";

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
  const [{ user }, sessions, levels, mine] = await Promise.all([
    requireUser("/my/homework"),
    getMySessions(),
    getHomeworkLevels(),
    getMyHomework(),
  ]);
  const today = todayKST();

  // 같은 날 여러 반이 내려온다 (주5일 60분 둘 · 스파르타 셋) — 날짜로 묶어 레벨을 모은다
  const byDate = new Map<string, { courses: Set<string>; list: Course[]; track: string }>();
  for (const s of sessions) {
    const sec = s.section;
    if (!sec) continue;
    const b = byDate.get(s.date) ?? { courses: new Set<string>(), list: [], track: sec.track };
    if (sec.course?.name) b.courses.add(sec.course.name);
    b.list.push(sec.course ?? null);
    byDate.set(s.date, b);
  }

  const days: HomeworkDay[] = [...byDate.entries()]
    .map(([date, b]) => ({
      date,
      course: [...b.courses].join(" · ") || "수업",
      // lc_levels 에 없는 레벨은 뺀다 — 제출이 FK(23503)로 튕긴다
      levels: levelsOfDay(b.list).filter((l) => levels.includes(l)),
    }))
    .filter((d) => d.levels.length > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  // 달력 칸에는 그 날 낸 건수를 적는다 — 어느 날이 남았는지 한눈에 보이게
  const submittedOn = new Map<string, number>();
  for (const s of mine) if (s.class_date) submittedOn.set(s.class_date, (submittedOn.get(s.class_date) ?? 0) + 1);

  const groups = new Map<string, { year: number; month: number; marks: CalendarMark[]; dates: string[] }>();
  for (const d of days) {
    const year = Number(d.date.slice(0, 4));
    const month = Number(d.date.slice(5, 7));
    const key = `${year}-${String(month).padStart(2, "0")}`;
    const g = groups.get(key) ?? { year, month, marks: [], dates: [] };
    const n = submittedOn.get(d.date) ?? 0;
    g.marks.push({
      date: d.date,
      // 달력 색은 내 시간표와 같다 — 월수금 분홍 · 화목금 잉크 (도메인 규칙 1)
      track: byDate.get(d.date)?.track ?? "mwf",
      label: n > 0 ? `제출 ${n}` : d.levels.join("·"),
    });
    g.dates.push(d.date);
    groups.set(key, g);
  }

  const months: HomeworkMonth[] = [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, g]) => ({ year: g.year, month: g.month, marks: g.marks, initial: initialDay(g.dates, today) }));

  if (months.length === 0) {
    return (
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
      <HomeworkCalendar
        userId={user.id}
        today={today}
        months={months}
        days={days}
        submissions={mine}
        startIndex={initialMonth(months, today)}
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

      <p className="text-center text-xs text-mist">
        비대면 스터디 인증은 다른 곳이에요 —{" "}
        <Link href="/my/study" className="font-bold text-brand-600 underline decoration-brand-200 underline-offset-2">
          내 스터디
        </Link>
        에서 날짜마다 인증해 주세요.
      </p>
    </div>
  );
}
