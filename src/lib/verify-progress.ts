/**
 * 등업신청 판별 중 화면의 글 (2026-10-06 Alan — "수강증 판별하는 동안에 학생들에게 지금 판별중입니다. 라는 로딩중 같은 것들이 쫌 보이면 좋겠어.
 * 아, 지금 판별중이구나 를 알 수 있도록"). 그리는 것은 `src/app/my/verify/VerifyProgress.tsx`.
 *
 * **브라우저가 실제로 아는 단계만 쓴다** — 올리기(저장소에 올리는 중)와 판별(서버가 글자를 읽고 반을 찾는 중) 둘이다.
 * 판별 안의 "글자 읽기 → 반 찾기" 는 서버 액션 한 번 안에서 일어나 브라우저가 경계를 모른다 — 시간으로 짐작해 "끝났어요" 를 찍지 않는다.
 * 그래서 판별 단계는 무엇을 보는지(이름 · 레벨 · 요일 · 시간 · 수강월)만 보여 주고, 오래 걸리면 그렇다고 말한다.
 */

export type VerifyStage = "upload" | "judge";

/** 한 단계가 이만큼 넘게 걸리면 "조금 오래 걸리고 있어요" — 보통은 몇 초 안에 끝난다 (수강증 판독 1~4초) */
export const SLOW_AFTER_SECONDS = 10;

/**
 * 판별 단계에서 보는 것 — 수강증 표기 규칙(CLAUDE.md "수강증 표기 규칙")에서 반을 가르는 칸들. 학생에게는 "무엇이 보여야 하나" 의 안내도 된다.
 * 수동 등업신청은 반을 학생이 골랐으니 보여 주지 않는다
 */
export const JUDGE_CHECKS = ["이름", "레벨", "요일", "시간", "수강월"] as const;

export type ProgressStep = { label: string; state: "done" | "active" | "todo" };

export type ProgressView = {
  /** 맨 위 분홍 배지 — Alan 의 말 그대로 "판별 중" */
  badge: string;
  title: string;
  body: string;
  steps: ProgressStep[];
  /**
   * 그 단계가 `SLOW_AFTER_SECONDS` 를 넘겼을 때만. 걸린 초(`seconds`)는 따로 준다 — 화면이 초를 화면 낭독기에 매초 읽히지 않게
   * (제목 · 설명만 알림 영역에 두고 초는 `aria-hidden`)
   */
  slow: { title: string; body: string; seconds: number } | null;
};

/**
 * @param stage 지금 단계 (`uploading` → 올리기, 서버 액션을 기다리는 중 → 판별)
 * @param manual 수동 등업신청 — 반을 학생이 골랐다. 판별(자동 등업)이 아니라 확인 · 접수다
 * @param stageSeconds 지금 단계가 시작된 뒤 지난 초
 */
export function progressView(stage: VerifyStage, manual: boolean, stageSeconds: number): ProgressView {
  const labels = manual ? ["올리기", "확인", "접수"] : ["올리기", "판별", "결과"];
  const current = stage === "upload" ? 0 : 1;
  const steps = labels.map((label, i): ProgressStep => ({ label, state: i < current ? "done" : i === current ? "active" : "todo" }));
  const seconds = Math.max(0, Math.floor(stageSeconds));
  const slowNow = seconds >= SLOW_AFTER_SECONDS;

  if (stage === "upload") {
    return {
      badge: "올리는 중",
      title: "수강증을 올리고 있어요",
      body: manual ? "다 올라가면 고르신 반과 함께 수강증을 확인해요." : "다 올라가면 바로 판별을 시작해요.",
      steps,
      slow: slowNow
        ? { title: "올리는 데 시간이 걸리고 있어요", body: "인터넷이 느리거나 파일이 크면 그래요. 연결이 끊기지 않았는지 확인해 주세요.", seconds }
        : null,
    };
  }
  return {
    badge: manual ? "확인 중" : "판별 중",
    title: manual ? "수동 등업신청을 접수하고 있어요" : "지금 수강증을 판별하고 있어요",
    body: manual
      ? "수강증을 읽어 고르신 반과 함께 선생님 확인 화면에 올려요."
      : "수강증 글자를 읽어 내 반을 찾고, 바로 등업할 수 있는지 확인해요.",
    steps,
    // 길어도 1분 — 서버가 차례 기다림 20초 + 읽기 30초 안에 답을 준다 (`src/lib/ocr.ts`, 페이지 maxDuration 60초)
    slow: slowNow
      ? { title: "조금 오래 걸리고 있어요", body: "여러 명이 한꺼번에 올리면 차례대로 읽어서 그래요. 길어도 1분 안에 끝나요.", seconds }
      : null,
  };
}
