"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  enrollBlockMinutes,
  enrollBlocks,
  enrollCourses,
  enrollKinds,
  enrollTracks,
  KIND_CHOICE_LABEL,
  TRACK_CHOICE_LABEL,
  type EnrollKind,
  type EnrollSection,
  type EnrollTrack,
} from "@/lib/enroll-options";
import {
  checkSurvey,
  GOAL_MONTHS,
  goalMonthsLabel,
  HISTORY,
  HISTORY_TOOK,
  MANAGE_STYLES,
  NEXT_PLANS,
  OCCUPATIONS,
  REASONS,
  SOURCES,
  STORY_MIN,
  SURVEY_MAX,
  type SurveyField,
  type SurveyInput,
} from "@/lib/student-survey";
import { submitStudentSurvey } from "./actions";

/** 질문 차례 — 화면 번호와 처음 걸린 질문을 고르는 데 함께 쓴다 */
const ORDER: SurveyField[] = ["occupation", "score", "target", "reasons", "history", "next", "manage", "sources"];

type Problem = { field: SurveyField | null; error: string };

/** 알약 하나 — 고른 것만 분홍으로 찬다 (등업신청의 고르는 줄과 같은 모양) */
function Chip({ on, onClick, disabled, children }: { on: boolean; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-full border px-3.5 py-2 text-sm font-bold transition disabled:opacity-50",
        on ? "border-brand-400 bg-brand-500 text-white shadow-pink" : "border-line bg-paper text-ink-soft hover:border-brand-300 hover:text-brand-600",
      )}
    >
      {children}
    </button>
  );
}

/** 고르는 줄 하나 (이름 + 알약들) — 다음 달 반 고르기에 쓴다 */
function PickRow<T extends string | number>({
  label,
  options,
  value,
  onChange,
  disabled,
  empty,
  hint,
}: {
  label: string;
  options: { key: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
  disabled?: boolean;
  empty: string;
  hint?: string;
}) {
  return (
    <div>
      <span className="label">{label}</span>
      {hint && <p className="-mt-1 mb-2 text-xs text-slate">{hint}</p>}
      {options.length === 0 ? (
        <p className="text-sm text-mist">{empty}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {options.map((o) => (
            <Chip key={o.key} on={value === o.key} disabled={disabled} onClick={() => onChange(o.key)}>
              {o.label}
            </Chip>
          ))}
        </div>
      )}
    </div>
  );
}

/** 체크 표시 — 긴 고르기 줄(공부 이력)의 네모 칸. 작은 도형이라 인라인 SVG (이모지 · 아이콘 그림이 아니다) */
function CheckBox({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition",
        on ? "border-brand-500 bg-brand-500 text-white" : "border-line bg-paper text-transparent",
      )}
    >
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
        <path d="M3.5 8.5l3 3 6-7" />
      </svg>
    </span>
  );
}

/** 글자 수 — DB 와 같이 코드 포인트로 센다 */
const len = (s: string) => [...s].length;

/**
 * 수강생 설문 (2026-10-28 Alan — "등업직후 바로 진행. 다 작성해야지 진행할 수 있도록 해줘. 설문조사는 처음 한번만").
 *
 * 여덟 질문을 한 화면에 둔다 — 종이 설문처럼 훑어보고 답한다. **모든 질문에 답해야 낸다** — 빠진 것이 있으면 그 질문으로 화면을 옮기고 무엇이 빠졌는지 적는다
 * (버튼을 잠그면 무엇이 빠졌는지 몰라 헤맨다). 검사는 서버와 같은 `checkSurvey` 이고, 다음 달 반은 서버가 시간표로 다시 푼다.
 * 비워도 되는 칸(직장명 · LC/RC · 소개해 준 분 이름)에는 `선택` 을 붙인다 — 개인정보 보호법 제16조 제3항 (`student-survey.ts` 머리말).
 *
 * 보내기는 `onSubmit` 에서 직접 한다 — `<form action>` 이면 React 19 가 끝난 뒤 폼을 초기화해 고른 알약이 처음 모양으로 돌아간다 (교재주문 폼과 같은 함정).
 *
 * @param sections 다음 달 시간표로 만든 반 (`nextClassSections`) — 비었으면 레벨(`courses`)만 고른다
 * @param preview 강사 · 관리자 · 조교 계정 — 보기만 하고 내지 않는다
 */
