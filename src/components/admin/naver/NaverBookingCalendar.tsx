"use client";

import { useId, useMemo, useState } from "react";
import { monthCells } from "@/lib/attendance-board";
import { monthHolidayNames } from "@/lib/holidays";
import { dayDetail, slotClock, slotDay, type CalendarSlot } from "@/lib/naver-booking";
import { cn, formatDate } from "@/lib/utils";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** 예약이 있는 날의 하트 — 도형으로 그린다 (이모지를 쓰지 않는다). 첫토익 달력의 💛 자리 */
export function HeartGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn("fill-current", className)}>
      <path d="M12 21s-7.2-4.6-9.6-9.1C.8 8.7 2.6 4.9 6.3 4.3c2-.3 3.9.6 5.1 2.2 1.2-1.6 3.1-2.5 5.1-2.2 3.7.6 5.5 4.4 3.9 7.6C19.2 16.4 12 21 12 21Z" />
    </svg>
  );
}

function Chevron({ dir }: { dir: "prev" | "next" }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4 fill-none stroke-current" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
      <path d={dir === "prev" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} />
    </svg>
  );
}

/** 예약 줄 앞의 달력 체크 — 첫토익의 event_available 아이콘 자리, 도형으로 */
function BookedGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-5 shrink-0 fill-none stroke-current" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4M9 15l2 2 4-4" />
    </svg>
  );
}

/**
 * 네이버 예약 현황 — 달력 + 고른 날의 예약 (2026-10-13 Alan — 첫토익 "네이버 예약 현황" 화면을 보여 주며 "네이버 예약을 클릭하면 이렇게 보이도록").
 * **구조만 첫토익이고 색은 우리 토큰이다** (관리자 모드라 토스 파랑으로 보인다). 💛 자리는 도형 하트.
 *
 * - 달력은 오늘이 든 달부터 조회 범위가 든 달까지 ‹ › 로 넘긴다 (`calendarMonths`). 예약이 있는 날은 숫자 아래 하트, 오늘은 꽉 찬 동그라미.
 *   **어느 날이든 누를 수 있다** — 빈 날도 "예약이 없어요 · 빈 시간 N개" 처럼 보여 줄 말이 있다 (내 시간표 달력과 다른 점).
 * - 고른 날: `M월 D일 (요일)` + `예약 N건`(인원 합계) → 예약 칸마다 `HH:MM 상담 예약` → `예약 가능 시간: …`(정원이 남은 앞으로의 칸).
 *   예약자가 누구인지는 네이버가 주지 않아 시각 · 인원뿐이다 (도메인 규칙 8).
 * - 칸 기록은 오늘부터 60일, 하루 지난 칸은 지워진다 — 지난 날을 고르면 그렇게 말한다.
 */
