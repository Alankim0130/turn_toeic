"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { JUDGE_CHECKS, progressView, type ProgressStep, type VerifyStage } from "@/lib/verify-progress";

/**
 * 등업신청 판별 중 — 화면 가운데 진행 카드 (2026-10-06 Alan — "수강증 판별하는 동안에 학생들에게 지금 판별중입니다. 라는 로딩중 같은 것들이
 * 쫌 보이면 좋겠어. 아, 지금 판별중이구나 를 알 수 있도록").
 *
 * 그전에는 폼 맨 아래 버튼 글자만 `수강증을 읽는 중…` 으로 바뀌어, 몇 초 동안 아무 일도 없는 것처럼 보였다. 이제 버튼을 누른 순간부터
 * 결과(팝업 · 안내)가 뜰 때까지 화면을 덮는다 — 그동안 학생이 할 일이 없고, 덮어 두면 버튼을 또 누르거나 화면을 떠나지 않는다.
 * - 내 수강증 미리보기: 올리는 동안은 흐리게 + 도는 고리, 판별하는 동안은 분홍 빛줄기가 위에서 아래로 훑는다 (PDF 는 미리보기가 없어 종이 모양)
 * - `판별 중` 배지 · 제목 · 설명 · 단계(올리기 → 판별 → 결과) — 글은 `progressView` 한곳이고, 단계는 브라우저가 아는 것만이다
 * - 자동 판별이면 보는 칸(이름 · 레벨 · 요일 · 시간 · 수강월)이 차례로 밝아진다 — "끝났어요" 를 찍지 않는다
 * - 한 단계가 10초를 넘기면 까닭과 걸린 초를 적는다 (보통은 몇 초)
 * 닫는 단추가 없다 — 서버는 1분 안에 답을 준다. 결과 팝업(`Dialog`)이 뜨면 부르는 쪽이 이 카드를 치운다.
 * 움직임 줄이기면 빛줄기는 숨고 막대 · 칸은 서 있다 — 글자가 단계를 말한다 (globals.css `.receipt-scan` · `.progress-slide` · `.check-glow`).
 *
 * @param since 지금 단계가 시작된 시각(ms) — 부르는 쪽이 버튼을 누를 때와 판별을 시작할 때 적는다
 */
export function VerifyProgress({ stage, manual, preview, since }: { stage: VerifyStage; manual: boolean; preview: string | null; since: number }) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [now, setNow] = useState(since);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // 뒤 화면 스크롤을 막고 제목에 포커스 — 결과 팝업(`Dialog`)과 같은 규칙. 화면 낭독기가 카드가 뜬 것을 안다
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    titleRef.current?.focus();
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const view = progressView(stage, manual, (now - since) / 1000);
  const judging = stage === "judge";

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div aria-hidden className="absolute inset-0 bg-ink/60 backdrop-blur-sm" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="verify-progress-title"
        aria-describedby="verify-progress-body"
        aria-busy="true"
        className="card relative flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col overflow-hidden p-0 shadow-pink"
      >
        {/* 결과 팝업의 색 막대 자리 — 끝을 모르는 진행이라 분홍 조각이 계속 지나간다 */}
        <div aria-hidden className="relative h-1.5 shrink-0 overflow-hidden bg-brand-100">
          <span className="progress-slide" />
        </div>
        <div className="overflow-y-auto overscroll-contain px-5 pb-5 pt-6 text-center sm:px-6 [@media(max-height:640px)]:pt-4">
          <ScanFrame preview={preview} judging={judging} />

          <div aria-live="polite" aria-atomic="true">
            <p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-brand-500 px-3 py-1 text-xs font-black text-white shadow-pink [@media(max-height:640px)]:mt-3">
              <span aria-hidden className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/80" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
              </span>
              {view.badge}
            </p>
            <h2 id="verify-progress-title" ref={titleRef} tabIndex={-1} className="mt-2.5 text-lg font-black text-ink outline-none sm:text-xl">
              {view.title}
            </h2>
            <p id="verify-progress-body" className="mt-1.5 text-sm text-slate">
              {view.body}
            </p>
          </div>

          {!manual && (
            // 320px 에서도 한 줄 — 칸 다섯이 들어가게 좁은 화면은 여백을 줄인다
            <ul aria-label="판별에서 보는 것" className="mt-3.5 flex flex-wrap justify-center gap-1 sm:gap-1.5">
              {JUDGE_CHECKS.map((c, i) => (
                <li
                  key={c}
                  className={cn("rounded-full border border-line bg-paper px-2 py-0.5 text-xs font-bold text-slate sm:px-2.5", judging && "check-glow")}
                  style={judging ? { animationDelay: `${i * 0.32}s` } : undefined}
                >
                  {c}
                </li>
              ))}
            </ul>
          )}

          <Steps steps={view.steps} />

          {view.slow ? (
            <div className="mt-4 rounded-xl bg-surface px-3.5 py-3 text-left text-sm [@media(max-height:640px)]:mt-3">
              <p className="font-black text-ink">
                <span aria-live="polite">{view.slow.title}</span>
                {/* 걸린 초는 매초 바뀐다 — 화면 낭독기가 매초 읽지 않게 알림 영역 밖에 둔다 */}
                <span aria-hidden className="tabular-nums text-brand-600">
                  {" "}
                  · {view.slow.seconds}초
                </span>
              </p>
              <p className="mt-0.5 text-slate">{view.slow.body}</p>
            </div>
          ) : (
            <p className="mt-4 text-sm font-bold text-ink">보통 몇 초면 끝나요.</p>
          )}
          <p className="mt-2 text-xs text-mist">이 화면을 닫거나 새로고침하지 말고 기다려 주세요.</p>
        </div>
      </div>
    </div>
  );
}