export function SurveyForm({
  sections,
  courses,
  nextLabel,
  termKey,
  preview = false,
}: {
  sections: EnrollSection[];
  courses: { id: number; name: string }[];
  /** 다음 달 이름 — `12월` */
  nextLabel: string;
  /** 다음 달 기수 키 — `2026-12` (`termKeyOf`) */
  termKey: string;
  preview?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [problem, setProblem] = useState<Problem | null>(null);
  const refs = useRef<Partial<Record<SurveyField, HTMLElement | null>>>({});

  // 1. 신분
  const [occupation, setOccupation] = useState<string | null>(null);
  const [workplace, setWorkplace] = useState("");
  // 2. 지금 점수
  const [hasScore, setHasScore] = useState<boolean | null>(null);
  const [scoreTotal, setScoreTotal] = useState("");
  const [scoreLc, setScoreLc] = useState("");
  const [scoreRc, setScoreRc] = useState("");
  // 3. 목표
  const [target, setTarget] = useState("");
  const [goalMonths, setGoalMonths] = useState<number | null>(null);
  // 4. 공부 이유
  const [reasons, setReasons] = useState<string[]>([]);
  const [reasonOther, setReasonOther] = useState("");
  // 5. 공부 이력
  const [history, setHistory] = useState<string[]>([]);
  const [historyWhere, setHistoryWhere] = useState("");
  // 6. 다음 달
  const [nextPlan, setNextPlan] = useState<string | null>(null);
  const [nextCourse, setNextCourse] = useState<number | null>(null);
  const [nextKind, setNextKind] = useState<EnrollKind | null>(null);
  const [nextTrack, setNextTrack] = useState<EnrollTrack | null>(null);
  const [nextBlock, setNextBlock] = useState<string | null>(null);
  const [nextReason, setNextReason] = useState("");
  // 7. 관리 방식
  const [manage, setManage] = useState<string | null>(null);
  // 8. 수강 계기
  const [sources, setSources] = useState<string[]>([]);
  const [referrer, setReferrer] = useState("");
  const [story, setStory] = useState("");

  // 다음 달 반 고르기 — 수동 등업신청과 같은 순서 (레벨 → 종합 · 단과 → 요일 → 시간대)
  const pickCourses = useMemo(() => (sections.length ? enrollCourses(sections, termKey) : courses), [sections, courses, termKey]);
  const kinds = useMemo(() => (nextCourse && sections.length ? enrollKinds(sections, termKey, nextCourse) : []), [sections, termKey, nextCourse]);
  const kindValue = kinds.length === 1 ? kinds[0] : nextKind;
  const tracks = useMemo(
    () => (nextCourse && kindValue ? enrollTracks(sections, termKey, nextCourse, kindValue) : []),
    [sections, termKey, nextCourse, kindValue],
  );
  const blocks = useMemo(
    () => (nextCourse && kindValue && nextTrack ? enrollBlocks(sections, termKey, nextCourse, nextTrack, kindValue) : []),
    [sections, termKey, nextCourse, kindValue, nextTrack],
  );

  const took = history.some((h) => HISTORY_TOOK.includes(h));
  const busy = pending || preview;

  /** 다음 달 반 — 화면에서 먼저 본다 (서버도 같은 순서로 다시 본다) */
  function nextClassProblem(): string | null {
    if (nextPlan !== "yes") return null;
    if (!nextCourse) return "다음 달에 들을 반의 레벨을 골라 주세요.";
    if (sections.length === 0) return null;
    if (!kindValue) return "종합반인지 단과인지 골라 주세요.";
    if (!nextTrack) return "요일을 골라 주세요.";
    if (!nextBlock) return "시간대를 골라 주세요.";
    return null;
  }

  function input(): SurveyInput {
    return {
      occupation,
      workplace,
      hasScore,
      scoreTotal,
      scoreLc,
      scoreRc,
      target,
      goalMonths,
      reasons,
      reasonOther,
      history,
      historyWhere,
      nextPlan,
      nextClass: nextPlan === "yes" ? { courseId: nextCourse, kind: kindValue, track: nextTrack, timeBlock: nextBlock } : null,
      nextReason,
      manage,
      sources,
      referrer,
      story,
    };
  }

  /** 처음 걸린 질문 — 다음 달 반이 설문 검사보다 앞 질문이면 그것 */
  function firstProblem(): Problem | null {
    const check = checkSurvey(input());
    const cls = nextClassProblem();
    if (cls && (check.ok || ORDER.indexOf(check.field) > ORDER.indexOf("next"))) return { field: "next", error: cls };
    return check.ok ? null : { field: check.field, error: check.error };
  }

  function show(p: Problem) {
    setProblem(p);
    if (p.field) refs.current[p.field]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // 답한 질문 수 — 맨 위 막대. 검사와 똑같지는 않다(점수 꼴 등) — 끝까지 가면 버튼이 정확히 말한다
  const answered = [
    occupation != null,
    hasScore === false || (hasScore === true && scoreTotal.trim() !== ""),
    target.trim() !== "" && goalMonths != null,
    reasons.length > 0 && (!reasons.includes("other") || reasonOther.trim() !== ""),
    history.length > 0 && (!took || historyWhere.trim() !== ""),
    nextPlan != null && (nextPlan !== "no" || nextReason.trim() !== "") && (nextPlan !== "yes" || nextClassProblem() == null),
    manage != null,
    sources.length > 0 && len(story.trim()) >= STORY_MIN,
  ].filter(Boolean).length;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const p = firstProblem();
    if (p) return show(p);
    setProblem(null);
    const value = input();
    startTransition(async () => {
      const res = await submitStudentSurvey(value);
      if (!res.ok) return show({ field: res.field ?? null, error: res.error });
      router.replace("/my");
    });
  }

  /** 질문 카드 — 걸린 질문이면 테두리와 까닭이 선다 */
  const question = (field: SurveyField, title: string, hint: string | null, body: React.ReactNode) => {
    const n = ORDER.indexOf(field) + 1;
    const hit = problem?.field === field;
    return (
      <section
        ref={(el) => {
          refs.current[field] = el;
        }}
        aria-labelledby={`q-${field}`}
        className={cn("card scroll-mt-40 p-5 sm:p-6", hit && "border-amber-300 ring-2 ring-amber-200")}
      >
        <h2 id={`q-${field}`} className="flex items-start gap-2.5 text-base font-black text-ink">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-500 text-sm font-black text-white">{n}</span>
          <span className="pt-0.5">{title}</span>
        </h2>
        {hint && <p className="mt-1.5 text-sm text-slate">{hint}</p>}
        <div className="mt-4 space-y-4">{body}</div>
        {hit && (
          <p role="alert" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
            {problem.error}
          </p>
        )}
      </section>
    );
  };

  const toggle = (list: string[], key: string) => (list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);
  const clear = (field: SurveyField) => {
    if (problem?.field === field) setProblem(null);
  };

  return (
    <form onSubmit={onSubmit} className="space-y-5" aria-busy={pending} noValidate>
      {/* 몇 개 답했나 — 끝이 보이면 끝까지 간다 */}
      <div className="card sticky top-[calc(4.5rem+var(--vv-ghost,0px))] z-10 p-3 sm:p-4">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="font-bold text-ink">
            질문 8개 중 <span className="tabular-nums text-brand-600">{answered}</span>개 답했어요
          </span>
          <span className="text-xs text-mist">모두 답하면 끝나요</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-brand-50" aria-hidden>
          <div className="h-full rounded-full bg-brand-500 transition-[width] duration-300" style={{ width: `${(answered / 8) * 100}%` }} />
        </div>
      </div>

      {question(
        "occupation",
        "지금 무엇을 하고 있나요?",
        null,
        <>
          <div className="flex flex-wrap gap-2">
            {OCCUPATIONS.map((o) => (
              <Chip
                key={o.key}
                on={occupation === o.key}
                disabled={busy}
                onClick={() => {
                  setOccupation(o.key);
                  clear("occupation");
                }}
              >
                {o.label}
              </Chip>
            ))}
          </div>
          {occupation === "worker" && (
            <div>
              <label htmlFor="survey-workplace" className="label">
                직장명 <span className="font-normal text-mist">(선택)</span>
              </label>
              <input
                id="survey-workplace"
                value={workplace}
                onChange={(e) => setWorkplace(e.target.value)}
                maxLength={SURVEY_MAX.workplace}
                className="input"
                placeholder="적지 않아도 돼요"
                disabled={busy}
              />
            </div>
          )}
        </>,
      )}

      {question(
        "score",
        "지금 토익 점수가 있나요?",
        "가장 최근에 본 토익 점수예요. 마이페이지에서 언제든 고칠 수 있어요.",
        <>
          <div className="flex flex-wrap gap-2">
            <Chip
              on={hasScore === true}
              disabled={busy}
              onClick={() => {
                setHasScore(true);
                clear("score");
              }}
            >
              토익 점수가 있어요
            </Chip>
            <Chip
              on={hasScore === false}
              disabled={busy}
              onClick={() => {
                setHasScore(false);
                clear("score");
              }}
            >
              아직 시험을 본 적이 없어요
            </Chip>
          </div>
          {hasScore && (
            <div className="grid grid-cols-3 gap-2 sm:max-w-md">
              <div>
                <label htmlFor="survey-total" className="label">
                  총점
                </label>
                <input
                  id="survey-total"
                  value={scoreTotal}
                  onChange={(e) => setScoreTotal(e.target.value)}
                  inputMode="numeric"
                  maxLength={3}
                  className="input tabular-nums"
                  placeholder="650"
                  disabled={busy}
                />
              </div>
              <div>
                <label htmlFor="survey-lc" className="label">
                  LC <span className="font-normal text-mist">(선택)</span>
                </label>
                <input
                  id="survey-lc"
                  value={scoreLc}
                  onChange={(e) => setScoreLc(e.target.value)}
                  inputMode="numeric"
                  maxLength={3}
                  className="input tabular-nums"
                  placeholder="330"
                  disabled={busy}
                />
              </div>
              <div>
                <label htmlFor="survey-rc" className="label">
                  RC <span className="font-normal text-mist">(선택)</span>
                </label>
                <input
                  id="survey-rc"
                  value={scoreRc}
                  onChange={(e) => setScoreRc(e.target.value)}
                  inputMode="numeric"
                  maxLength={3}
                  className="input tabular-nums"
                  placeholder="320"
                  disabled={busy}
                />
              </div>
            </div>
          )}
        </>,
      )}

      {question(
        "target",
        "목표 점수와 기간을 알려 주세요",
        "마이페이지 맨 위에 지금 점수와 함께 보여 드려요.",
        <>
          <div className="sm:max-w-[10rem]">
            <label htmlFor="survey-target" className="label">
              목표 점수
            </label>
            <input
              id="survey-target"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              inputMode="numeric"
              maxLength={3}
              className="input tabular-nums"
              placeholder="850"
              disabled={busy}
            />
          </div>
          <div>
            <span className="label">언제까지 이루고 싶나요?</span>
            <div className="flex flex-wrap gap-2">
              {GOAL_MONTHS.map((m) => (
                <Chip
                  key={m}
                  on={goalMonths === m}
                  disabled={busy}
                  onClick={() => {
                    setGoalMonths(m);
                    clear("target");
                  }}
                >
                  {goalMonthsLabel(m)}
                </Chip>
              ))}
            </div>
          </div>
        </>,
      )}

      {question(
        "reasons",
        "토익을 공부하는 이유는 무엇인가요?",
        "여러 개 골라도 돼요.",
        <>
          <div className="flex flex-wrap gap-2">
            {REASONS.map((r) => (
              <Chip
                key={r.key}
                on={reasons.includes(r.key)}
                disabled={busy}
                onClick={() => {
                  setReasons((l) => toggle(l, r.key));
                  clear("reasons");
                }}
              >
                {r.label}
              </Chip>
            ))}
          </div>
          {reasons.includes("other") && (
            <div>
              <label htmlFor="survey-reason-other" className="label">
                기타 이유
              </label>
              <input
                id="survey-reason-other"
                value={reasonOther}
                onChange={(e) => setReasonOther(e.target.value)}
                maxLength={SURVEY_MAX.reasonOther}
                className="input"
                placeholder="예: 졸업 요건"
                disabled={busy}
              />
            </div>
          )}
        </>,
      )}

      {question(
        "history",
        "지금까지 영어 · 토익 공부는 어땠나요?",
        "해당하는 것을 모두 골라 주세요.",
        <>
          <div className="space-y-2">
            {HISTORY.map((h) => {
              const on = history.includes(h.key);
              return (
                <button
                  key={h.key}
                  type="button"
                  aria-pressed={on}
                  disabled={busy}
                  onClick={() => {
                    // '처음이에요' 와 '들어 봤어요' 는 함께 고를 수 없다 — 하나를 고르면 반대쪽을 푼다
                    setHistory((l) => {
                      const next = toggle(l, h.key);
                      if (!next.includes(h.key)) return next;
                      if (h.key === "first") return next.filter((k) => !HISTORY_TOOK.includes(k));
                      if (h.took) return next.filter((k) => k !== "first");
                      return next;
                    });
                    clear("history");
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left text-sm font-bold transition disabled:opacity-50",
                    on ? "border-brand-300 bg-brand-50 text-ink" : "border-line bg-paper text-ink-soft hover:border-brand-200",
                  )}
                >
                  <CheckBox on={on} />
                  {h.label}
                </button>
              );
            })}
          </div>
          {took && (
            <div>
              <label htmlFor="survey-history-where" className="label">
                어디서 무슨 수업을 들었나요?
              </label>
              <input
                id="survey-history-where"
                value={historyWhere}
                onChange={(e) => setHistoryWhere(e.target.value)}
                maxLength={SURVEY_MAX.historyWhere}
                className="input"
                placeholder="예: 다른 학원 토익 750반, 인강 RC 기본"
                disabled={busy}
              />
            </div>
          )}
        </>,
      )}

      {question(
        "next",
        `다음 달(${nextLabel})에도 역전토익을 들을 건가요?`,
        null,
        <>
          <div className="flex flex-wrap gap-2">
            {NEXT_PLANS.map((p) => (
              <Chip
                key={p.key}
                on={nextPlan === p.key}
                disabled={busy}
                onClick={() => {
                  setNextPlan(p.key);
                  clear("next");
                }}
              >
                {p.label}
              </Chip>
            ))}
          </div>

          {nextPlan === "yes" && (
            <div className="space-y-4 rounded-xl2 border border-brand-200 bg-brand-50/40 p-4">
              <p className="text-sm text-slate">
                생각 중인 반을 눌러 골라 주세요. 고른다고 등록되는 것은 아니에요. 등록은 그대로 YBM 에서 해요.
              </p>
              <PickRow
                label="레벨"
                options={pickCourses.map((c) => ({ key: c.id, label: c.name }))}
                value={nextCourse}
                disabled={busy}
                empty="아직 고를 수 있는 반이 없어요."
                onChange={(v) => {
                  setNextCourse(v);
                  setNextKind(null);
                  setNextTrack(null);
                  setNextBlock(null);
                  clear("next");
                }}
              />
              {sections.length > 0 && kinds.length > 1 && (
                <PickRow
                  label="종합 · 단과"
                  options={kinds.map((k) => ({ key: k, label: KIND_CHOICE_LABEL[k] }))}
                  value={nextKind}
                  disabled={busy}
                  empty="먼저 레벨을 골라 주세요."
                  hint="한 과목만 듣는 단과라면 듣는 과목(RC · LC)을 골라 주세요. 두 과목을 다 들으면 종합반이에요."
                  onChange={(v) => {
                    setNextKind(v);
                    setNextTrack(null);
                    setNextBlock(null);
                  }}
                />
              )}
              {sections.length > 0 && (
                <>
                  <PickRow
                    label="요일"
                    options={tracks.map((t) => ({ key: t, label: TRACK_CHOICE_LABEL[t] }))}
                    value={nextTrack}
                    disabled={busy || !kindValue}
                    empty={nextCourse ? "먼저 종합반인지 단과인지 골라 주세요." : "먼저 레벨을 골라 주세요."}
                    onChange={(v) => {
                      setNextTrack(v);
                      setNextBlock(null);
                    }}
                  />
                  <PickRow
                    label="시간대"
                    // 분량을 함께 적는다 — 종합 주5일에는 60분과 120분이 같은 시각에 함께 선다
                    options={blocks.map((b) => {
                      const minutes = nextCourse ? enrollBlockMinutes(sections, termKey, nextCourse, b) : null;
                      return { key: b, label: minutes ? `${b} · ${minutes}분` : b };
                    })}
                    value={nextBlock}
                    disabled={busy || !nextTrack}
                    empty="먼저 요일을 골라 주세요."
                    onChange={(v) => {
                      setNextBlock(v);
                      clear("next");
                    }}
                  />
                </>
              )}
            </div>
          )}

          {nextPlan === "no" && (
            <div>
              <label htmlFor="survey-next-reason" className="label">
                안 듣는 이유를 알려 주세요
              </label>
              <textarea
                id="survey-next-reason"
                value={nextReason}
                onChange={(e) => setNextReason(e.target.value)}
                maxLength={SURVEY_MAX.nextReason}
                rows={3}
                className="input resize-y"
                placeholder="예: 다음 달에 시험을 보고 결과를 보려고요"
                disabled={busy}
              />
            </div>
          )}
        </>,
      )}

      {question(
        "manage",
        "숙제 관리는 어떻게 해 드릴까요?",
        "고른 대로 숙제 미제출 알림이 켜지거나 꺼져요. 나중에 숙제제출 화면의 스위치로 바꿀 수 있어요.",
        <div className="grid gap-2 sm:grid-cols-2">
          {MANAGE_STYLES.map((m) => {
            const on = manage === m.key;
            return (
              <button
                key={m.key}
                type="button"
                aria-pressed={on}
                disabled={busy}
                onClick={() => {
                  setManage(m.key);
                  clear("manage");
                }}
                className={cn(
                  "flex h-full flex-col gap-1.5 rounded-xl2 border-2 p-4 text-left transition disabled:opacity-50",
                  on ? "border-brand-500 bg-brand-50" : "border-line bg-paper hover:border-brand-200",
                )}
              >
                <span className="flex items-center gap-2">
                  <CheckBox on={on} />
                  <span className="text-base font-black text-ink">{m.title}</span>
                </span>
                <span className="text-sm text-slate">{m.desc}</span>
                <span className={cn("mt-auto self-start rounded-full px-2.5 py-0.5 text-xs font-black", m.alerts ? "bg-brand-500 text-white" : "bg-line text-ink-soft")}>
                  숙제 미제출 알림 {m.alerts ? "켜짐" : "꺼짐"}
                </span>
              </button>
            );
          })}
        </div>,
      )}

      {question(
        "sources",
        "역전토익을 어떻게 알게 됐나요?",
        "여러 개 골라도 돼요.",
        <>
          <div className="flex flex-wrap gap-2">
            {SOURCES.map((s) => (
              <Chip
                key={s.key}
                on={sources.includes(s.key)}
                disabled={busy}
                onClick={() => {
                  setSources((l) => toggle(l, s.key));
                  clear("sources");
                }}
              >
                {s.label}
              </Chip>
            ))}
          </div>
          {sources.includes("referral") && (
            <div>
              <label htmlFor="survey-referrer" className="label">
                소개해 준 분 이름 <span className="font-normal text-mist">(선택)</span>
              </label>
              <input
                id="survey-referrer"
                value={referrer}
                onChange={(e) => setReferrer(e.target.value)}
                maxLength={SURVEY_MAX.referrer}
                className="input sm:max-w-xs"
                placeholder="적지 않아도 돼요"
                disabled={busy}
              />
            </div>
          )}
          <div>
            <label htmlFor="survey-story" className="label">
              어떻게 알고 오게 됐는지 자세히 적어 주세요
            </label>
            <textarea
              id="survey-story"
              value={story}
              onChange={(e) => {
                setStory(e.target.value);
                if (len(e.target.value.trim()) >= STORY_MIN) clear("sources");
              }}
              maxLength={SURVEY_MAX.story}
              rows={4}
              className="input resize-y"
              placeholder="예: 네이버에서 서면 토익 학원을 찾다가 블로그 후기를 보고 상담을 받았어요."
              disabled={busy}
            />
            <p className="mt-1 text-right text-xs tabular-nums text-mist">
              {len(story)} / {SURVEY_MAX.story.toLocaleString()}자
            </p>
          </div>
        </>,
      )}

      {problem && (
        <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
          {problem.field ? `${ORDER.indexOf(problem.field) + 1}번 질문을 확인해 주세요. ` : ""}
          {problem.error}
        </p>
      )}

      <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
        <button type="submit" disabled={busy} className="btn-primary w-full sm:w-auto" aria-busy={pending}>
          {preview ? "미리 보기라 낼 수 없어요" : pending ? "저장하는 중…" : "설문 마치고 시작하기"}
        </button>
        {!preview && <span className="text-xs text-mist">처음 한 번만 해요. 내고 나면 바로 수강생 화면이 열려요.</span>}
      </div>
    </form>
  );
}
