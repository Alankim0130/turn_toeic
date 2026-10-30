"use client";

import { useState } from "react";
import { MonthCalendar, type CalendarMark } from "@/components/my/MonthCalendar";
import { Icon } from "@/components/ui/Icon";
import { classDayLabel, HOMEWORK_SUBJECTS, homeworkLabel, SUBJECT_DESC, SUBJECT_LABEL, type HomeworkSubject } from "@/lib/homework";
import { isFutureClass } from "@/lib/homework-day";
import { dueLabel, HOMEWORK_DUE_LABEL, shortDay } from "@/lib/homework-missing";
import { cn, formatDate } from "@/lib/utils";
import { HomeworkUploadForm, type UploadState } from "./HomeworkUploadForm";
import { SubmissionCard, type SubmissionLite } from "./SubmissionCard";

/** 고른 사진 · 음성을 아직 안 냈는데 다른 날짜 · 과목 · 달로 바꾸려 할 때 (2026-10-30) */
const LEAVE_CONFIRM = "아직 내지 않은 숙제가 있어요. 바꾸면 고른 사진 · 음성 · 질문이 지워져요. 바꿀까요?";

/** 달력 한 달치 — 서버가 만들어서 넘긴다 */
export type HomeworkMonth = { year: number; month: number; marks: CalendarMark[]; initial: string | null };
/**
 * 수업일 한 줄: 그 날 강좌 이름과 **낼 수 있는 레벨들** (스파르타는 두 레벨),
 * 그리고 **제출 기한** — 같은 트랙의 다음 수업일 오후 5시 (2026-10-14 Alan). 기한 날짜를 못 읽었으면 `due` 가 없다 (줄을 그리지 않는다),
 * 다음 수업일이 아직 달력에 없으면 null.
 */
/**
 * capped — 수업 기간이 기한(다음 수업일)보다 먼저 끝나 `due` 가 수업 기간 마지막 날이다 (그 날 하루가 끝날 때까지 낸다, 2026-10-29).
 * startsAt — 오늘이고 첫 수업이 아직 시작 전이면 그 시각("10:00") — 지난 수업 숙제를 오늘 날짜로 잘못 내지 않게 말한다 (2026-10-30)
 */
export type HomeworkDay = { date: string; course: string; levels: number[]; due?: string | null; overdue?: boolean; capped?: boolean; startsAt?: string };

