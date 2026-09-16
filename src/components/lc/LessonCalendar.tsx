"use client";

import { useMemo, useState } from "react";
import { AudioPlayer } from "@/components/lc/AudioPlayer";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";
import { AUDIO_KIND_HINT, AUDIO_KIND_LABEL } from "@/lib/lc-audio";
import { WEEKDAY_KO, coveringGrid, labelKo, parseYmd } from "@/components/admin/sections/dates";

export type LessonTrack = { id: number; kind: string; label: string | null; file_name: string };
export type LessonSlot = { day: number; lessonNo: number; date: string | null; lesson: LessonTrack[]; homework: LessonTrack[] };

/**
 * 수업일 달력에서 날짜를 고르면 그 강의 수업 음원·숙제 음원을 보여 준다 (2026-09-16 Alan 요청).
 * 학생은 "몇 강" 보다 "무슨 요일 수업" 으로 기억하므로 달력이 찾기 쉽다.
 * 날짜가 아직 없는 경우(반 배정 전·강사 미리보기)에는 강 버튼으로 고른다.
 */
export function LessonCalendar({
  slots,
  year,
  month,
  today,
  holidays,
  trackLabel,
}: {
  slots: LessonSlot[];
  year: number | null;
  month: number | null;
  today: string;
  holidays: Record<string, string>;
  trackLabel?: string | null;
}) {
  const byDate = useMemo(() => new Map(slots.filter((s) => s.date).map((s) => [s.date!, s])), [slots]);
  const hasCalendar = year != null && month != null && byDate.size > 0;

  // 기본 선택: 오늘 수업 → 지난 수업 중 마지막 → 음원이 있는 첫 강
  const initial = useMemo(() => {
    const dated = slots.filter((s) => s.date).sort((a, b) => a.date!.localeCompare(b.date!));
    return (
      dated.find((s) => s.date === today)?.day ??
      [...dated].reverse().find((s) => s.date! <= today)?.day ??
      dated[0]?.day ??
      slots.find((s) => s.lesson.length || s.homework.length)?.day ??
      slots[0]?.day ??
      1
    );
  }, [slots, today]);
  const [picked, setPicked] = useState<number>(initial);
  const current = slots.find((s) => s.day === picked) ?? slots[0];

  const grid = useMemo(
    () => (hasCalendar ? coveringGrid(year!, month!, slots.map((s) => s.date).filter((d): d is string => !!d)) : []),
    [hasCalendar, year, month, slots],
  );

  const count = (s: LessonSlot) => s.lesson.length + s.homework.length;

  return (
    <div className="space-y-5">
      {hasCalendar ? (
        <section aria-label="수업일 달력" className="rounded-xl2 border border-line bg-paper p-3 sm:p-4">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Icon name="calendar" size={18} />
            <h3 className="text-sm font-black text-ink">
              {year}년 {month}월 수업일
            </h3>
            {trackLabel && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-bold text-brand-700">{trackLabel}</span>}
            <span className="ml-auto text-xs text-mist">날짜를 누르면 그날 음원이 열려요</span>
          </div>

          <div className="grid grid-cols-7 gap-1">
            {WEEKDAY_KO.map((w, i) => (
              <div key={w} className={cn("pb-1 text-center text-[11px] font-bold", i === 0 ? "text-red-500" : "text-mist")}>
                {w}
              </div>
            ))}
            {grid.flat().map((cell) => {
              const slot = byDate.get(cell.date);
              const dow = new Date(`${cell.date}T00:00:00Z`).getUTCDay();
              const holiday = holidays[cell.date];
              const isToday = cell.date === today;
              if (!slot) {
                return (
                  <div
                    key={cell.date}
                    className={cn(
                      "flex min-h-11 flex-col items-center justify-center rounded-lg p-0.5 text-xs tabular-nums",
                      cell.inMonth ? "text-slate" : "text-mist/60",
                      (dow === 0 || holiday) && cell.inMonth && "text-red-400",
                      isToday && "ring-1 ring-brand-300",
                    )}
                  >
                    {cell.day}
                  </div>
                );
              }
              const on = slot.day === picked;
              return (
                <button
                  key={cell.date}
                  type="button"
                  onClick={() => setPicked(slot.day)}
                  aria-pressed={on}
                  aria-label={`${labelKo(cell.date)} ${slot.lessonNo}강 음원 ${count(slot)}개`}
                  className={cn(
                    "flex min-h-11 flex-col items-center justify-center rounded-lg p-0.5 leading-tight transition",
                    on ? "bg-brand-500 text-white shadow-pink" : "bg-brand-50 text-brand-700 hover:bg-brand-100",
                    isToday && !on && "ring-2 ring-brand-400",
                  )}
                >
                  <span className="text-xs font-black tabular-nums">{cell.day}</span>
                  <span className={cn("text-[10px] font-bold tabular-nums", on ? "text-white/90" : "text-brand-600")}>{slot.lessonNo}강</span>
                </button>
              );
            })}
          </div>
        </section>
      ) : (
        <section aria-label="강 고르기" className="rounded-xl2 border border-line bg-paper p-3 sm:p-4">
          <p className="mb-2 text-sm font-bold text-ink">강을 고르세요</p>
          <div className="flex flex-wrap gap-1.5">
            {slots.map((s) => (
              <button
                key={s.day}
                type="button"
                onClick={() => setPicked(s.day)}
                aria-pressed={s.day === picked}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-black tabular-nums transition",
                  s.day === picked ? "bg-brand-500 text-white shadow-pink" : count(s) ? "bg-brand-50 text-brand-700 hover:bg-brand-100" : "bg-surface text-mist",
                )}
              >
                {s.lessonNo}강
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-mist">반 배정이 되면 수업 날짜에 맞춰 달력으로 보여 드려요.</p>
        </section>
      )}

      {/* 고른 강의 음원 */}
      {current && (
        <section aria-labelledby="picked-title" className="space-y-4">
          <div className="flex flex-wrap items-baseline gap-2">
            <h3 id="picked-title" className="text-lg font-black text-ink">
              {current.lessonNo}강
            </h3>
            {current.date && <span className="text-sm font-semibold text-slate">{labelKo(current.date)}</span>}
            {current.date && holidays[current.date] && <span className="text-xs font-bold text-red-500">{holidays[current.date]}</span>}
          </div>

          {count(current) === 0 ? (
            <p className="rounded-xl2 border border-dashed border-line bg-surface px-4 py-8 text-center text-sm text-mist">
              이 강의 음원은 아직 올라오지 않았어요.
            </p>
          ) : (
            (["lesson", "homework"] as const).map((kind) => {
              const list = kind === "lesson" ? current.lesson : current.homework;
              if (list.length === 0) return null;
              return (
                <div key={kind} className="rounded-xl2 border border-line bg-paper p-3 sm:p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <Icon name={kind === "homework" ? "homework" : "headphones"} size={18} />
                    <h4 className="text-sm font-black text-ink">{AUDIO_KIND_LABEL[kind]}</h4>
                    <span className="text-xs text-mist">{AUDIO_KIND_HINT[kind]}</span>
                  </div>
                  <div className="space-y-2">
                    {list.map((t) => (
                      <AudioPlayer
                        key={t.id}
                        src={`/files/audio/${t.id}`}
                        title={`${current.lessonNo}강${t.label ? ` · ${t.label}` : ""}`}
                        note={list.length > 1 ? (t.label ?? null) : null}
                      />
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </section>
      )}
    </div>
  );
}

/** 달력에 쓸 공휴일 이름 (연·월만 있으면 된다) */
export const holidayMapFor = (dates: string[], names: Map<string, string[]>) => {
  const out: Record<string, string> = {};
  for (const d of dates) {
    const n = names.get(d);
    if (n?.length) out[d] = n[0];
  }
  return out;
};

export const monthOf = (date: string) => parseYmd(date).m;
