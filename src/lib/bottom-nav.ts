/**
 * 하단 바를 **지금 보이는 화면 바닥**에 붙이기 위한 계산 (2026-09-19 Alan —
 * "불라방을 클릭하고 스크롤을 밑으로 내리니 하단 네비게이션바가 위로 조금 올라오고 있어").
 *
 * 하단 바는 `position: fixed; bottom: 0` 이라 **레이아웃 뷰포트** 바닥에 선다. 그런데 iOS 사파리는
 * 스크롤할 때 주소창·도구막대를 접었다 폈다 하면서 보이는 화면(비주얼 뷰포트)만 바뀌고,
 * 고정 요소는 한 박자 늦게 따라온다 — 그 동안 바가 화면 중간에 뜬 채로 그려지고 그 아래로
 * 페이지 내용이 비친다 (Alan 이 찍은 화면이 그 순간이다). 바에 `backdrop-filter`(glass)가 걸려 있어
 * 더 눈에 띈다.
 *
 * 그래서 `visualViewport` 가 바뀔 때마다 **얼마나 어긋났는지 재서 그만큼 올린다.** 어긋남이 없으면
 * `translateY(0)` 이라도 넣어 준다 — 값을 다시 써 주는 것 자체가 그 늦은 그림을 제자리로 되돌린다.
 *
 * `visualViewport` 가 없는 브라우저에서는 아무것도 하지 않는다 (지금 그대로).
 */

/** 이만큼 넘게 어긋나면 도구막대가 아니라 **키보드**다 — 그때는 건드리지 않는다 */
export const MAX_LIFT = 150;

/**
 * @param layoutHeight   `document.documentElement.clientHeight` — 고정 요소가 서는 기준
 * @param viewportHeight `visualViewport.height` — 지금 실제로 보이는 높이
 * @param offsetTop      `visualViewport.offsetTop` — 확대했을 때 위로 밀린 양
 * @param typing         글자를 치는 중인가 (키보드가 올라와 있을 수 있다)
 * @returns 바를 올릴 픽셀 (0 이면 그대로 바닥)
 */
export function bottomNavLift(layoutHeight: number, viewportHeight: number, offsetTop: number, typing = false): number {
  if (typing) return 0;
  const gap = Math.round(layoutHeight - viewportHeight - offsetTop);
  if (!Number.isFinite(gap) || gap <= 0) return 0;
  // 키보드만큼 올리면 바가 자판 위에 올라타 입력칸을 가린다 — 그건 지금처럼 자판 뒤에 둔다
  return gap > MAX_LIFT ? 0 : gap;
}
