/**
 * 당겨서 새로고침의 판정 (2026-09-16 Alan 요청 — 홈 화면 앱에는 주소창이 없다).
 *
 * 화면을 가로채지 않는 것이 제일 중요하다 — 스크롤하려던 손짓을 새로고침으로 잘못 읽으면
 * 앱이 제멋대로 다시 뜬다. 그래서 `preventDefault` 를 쓰지 않고, 조건을 좁게 둔다.
 * 컴포넌트(`components/pwa/PullToRefresh.tsx`)는 이 함수만 부른다.
 */

/** 이만큼 당기면 새로고침 */
export const PULL_THRESHOLD = 80;
/** 당김 표시가 나타나기 시작하는 거리 */
export const PULL_START = 12;

export type PullInput = {
  /** 손을 댄 곳 (맨 위가 아니었으면 null — 당김이 아니다) */
  startY: number | null;
  startX: number;
  y: number;
  x: number;
  /** 지금 스크롤 위치. 0 보다 크면 화면이 내려간 것이라 당김이 아니다 */
  scrollY: number;
  /** 손가락 수. 두 개 이상이면 확대·스와이프다 */
  touches: number;
};

/** 지금 당긴 거리. 당김이 아니면 null (= 그만 본다) */
export function pullDistance(input: PullInput): number | null {
  if (input.startY == null || input.touches !== 1 || input.scrollY > 0) return null;
  const dy = input.y - input.startY;
  const dx = Math.abs(input.x - input.startX);
  // 위로 올렸거나, 가로로 더 움직였으면 (옆으로 넘기기·글자 선택) 당김이 아니다
  if (dy <= 0 || dx > dy) return null;
  return dy;
}

/** 손을 뗐을 때 새로고침할 것인가 */
export const shouldRefresh = (distance: number, scrollY: number) => distance >= PULL_THRESHOLD && scrollY <= 0;

/** 당김 표시를 얼마나 내릴 것인가 — 임계점을 넘으면 거의 멈춘다 (여기까지라는 신호) */
export const pullOffset = (distance: number) => Math.min(distance, PULL_THRESHOLD + 16);
