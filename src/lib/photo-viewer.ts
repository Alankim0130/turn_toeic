/**
 * 사진 팝업 뷰어의 판정 — 손가락 넘기기 · 회전 칸 크기 · 다음 장.
 *
 * 화면(`HomeworkPhotos`)에서 바로 계산하지 않고 여기에 모아 둔다 — 셋 다 경계가 섬세해서
 * 눈으로는 틀린 줄 모르고 지나간다 (`bottom-nav.ts`·`pull-to-refresh.ts` 와 같은 이유).
 */

/** 이 거리(px)는 넘어야 넘기기로 본다 — 누르다 손이 살짝 밀린 것과 가른다 */
export const MIN_SWIPE = 48;
/** 가로가 세로보다 이 배수만큼 커야 넘긴다 */
const DOMINANCE = 1.5;

/**
 * 손가락을 옆으로 밀었나. 왼쪽으로 밀면 다음(`1`), 오른쪽으로 밀면 이전(`-1`), 아니면 `null`.
 *
 * **세로로 훑으려던 손짓을 넘기기로 읽지 않는다** — 보던 사진이 제멋대로 바뀌면 고장난 것처럼 보인다.
 * 그래서 거리(`MIN_SWIPE`)와 **가로가 세로보다 확실히 큰지**를 함께 본다.
 */
export function swipeDirection(dx: number, dy: number): 1 | -1 | null {
  if (Math.abs(dx) < MIN_SWIPE) return null;
  if (Math.abs(dx) < Math.abs(dy) * DOMINANCE) return null;
  return dx < 0 ? 1 : -1;
}

/**
 * 회전한 사진이 화면을 넘지 않게 담는 칸의 크기.
 *
 * **90·270도로 돌리면 가로·세로가 뒤바뀐다** — 돌리기 전 크기를 그대로 두면 돌린 뒤 칸을 넘어
 * 사진의 위아래가 잘린다. 그래서 그 두 각도에서는 폭·높이를 맞바꿔 준다.
 * 칸을 아직 못 재었으면(첫 그림) `null` — 화면이 CSS 기본값(`max-w-full`)으로 그린다.
 */
export function fitBox(box: { w: number; h: number }, deg: number): { maxWidth: number; maxHeight: number } | null {
  if (!(box.w > 0) || !(box.h > 0)) return null;
  const sideways = ((deg % 360) + 360) % 180 !== 0;
  return sideways ? { maxWidth: box.h, maxHeight: box.w } : { maxWidth: box.w, maxHeight: box.h };
}

/** 다음·이전 장. 끝에서 넘기면 처음으로 **돌아간다** — 열 장을 훑다 막히면 되돌아가야 한다 */
export function stepIndex(index: number, dir: 1 | -1, total: number): number {
  if (total <= 0) return 0;
  return (index + dir + total) % total;
}
