import { cn } from "@/lib/utils";

/** track: 'mwf' | 'ttf' 는 수업일, 'lecture' 는 특강 */
export type CalendarMark = { date: string; label: string; track: string };

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** 서버에서 렌더되는 간단한 월 달력. date 는 "YYYY-MM-DD". */
export function MonthCalendar({ year, month, marks, today }: { year: number; month: number; marks: CalendarMark[]; today: string }) {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const firstWeekday = first.getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const byDate = new Map<string, CalendarMark[]>();
  for (const m of marks) byDate.set(m.date, [...(byDate.get(m.date) ?? []), m]);

  const cells: Array<{ day: number; date: string } | null> = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, date: `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}` });
  }
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-line bg-brand-50/60 px-4 py-3">
        <p className="font-black text-ink">
          {year}년 {month}월
        </p>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold text-slate">
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-brand-500" />월수금</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-ink" />화목금</span>
          {marks.some((m) => m.track === "lecture") && (
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-violet-500" />특강</span>
          )}
        </div>
      </div>
      <div className="grid grid-cols-7 border-b border-line text-center text-xs font-bold text-mist">
        {WEEKDAYS.map((w, i) => (
          <div key={w} className={cn("py-2", i === 0 && "text-brand-500")}>{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((c, i) => {
          const ms = c ? byDate.get(c.date) ?? [] : [];
          const isToday = c?.date === today;
          const past = c ? c.date < today : false;
          return (
            <div key={i} className={cn("min-h-14 border-b border-r border-line/70 p-1 sm:min-h-16", (i + 1) % 7 === 0 && "border-r-0")}>
              {c && (
                <>
                  <span
                    className={cn(
                      "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold",
                      isToday ? "bg-brand-500 text-white" : i % 7 === 0 ? "text-brand-500" : past ? "text-mist" : "text-ink",
                    )}
                  >
                    {c.day}
                  </span>
                  <div className="mt-0.5 flex flex-wrap gap-0.5">
                    {ms.map((m, j) => (
                      <span
                        key={j}
                        title={m.label}
                        className={cn(
                          "block h-1.5 w-full max-w-8 rounded-full sm:h-auto sm:max-w-none sm:px-1 sm:py-0.5 sm:text-[10px] sm:font-bold sm:text-white",
                          m.track === "mwf" ? "bg-brand-500" : m.track === "lecture" ? "bg-violet-500" : "bg-ink",
                          past && "opacity-40",
                        )}
                      >
                        <span className="hidden truncate sm:block">{m.label}</span>
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
