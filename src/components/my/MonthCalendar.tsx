import { cn } from "@/lib/utils";

/**
 * track: `mwf`(월수금, 분홍) · `ttf`(화목금, 잉크) 는 수업일, `lecture` 는 특강(보라).
 * **주5일 학생도 두 색으로 나눠 칠한다** (2026-09-17 Alan — 그 전에는 `mine` 한 색이었다).
 */
export type CalendarMark = { date: string; label: string; track: string };

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/**
 * 월 달력. date 는 "YYYY-MM-DD".
 *
 * `onSelect` 를 주면 **수업·특강이 있는 날만 누를 수 있는 버튼**이 된다 (2026-09-17 Alan 요청 —
 * 내 시간표에서 고른 날짜의 수업만 보여 준다). 빈 날은 눌러도 보여 줄 것이 없어 버튼으로 만들지 않는다 —
 * 눌리는데 아무 일도 없으면 고장난 것처럼 보인다. `onSelect` 가 없으면 예전처럼 보여 주기만 한다.
 */
export function MonthCalendar({
  year,
  month,
  marks,
  today,
  selected,
  onSelect,
}: {
  year: number;
  month: number;
  marks: CalendarMark[];
  today: string;
  selected?: string | null;
  onSelect?: (date: string) => void;
}) {
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
        {/* 있는 것만 적는다 */}
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold text-slate">
          {marks.some((m) => m.track === "mwf") && (
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-brand-500" />월수금</span>
          )}
          {marks.some((m) => m.track === "ttf") && (
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-ink" />화목금</span>
          )}
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
          const on = !!c && c.date === selected;
          const pickable = !!c && !!onSelect && ms.length > 0;
          const inner = c && (
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
                      m.track === "ttf" ? "bg-ink" : m.track === "lecture" ? "bg-violet-500" : "bg-brand-500",
                      past && !on && "opacity-40",
                    )}
                  >
                    <span className="hidden truncate sm:block">{m.label}</span>
                  </span>
                ))}
              </div>
            </>
          );
          const box = cn(
            "min-h-14 border-b border-r border-line/70 p-1 text-left sm:min-h-16",
            (i + 1) % 7 === 0 && "border-r-0",
            on && "bg-brand-50 ring-2 ring-inset ring-brand-400",
          );
          if (pickable) {
            return (
              <button
                key={i}
                type="button"
                aria-pressed={on}
                aria-label={`${month}월 ${c.day}일 수업 보기`}
                onClick={() => onSelect(c.date)}
                className={cn(box, "transition hover:bg-brand-50/70")}
              >
                {inner}
              </button>
            );
          }
          return (
            <div key={i} className={box}>
              {inner}
            </div>
          );
        })}
      </div>
    </div>
  );
}
