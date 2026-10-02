import { AttendanceMark } from "@/components/ui/AttendanceMark";
import { MARK_STYLE, monthCells, type MarkKind } from "@/lib/attendance-board";
import { monthHolidayNames } from "@/lib/holidays";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export type CalendarStamp = { date: string; kind: MarkKind; label: string };

/**
 * 내 출석 달력 — 수업한 날마다 출석 도장 (2026-10-01 Alan — "학생들이 스스로 출석을 계속 하고 있다는 걸 알고 뿌듯함을 느끼게").
 * 도장은 강사 출석 격자와 같은 `AttendanceMark` 다 (출석 = 핫핑크 체크). 넓은 화면에는 도장 아래 이름도 적는다.
 * 수업이 없는 날은 날짜만 흐리게. 서버 컴포넌트 — 누를 곳이 없다 (기록은 아래 목록에 있다).
 */
export function AttendanceCalendar({ year, month, stamps, today }: { year: number; month: number; stamps: CalendarStamp[]; today: string }) {
  const byDate = new Map<string, CalendarStamp[]>();
  for (const s of stamps) byDate.set(s.date, [...(byDate.get(s.date) ?? []), s]);
  const cells = monthCells(year, month);
  // 공휴일 · 대체공휴일은 일요일처럼 칠하고 이름을 적는다 (2026-10-02 Alan — 반 편성 달력과 같은 규칙)
  const holidays = monthHolidayNames(year, month);

  return (
    <div className="card overflow-hidden">
      <div className="border-b border-line bg-brand-50/60 px-4 py-3">
        <p className="font-black text-ink">
          {year}년 {month}월
        </p>
      </div>
      <div className="grid grid-cols-7 border-b border-line text-center text-xs font-bold text-mist">
        {WEEKDAYS.map((w, i) => (
          <div key={w} className={cn("py-2", i === 0 && "text-brand-500")}>
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((c, i) => {
          const list = c ? byDate.get(c.date) ?? [] : [];
          const isToday = c?.date === today;
          const names = c ? holidays.get(c.date) : undefined;
          return (
            <div key={i} className={cn("flex min-h-16 flex-col items-center border-b border-r border-line/70 px-0.5 py-1 sm:min-h-[4.75rem]", (i + 1) % 7 === 0 && "border-r-0")}>
              {c && (
                <>
                  <span
                    className={cn(
                      "inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold",
                      isToday ? "bg-ink text-white" : list.length ? "text-ink" : i % 7 === 0 || names ? "text-brand-400" : "text-mist",
                    )}
                  >
                    {c.day}
                  </span>
                  {names && (
                    <span className="line-clamp-2 text-center text-[9px] font-bold leading-[1.15] text-brand-500 sm:line-clamp-1 sm:text-[10px] sm:leading-tight">
                      {names.join("·")}
                    </span>
                  )}
                  <span className="mt-1 flex flex-col items-center gap-0.5">
                    {list.map((s, j) => (
                      <span key={j} className="flex flex-col items-center">
                        <AttendanceMark kind={s.kind} label={s.label} />
                        <span className="hidden text-[10px] font-bold text-slate sm:block">{MARK_STYLE[s.kind].label}</span>
                      </span>
                    ))}
                  </span>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