/**
 * 숙제업로드 — **달력에서 수업 날짜를 고르고 RC·LC 를 낸다** (2026-09-19 Alan —
 * "숙제업로드가 헷갈릴 수 있으니 학생들 화면에는 내 시간표, 즉 달력이 나와서 해당 달력을 클릭해서
 *  RC제출 / LC제출을 할 수 있으면 돼. 단, 중급속성이나 실전속성은 두 레벨이 다 나와야해").
 *
 * 그전에는 **레벨 → 과목 → 사진** 3단계였는데 학생이 자기 레벨을 골라야 했고 "다른 레벨 숙제 올리기" 로
 * 아무 레벨이나 낼 수 있었다. 이제 **내가 그 날 실제로 듣는 반**이 레벨을 정한다 — 3단계로 되돌리지 말 것.
 *
 * **비대면 스터디 인증과는 완전히 다른 화면이다** — 그쪽은 `/my/study` 의 `CheckinPanel` 이다.
 *
 * **고른 것을 아직 안 냈으면 날짜 · 과목 · 달을 바꾸기 전에 묻는다** (2026-10-30 문라경 학생 — "분명 제출하고 확인했는데 그 이후에 들어갔을 때 제출란에 아무것도 없었습니다").
 * 예전에는 LC 사진을 고른 채 RC 제출을 누르거나 다른 날짜를 누르면 고른 사진이 **아무 말 없이** 사라졌다 (올리기 폼이 새로 그려진다).
 * 올리는 중에는 바꾸지 않는다 — 폼이 사라져도 올리기는 끝까지 가서, 끝나며 새로 연 칸까지 닫아 버린다. 내고 나면 그 날짜 · 과목으로 **"냈어요"** 를 적고 그 카드를 강조한다.
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
  /** 열린 올리기 폼의 상태 — 아직 안 낸 것이 있나 · 올리는 중인가 */
  const [upload, setUpload] = useState<UploadState>("idle");
  /** 방금 낸 숙제 — "냈어요" 줄과 카드 강조 (다른 날짜 · 과목을 고르면 지운다) */
  const [sent, setSent] = useState<{ id: number; date: string; label: string } | null>(null);
  const busy = upload === "busy";

  if (!month) return null;

  const day = days.find((d) => d.date === picked) ?? null;
  const future = !!day && isFutureClass(day.date, today);
  const ofDay = submissions.filter((s) => s.class_date === picked);
  const countOf = (level: number, subject: string) => ofDay.filter((s) => s.level === level && s.subject === subject).length;

  /** 바꿔도 되나 — 올리는 중이면 안 되고, 고른 것을 아직 안 냈으면 묻는다 (머리말) */
  const canLeave = () => !busy && (upload !== "picked" || window.confirm(LEAVE_CONFIRM));
  const goMonth = (next: number) => {
    const m = months[next];
    if (!m || !canLeave()) return;
    setMi(next);
    setPicked(m.initial);
    setTarget(null);
    setSent(null);
  };
  const pickDay = (date: string) => {
    if (!canLeave()) return;
    setPicked(date);
    setTarget(null);
    setSent(null);
  };
  const pickTarget = (next: { level: number; subject: HomeworkSubject } | null) => {
    if (!canLeave()) return;
    setTarget(next);
    setSent(null);
  };

  return (
    <div className="space-y-5">
      {months.length > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button type="button" onClick={() => goMonth(mi - 1)} disabled={mi === 0 || busy} className="btn-ghost !px-3 !py-1.5 disabled:opacity-30" aria-label="지난달">
            ‹
          </button>
          <span className="min-w-28 text-center font-black text-ink">
            {month.year}년 {month.month}월
          </span>
          <button
            type="button"
            onClick={() => goMonth(mi + 1)}
            disabled={mi === months.length - 1 || busy}
            className="btn-ghost !px-3 !py-1.5 disabled:opacity-30"
            aria-label="다음달"
          >
            ›
          </button>
        </div>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[1.1fr_1fr]">
        <MonthCalendar year={month.year} month={month.month} marks={month.marks} today={today} selected={picked} onSelect={pickDay} />

        {/* overflow-clip — hidden 이면 그 안의 제출 막대(bar-above-nav)가 화면 바닥에 붙지 못한다 */}
        <section className="card overflow-clip" aria-label="고른 날짜의 숙제">
          {!day ? (
            <p className="px-5 py-10 text-center text-sm text-slate">달력에서 수업이 있는 날을 눌러 주세요.</p>
          ) : (
            <>
              <div className="border-b border-line bg-brand-50/60 px-4 py-3">
                <p className="font-black text-ink">
                  {classDayLabel(day.date)} {formatDate(day.date, { weekday: "short" })} 수업
                </p>
                <p className="mt-0.5 truncate text-xs text-slate">{day.course}</p>
                {day.due !== undefined && (
                  <p className={cn("mt-1 text-xs font-bold", day.overdue ? "text-amber-700" : "text-ink-soft")}>
                    {day.due
                      ? day.capped
                        ? `제출 기한 ${shortDay(day.due)}까지 · 수업 기간 마지막 날이에요`
                        : `제출 기한 ${dueLabel(day.due)}까지${day.overdue ? " · 지났어요" : ""}`
                      : `제출 기한 다음 수업일 ${HOMEWORK_DUE_LABEL}까지`}
                  </p>
                )}
              </div>

              <div className="space-y-3 p-4">
                {/* **아직 오지 않은 수업 날짜로는 숙제를 받지 않는다** (2026-10-30 문라경 학생 — 금요일 숙제를 주말에 열면 다음 주 월요일이 골라져 있어
                    그대로 내면 월요일 숙제로 저장되고, 금요일 숙제는 '안 냄' 이 되어 미제출 알림이 갔다). 서버(`submitHomework`)도 같은 규칙으로 막는다 */}
                {future ? (
                  <div className="rounded-xl2 border border-line bg-surface px-4 py-3 text-sm">
                    <p className="font-black text-ink">아직 수업 전이에요</p>
                    <p className="mt-1 text-ink-soft">이 날 숙제는 수업이 끝난 뒤에 이 날짜로 올려요. 지난 수업 숙제는 달력에서 <b>그 수업 날짜</b>를 눌러 올려 주세요.</p>
                  </div>
                ) : (
                  day.startsAt && (
                    <p className="rounded-xl2 border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">
                      오늘 수업은 {day.startsAt}에 시작해요. 지난 수업 숙제라면 달력에서 그 수업 날짜를 눌러 올려 주세요.
                    </p>
                  )
                )}

                {/* 방금 낸 숙제 — 어느 날짜 · 과목으로 들어갔는지 그 자리에서 보인다 */}
                {sent && sent.date === day.date && !target && (
                  <p role="status" className="flex items-center gap-1.5 rounded-xl2 border border-brand-200 bg-brand-50 px-3 py-2 text-sm font-bold text-brand-700">
                    <Icon name="success" size={18} />
                    <span className="min-w-0">
                      {classDayLabel(sent.date)} 수업 · {sent.label} 숙제를 냈어요. 아래 목록에서 확인할 수 있어요.
                    </span>
                  </p>
                )}

                {/* 레벨마다 RC·LC 두 칸. 중급속성·실전속성이면 레벨이 둘이라 네 칸이 된다 */}
                {!future && day.levels.map((level) => (
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
                            disabled={busy}
                            onClick={() => pickTarget(on ? null : { level, subject })}
                            className={cn(
                              "flex items-center gap-2 rounded-xl2 border px-3 py-2.5 text-left transition disabled:cursor-not-allowed disabled:opacity-60",
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

                {target && !future && (
                  <div className="animate-fade-up border-t border-line pt-4">
                    {/* 어느 수업의 숙제인지 날짜부터 적는다 (2026-10-30) — 제출 버튼에도 같은 날짜가 붙는다 */}
                    <p className="mb-3 text-sm font-black text-ink">
                      {classDayLabel(day.date)} {formatDate(day.date, { weekday: "short" })} 수업 ·{" "}
                      <span className="text-brand-600">{homeworkLabel(target.level, target.subject)}</span> 숙제 올리기 (사진 · 음성)
                    </p>
                    <HomeworkUploadForm
                      key={`${day.date}-${target.level}-${target.subject}`}
                      userId={userId}
                      level={target.level}
                      subject={target.subject}
                      classDate={day.date}
                      onStateChange={setUpload}
                      onDone={(id) => {
                        setSent({ id, date: day.date, label: homeworkLabel(target.level, target.subject) });
                        setTarget(null);
                      }}
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
          {/* 예전에 아직 오지 않은 수업 날짜로 낸 숙제 (2026-10-30 전) — 날짜를 잘못 골랐을 수 있다 */}
          {future && (
            <p className="mb-3 rounded-xl2 border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">
              아직 수업 전인 날짜로 낸 숙제예요. 지난 수업 숙제를 잘못 낸 거라면 &lsquo;제출 취소&rsquo; 뒤에 그 수업 날짜로 다시 내 주세요.
            </p>
          )}
          <ul className="grid gap-4 lg:grid-cols-2">
            {ofDay.map((s) => (
              <li key={s.id}>
                <SubmissionCard submission={s} highlight={s.id === sent?.id} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
