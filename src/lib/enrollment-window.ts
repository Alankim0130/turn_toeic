/**
 * 등록 1건의 기간과 상태 — **고른 반의 개강일~종강일로** 정한다 (2026-09-22).
 * 수강증 승인(`approveVerificationWith`)과 스태프 반 배정(`assignSections`)이 같은 규칙을 쓴다.
 * DB 도 같은 규칙으로 다시 맞춘다 — 등록 상태는 트리거가 날짜로 계산하고(`private.order_status_for`),
 * 반 배정이 바뀌면 기간을 반의 날짜로 다시 잡는다(`private.sync_order_window`, 마이그레이션 20260922113000).
 * 순수 함수 (`enrollment-window.test.ts`).
 */

export type AssignableSection = { id: number; term_id: number; enrollment_opens_at: string; closes_at: string };

/**
 * 한 등록에 넣을 수 있는 반인가. 안 되면 이유를 돌려준다.
 * - **한 달(기수)의 반만** — 등록은 매달 한다(도메인 규칙 4). 9월 반과 10월 반을 한 등록에 넣으면 기간이 두 달로 늘어난다.
 * - **이미 종강한 반은 안 된다** — 배정하자마자 수강생으로 올렸다가 다음 날 졸업생으로 내리게 된다.
 */
export function assignableError(sections: readonly AssignableSection[], today: string): string | null {
  if (sections.length === 0) return "배정할 반을 하나 이상 골라 주세요.";
  if (new Set(sections.map((s) => s.term_id)).size > 1) return "한 번에 한 달(기수)의 반만 배정할 수 있어요. 달마다 따로 배정해 주세요.";
  if (sections.some((s) => s.closes_at < today)) return "이미 종강한 반은 배정할 수 없어요.";
  return null;
}

/**
 * 지금 등록이 어느 단계인가 — **날짜로** 정한다 (DB 의 `private.order_status_for` 와 같다).
 * 상태 열은 DB 가 날짜로 맞추지만 화면은 한 번 더 날짜를 보아, 자정 배치 사이에도 "수강 중" 이 늦게 바뀌지 않게 한다.
 */
export function orderPhase(o: { activates_on: string; access_until: string }, today: string): "preliminary" | "active" | "expired" {
  if (today < o.activates_on) return "preliminary";
  if (today > o.access_until) return "expired";
  return "active";
}

/** 등록 기간 = 가장 이른 개강일 ~ 가장 늦은 종강일. 상태 = 개강 전 preliminary · 기간 안 active (종강 뒤는 위에서 막는다) */
export function orderWindow(sections: readonly AssignableSection[], today: string) {
  const activatesOn = sections.map((s) => s.enrollment_opens_at).sort()[0];
  const accessUntil = sections.map((s) => s.closes_at).sort().at(-1)!;
  const status: "active" | "preliminary" = activatesOn <= today ? "active" : "preliminary";
  return { activatesOn, accessUntil, status };
}