export function NaverBookingCalendar({
  today,
  months,
  slots,
}: {
  today: string;
  months: { year: number; month: number }[];
  slots: CalendarSlot[];
}) {
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState(today);
  const base = useId();

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarSlot[]>();
    for (const s of slots) {
      const day = slotDay(s.slot_at);
      map.set(day, [...(map.get(day) ?? []), s]);
    }
    return map;
  }, [slots]);
  const bookedDays = useMemo(() => new Set([...byDay].filter(([, list]) => list.some((s) => s.booking_count > 0)).map(([d]) => d)), [byDay]);

  const view = months[idx] ?? months[0];
  if (!view) return null;
  const { year, month } = view;
  const multi = months.length > 1;
  const cells = monthCells(year, month);
  const holidays = monthHolidayNames(year, month);
  const detail = dayDetail(byDay.get(picked) ?? []);
  const pickedPast = picked < today;
  const dayTitleId = `${base}-day`;

  const goTo = (next: number) => {
    if (next < 0 || next >= months.length) return;
    setIdx(next);
    // 오늘이 든 달로 돌아오면 오늘, 다른 달은 1일 — 고른 날이 보이는 달 안에 있어야 아래 목록이 달력과 맞는다
    const m = months[next];
    const first = `${m.year}-${String(m.month).padStart(2, "0")}-01`;
    setPicked(today.startsWith(first.slice(0, 7)) ? today : first);
  };

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[1.1fr_1fr]">
      <section aria-label="예약 달력" className="card overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2.5 sm:px-4">
          <button
            type="button"
            onClick={() => goTo(idx - 1)}
            disabled={!multi || idx === 0}
            aria-label="이전 달"
            className="flex size-8 items-center justify-center rounded-full text-ink transition hover:bg-brand-50 disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <Chevron dir="prev" />
          </button>
          <p className="font-black tabular-nums text-ink" aria-live="polite">
            {year}년 {month}월
          </p>
          <button
            type="button"
            onClick={() => goTo(idx + 1)}
            disabled={!multi || idx === months.length - 1}
            aria-label="다음 달"
            className="flex size-8 items-center justify-center rounded-full text-ink transition hover:bg-brand-50 disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <Chevron dir="next" />
          </button>
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
            const box = cn("flex min-h-14 flex-col items-center border-b border-r border-line/70 px-0.5 py-1.5 sm:min-h-16", (i + 1) % 7 === 0 && "border-r-0");
            if (!c) return <div key={i} className={box} />;
            const isToday = c.date === today;
            const on = c.date === picked;
            const names = holidays.get(c.date);
            const has = bookedDays.has(c.date);
            const total = has ? dayDetail(byDay.get(c.date) ?? []).total : 0;
            return (
              <button
                key={i}
                type="button"
                aria-pressed={on}
                aria-label={`${month}월 ${c.day}일${names ? ` ${names.join("·")}` : ""}${has ? ` 예약 ${total}건` : ""}`}
                onClick={() => setPicked(c.date)}
                className={cn(box, "transition hover:bg-brand-50/70", on && "bg-brand-50 ring-2 ring-inset ring-brand-400")}
              >
                <span
                  className={cn(
                    "inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold tabular-nums",
                    isToday ? "bg-brand-500 text-white" : i % 7 === 0 || names ? "text-brand-500" : c.date < today ? "text-mist" : "text-ink",
                  )}
                >
                  {c.day}
                </span>
                {names && (
                  <span className="line-clamp-1 text-[9px] font-bold leading-tight text-brand-600 sm:text-[10px]">{names.join("·")}</span>
                )}
                {/* 예약이 있는 날 — 첫토익의 하트 (도형) */}
                {has && <HeartGlyph className="mt-0.5 size-3.5 text-brand-500" />}
              </button>
            );
          })}
        </div>
      </section>

      <section aria-labelledby={dayTitleId} className="card p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 id={dayTitleId} className="text-[15px] font-black text-ink" aria-live="polite">
            {formatDate(picked)}
          </h2>
          {picked === today && <span className="text-xs font-black text-brand-600">오늘</span>}
          {detail.total > 0 && <span className="rounded-md bg-brand-50 px-2 py-0.5 text-[11.5px] font-black text-brand-700">예약 {detail.total}건</span>}
        </div>

        {!detail.collected ? (
          <p className="rounded-xl border border-line bg-white px-4 py-4 text-[12.5px] text-slate">
            {pickedPast ? "지난 날이에요. 예약 칸 기록은 하루가 지나면 지워져요." : "이 날은 상담 운영일이 아니거나 아직 확인한 칸이 없어요."}
          </p>
        ) : detail.booked.length === 0 ? (
          <p className="rounded-xl border border-line bg-white px-4 py-4 text-[12.5px] text-slate">이 날은 예약이 없어요 · 빈 시간 {detail.available.length}개</p>
        ) : (
          <ul className="space-y-1.5">
            {detail.booked.map((s) => (
              <li key={s.slot_at} className="flex items-center gap-2.5 rounded-xl border border-brand-200 bg-brand-50 px-3.5 py-3 text-brand-600">
                <BookedGlyph />
                <span className="text-sm font-black text-ink tabular-nums">{slotClock(s.slot_at)} 상담 예약</span>
                {/* 정원이 2명이라 한 칸에 둘이 잡힐 수 있다 — 그때만 인원을 적는다 */}
                {s.booking_count > 1 && <span className="ml-auto text-xs font-bold text-slate">{s.booking_count}명</span>}
              </li>
            ))}
          </ul>
        )}

        {detail.collected && detail.available.length > 0 && (
          <p className="mt-3 text-xs leading-relaxed text-slate">
            · 예약 가능 시간:{" "}
            <span className="tabular-nums">{detail.available.map((s) => slotClock(s.slot_at)).join("  ")}</span>
          </p>
        )}
      </section>
    </div>
  );
}
