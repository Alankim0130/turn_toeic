"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { MonthCalendar, type CalendarMark } from "@/components/my/MonthCalendar";
import { SUBJECT_LABEL } from "@/lib/instructor-subject";
import type { ClassHour } from "@/lib/class-hours";
import { cn, formatDate, RECORDED_LABEL, RECORDED_NOTE } from "@/lib/utils";

/** 수업일 한 줄. 서버가 다 만들어서 넘긴다 (Map·중첩 객체를 클라이언트로 넘기지 않는다) */
export type DayRow = {
  id: number;
  seq: number;
  date: string;
  time: string | null;
  track: string;
  mwf: boolean;
  course: string;
  recorded: boolean;
  next: boolean;
  hours: ClassHour[];
};

export type LectureRow = { id: number; date: string; title: string; lecturer: string | null; signed: boolean };

/**
 * 한 달치 달력 + 그 달 수업일 (2026-09-17 Alan 요청 — "해당 날짜에 해당되는것만 보여줘").
 *
 * 한 달을 통째로 쌓으면 주5일은 18줄이라 휴대폰에서 스크롤만 하게 된다. 그래서 **달력에서 고른 날짜의
 * 수업만** 보여 주고, 처음 고르는 날짜는 `initialDay`(오늘 → 다음 수업일 → 마지막 수업일)가 정한다.
 * 한 달을 훑어보는 길은 **전체 보기**로 남겨 둔다 — 없애면 "이번 달 몇 번 오지?" 를 볼 데가 사라진다.
 */
export function MonthSchedule({
  year,
  month,
  today,
  marks,
  days,
  lectures,
  initial,
}: {
  year: number;
  month: number;
  today: string;
  marks: CalendarMark[];
  days: DayRow[];
  lectures: LectureRow[];
  initial: string | null;
}) {
  const [picked, setPicked] = useState<string | null>(initial);

  const shownDays = picked ? days.filter((d) => d.date === picked) : days;
  const shownLectures = picked ? lectures.filter((l) => l.date === picked) : lectures;
  const empty = shownDays.length === 0 && shownLectures.length === 0;

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[1.1fr_1fr]">
      <MonthCalendar year={year} month={month} marks={marks} today={today} selected={picked} onSelect={setPicked} />

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-brand-50/60 px-4 py-3">
          <p className="min-w-0 flex-1 font-black text-ink" aria-live="polite">
            {picked ? (
              <>
                {formatDate(picked)}
                {picked === today && <span className="ml-2 text-sm font-black text-brand-600">오늘</span>}
              </>
            ) : (
              <>
                {year}년 {month}월 수업일 <span className="text-sm font-semibold text-slate">· {days.length}회</span>
                {lectures.length > 0 && <span className="text-sm font-semibold text-violet-700"> · 특강 {lectures.length}개</span>}
              </>
            )}
          </p>
          <button
            type="button"
            onClick={() => setPicked(picked ? null : initial)}
            className="shrink-0 rounded-full border border-line bg-paper px-3 py-1 text-xs font-bold text-ink-soft transition hover:border-brand-300 hover:text-brand-600"
          >
            {picked ? `이 달 전체 ${days.length}회` : "날짜별로 보기"}
          </button>
        </div>

        {empty ? (
          <p className="px-4 py-6 text-sm text-slate">이 날은 수업이 없어요. 달력에서 표시된 날짜를 눌러 보세요.</p>
        ) : (
          <ol className="divide-y divide-line">
            {shownDays.map((s) => {
              const isToday = s.date === today;
              const isNext = s.next && !isToday;
              const past = s.date < today;
              return (
                <li
                  key={s.id}
                  className={cn(
                    "flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm",
                    isToday && "bg-brand-50",
                    isNext && !picked && "bg-surface",
                    past && !isToday && "opacity-55",
                  )}
                >
                  <span className="w-12 font-black text-brand-600">{s.seq}회차</span>
                  {/* 날짜를 고른 상태에서는 제목이 이미 그 날짜다 — 같은 말을 두 번 적지 않는다 */}
                  {!picked && <span className="font-semibold text-ink">{formatDate(s.date)}</span>}
                  {s.time && <span className="tabular-nums text-slate">{s.time}</span>}
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold text-white", s.mwf ? "bg-brand-500" : "bg-ink")}>{s.track}</span>
                  <span className="text-slate">{s.course}</span>
                  {/* 저녁반 화목금은 인강 — 교실에 나오지 않는다 (2026-09-17 Alan) */}
                  {s.recorded && (
                    <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-black text-violet-800" title={RECORDED_NOTE}>
                      {RECORDED_LABEL}
                    </span>
                  )}
                  {isToday && !picked && <span className="ml-auto rounded-full bg-brand-500 px-2 py-0.5 text-xs font-black text-white">오늘</span>}
                  {isNext && !picked && <span className="ml-auto rounded-full bg-ink px-2 py-0.5 text-xs font-black text-white">다음 수업</span>}
                  {s.recorded && <span className="basis-full pl-12 text-xs text-violet-700">{RECORDED_NOTE}</span>}
                  {s.hours.length > 0 && (
                    <div className="basis-full pl-12">
                      <p className="text-xs font-bold text-mist">함께 듣는 시간</p>
                      <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                        {s.hours.map((p) => (
                          <li key={`${p.course}|${p.block}`} className="flex items-center gap-1.5 text-xs">
                            <span className="tabular-nums font-bold text-ink-soft">{p.block}</span>
                            {p.subject && (
                              <span className={cn("rounded px-1.5 py-0.5 text-[0.65rem] font-black", p.subject === "lc" ? "bg-brand-100 text-brand-700" : "bg-ink/10 text-ink-soft")}>
                                {SUBJECT_LABEL[p.subject]}
                              </span>
                            )}
                            {p.course && p.course !== s.course && <span className="text-mist">{p.course}</span>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}

        {shownLectures.length > 0 && (
          <div className="border-t border-line">
            <p className="bg-violet-50/60 px-4 py-2 text-sm font-black text-violet-800">
              <Icon name="bolt" size={14} className="mr-1 inline" />
              특강 · 모의고사
            </p>
            <ul className="divide-y divide-line">
              {shownLectures.map((l) => (
                <li
                  key={l.id}
                  className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm", l.date === today && "bg-violet-50", l.date < today && l.date !== today && "opacity-55")}
                >
                  {!picked && <span className="font-semibold text-ink">{formatDate(l.date)}</span>}
                  <span className="min-w-0 flex-1 text-slate">{l.title}</span>
                  {l.signed && <span className="rounded-full bg-brand-500 px-2 py-0.5 text-xs font-bold text-white">신청함</span>}
                  {l.lecturer && <span className="text-xs font-bold text-violet-700">{l.lecturer}</span>}
                  {l.date === today && !picked && <span className="rounded-full bg-violet-600 px-2 py-0.5 text-xs font-black text-white">오늘</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