/**
 * 내 수강증 미리보기를 스캐너 틀(네 귀퉁이)에 담는다. 올리는 동안은 흐리게 + 도는 고리, 판별하는 동안은 빛줄기가 훑는다.
 * 미리보기가 없으면(PDF) 파란 수강증 카드를 닮은 종이 모양 — 등업신청 안내의 "파란색 수강증" 과 같은 파랑
 */
function ScanFrame({ preview, judging }: { preview: string | null; judging: boolean }) {
  const corner = "absolute h-5 w-5 border-brand-500";
  return (
    <div aria-hidden className="relative mx-auto w-fit p-2">
      <span className={cn(corner, "left-0 top-0 rounded-tl-lg border-l-[3px] border-t-[3px]")} />
      <span className={cn(corner, "right-0 top-0 rounded-tr-lg border-r-[3px] border-t-[3px]")} />
      <span className={cn(corner, "bottom-0 left-0 rounded-bl-lg border-b-[3px] border-l-[3px]")} />
      <span className={cn(corner, "bottom-0 right-0 rounded-br-lg border-b-[3px] border-r-[3px]")} />
      {/* 낮은 화면(568px 등)은 미리보기를 줄인다 — 오래 걸릴 때의 안내까지 카드 안에 들어가게 */}
      <div className="relative h-40 w-32 overflow-hidden rounded-lg bg-surface ring-1 ring-line sm:h-44 sm:w-36 [@media(max-height:640px)]:h-28 [@media(max-height:640px)]:w-24">
        {preview ? (
          // 내가 방금 고른 수강증 — 폼의 미리보기와 같은 주소다 (object URL)
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className={cn("h-full w-full object-contain transition-opacity", !judging && "opacity-50")} />
        ) : (
          <div className={cn("flex h-full w-full flex-col gap-1.5 bg-paper p-3", !judging && "opacity-50")}>
            <span className="h-2 w-1/2 rounded bg-line" />
            <span className="mt-1 flex h-16 flex-col justify-end gap-1 rounded-md bg-[#3e89e3] p-2">
              <span className="h-1.5 w-3/4 rounded bg-white/70" />
              <span className="h-1.5 w-1/2 rounded bg-white/50" />
            </span>
            <span className="h-1.5 w-full rounded bg-line" />
            <span className="h-1.5 w-5/6 rounded bg-line" />
            <span className="h-1.5 w-2/3 rounded bg-line" />
          </div>
        )}
        {judging ? (
          <span className="receipt-scan" />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="h-10 w-10 animate-spin rounded-full border-[3px] border-brand-200 border-t-brand-500" />
          </span>
        )}
      </div>
    </div>
  );
}

/** 올리기 → 판별 → 결과. 끝난 단계는 분홍 체크, 지금 단계는 도는 고리, 남은 단계는 회색 번호 */
function Steps({ steps }: { steps: ProgressStep[] }) {
  return (
    <ol aria-label="진행 단계" className="mt-5 flex items-start justify-center [@media(max-height:640px)]:mt-4">
      {steps.map((s, i) => (
        <li key={s.label} className="flex items-start">
          {i > 0 && <span aria-hidden className={cn("mt-3 h-0.5 w-7 rounded-full sm:w-10", steps[i - 1].state === "done" ? "bg-brand-400" : "bg-line")} />}
          <span className="flex w-14 flex-col items-center gap-1">
            <StepDot state={s.state} n={i + 1} />
            <span className={cn("text-xs font-bold", s.state === "todo" ? "text-mist" : s.state === "active" ? "text-brand-600" : "text-ink")}>
              {s.label}
              <span className="sr-only">{s.state === "done" ? " — 끝남" : s.state === "active" ? " — 진행 중" : " — 기다리는 중"}</span>
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function StepDot({ state, n }: { state: ProgressStep["state"]; n: number }) {
  if (state === "done") {
    return (
      <span aria-hidden className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-500 text-white shadow-pink">
        {/* 체크 — 작은 글리프라 도형(인라인 SVG)으로 그린다 (출석 격자 체크와 같은 예외) */}
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3.5 8.5l3 3 6-7" />
        </svg>
      </span>
    );
  }
  if (state === "active") {
    return (
      <span aria-hidden className="relative flex h-6 w-6 items-center justify-center rounded-full border-2 border-brand-100 bg-paper">
        <span className="absolute -inset-0.5 animate-spin rounded-full border-2 border-transparent border-t-brand-500" />
        <span className="h-2 w-2 rounded-full bg-brand-500" />
      </span>
    );
  }
  return (
    <span aria-hidden className="flex h-6 w-6 items-center justify-center rounded-full border border-line bg-paper text-[11px] font-black text-mist">
      {n}
    </span>
  );
}
