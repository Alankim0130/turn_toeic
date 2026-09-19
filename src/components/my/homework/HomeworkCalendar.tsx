"use client";

import { useState } from "react";
import { MonthCalendar, type CalendarMark } from "@/components/my/MonthCalendar";
import { Icon } from "@/components/ui/Icon";
import { classDayLabel, HOMEWORK_SUBJECTS, homeworkLabel, SUBJECT_DESC, SUBJECT_LABEL, type HomeworkSubject } from "@/lib/homework";
import { cn, formatDate } from "@/lib/utils";
import { HomeworkUploadForm } from "./HomeworkUploadForm";
import { SubmissionCard, type SubmissionLite } from "./SubmissionCard";

/** 달력 한 달치 — 서버가 만들어서 넘긴다 */
export type HomeworkMonth = { year: number; month: number; marks: CalendarMark[]; initial: string | null };
/** 수업일 한 줄: 그 날 강좌 이름과 **낼 수 있는 레벨들** (스파르타는 두 레벨) */
export type HomeworkDay = { date: string; course: string; levels: number[] };

/**
 * 숙제업로드 — **달력에서 수업 날짜를 고르고 RC·LC 를 낸다** (2026-09-19 Alan —
 * "숙제업로드가 헷갈릴 수 있으니 학생들 화면에는 내 시간표, 즉 달력이 나와서 해당 달력을 클릭해서
 *  RC제출 / LC제출을 할 수 있으면 돼. 단, 중급속성이나 실전속성은 두 레벨이 다 나와야해").
 *
 * 그전에는 **레벨 → 과목 → 사진** 3단계였는데 학생이 자기 레벨을 골라야 했고 "다른 레벨 숙제 올리기" 로
 * 아무 레벨이나 낼 수 있었다. 이제 **내가 그 날 실제로 듣는 반**이 레벨을 정한다 — 3단계로 되돌리지 말 것.
 *
 * **비대면 스터디 인증과는 완전히 다른 화면이다** — 그쪽은 `/my/study` 의 `CheckinPanel` 이다.
 */
export function HomeworkCalendar({
  userId,
  today,
  months,
  days,
  submissions,
  startIndex,
}: {
  userId: string;
  today: string;
  months: HomeworkMonth[];
  days: HomeworkDay[];
  submissions: SubmissionLite[];
  startIndex: number;
}) {
  const [mi, setMi] = useState(Math.max(0, Math.min(startIndex, months.length - 1)));
  const month = months[mi];
  const [picked, setPicked] = useState<string | null>(month?.initial ?? null);
  const [target, setTarget] = useState<{ level: number; subject: HomeworkSubject } | null>(null);

  if (!month) return null;

  const day = days.find((d) => d.date === picked) ?? null;
  const ofDay = submissions.filter((s) => s.class_date === picked);
  const countOf = (level: number, subject: string) => ofDay.filter((s) => s.level === level && s.subject === subject).length;

  const goMonth = (next: number) => {
    const m = months[next];
    if (!m) return;
    setMi(next);
    setPicked(m.initial);
    setTarget(null);
  };
  const pickDay = (date: string) => {
    setPicked(date);
    setTarget(null);
  };

  return (
    <div className="space-y-5">
      {months.length > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button type="button" onClick={() => goMonth(mi - 1)} disabled={mi === 0} className="btn-ghost !px-3 !py-1.5 disabled:opacity-30" aria-label="지난달">
            ‹
          </button>
          <span className="min-w-28 text-center font-black text-ink">
            {month.year}년 {month.month}월
          </span>
          <button
            type="button"
            onClick={() => goMonth(mi + 1)}
            disabled={mi === months.length - 1}
            className="btn-ghost !px-3 !py-1.5 disabled:opacity-30"
            aria-label="다음달"
          >
            ›
          </button>
        </div>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[1.1fr_1fr]">
        <MonthCalendar year={month.year} month={month.month} marks={month.marks} today={today} selected={picked} onSelect={pickDay} />

        <section className="card overflow-hidden" aria-label="고른 날짜의 숙제">
          {!day ? (
            <p className="px-5 py-10 text-center text-sm text-slate">달력에서 수업이 있는 날을 눌러 주세요.</p>
          ) : (
            <>
              <div className="border-b border-line bg-brand-50/60 px-4 py-3">
                <p className="font-black text-ink">
                  {classDayLabel(day.date)} {formatDate(day.date, { weekday: "short" })} 수업
                </p>
                <p className="mt-0.5 truncate text-xs text-slate">{day.course}</p>
              </div>

              <div className="space-y-3 p-4">
                {/* 레벨마다 RC·LC 두 칸. 중급속성·실전속성이면 레벨이 둘이라 네 칸이 된다 */}
                {day.levels.map((level) => (
                  <div key={level}>
                    {day.levels.length > 1 && <p className="mb-1.5 text-xs font-black text-slate">{level}점 목표</p>}
                    <div className="grid grid-cols-2 gap-2">
                      {HOMEWORK_SUBJECTS.map((subject) => {
                        const n = countOf(level, subject);
                        const on = target?.level === level && target.subject === subject;
                        return (
                          <button
                            key={subject}
                            type="button"
                            aria-pressed={on}
                            onClick={() => setTarget(on ? null : { level, subject })}
                            className={cn(
                              "flex items-center gap-2 rounded-xl2 border px-3 py-2.5 text-left transition",
                              on ? "border-brand-400 bg-brand-50 ring-2 ring-brand-200" : "border-line bg-paper hover:border-brand-300 hover:bg-brand-50/50",
                            )}
                          >
                            <Icon name={subject === "rc" ? "rc" : "lc"} size={22} />
                            <span className="min-w-0">
                              <span className="block text-sm font-black text-ink">{SUBJECT_LABEL[subject]} 제출</span>
                              <span className="block truncate text-[11px] text-mist">{n > 0 ? `${n}건 냈어요` : SUBJECT_DESC[subject]}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {target && (
                  <div className="animate-fade-up border-t border-line pt-4">
                    <p className="mb-3 text-sm font-black text-ink">
                      <span className="text-brand-600">{homeworkLabel(target.level, target.subject)}</span> 풀이 사진 올리기
                    </p>
                    <HomeworkUploadForm
                      key={`${day.date}-${target.level}-${target.subject}`}
                      userId={userId}
                      level={target.level}
                      subject={target.subject}
                      classDate={day.date}
                      onDone={() => setTarget(null)}
                    />
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </div>

      {day && ofDay.length > 0 && (
        <section aria-labelledby="ofday-title">
          <h2 id="ofday-title" className="mb-3 text-lg font-black text-ink">
            {classDayLabel(day.date)}에 낸 숙제 <span className="tabular-nums text-slate">({ofDay.length})</span>
          </h2>
          <ul className="grid gap-4 lg:grid-cols-2">
            {ofDay.map((s) => (
              <li key={s.id}>
                <SubmissionCard submission={s} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
