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
 *
 * **유령 키보드** (2026-10-22 Alan — 관리자 반 편성 화면에서 "위로 스크롤을 올리니 하단네비게이션바가 위로 올라가고 있어").
 * 홈 화면 앱(iOS 26 · 27)에서 글자를 치고 키보드를 닫은 뒤 iOS 가 **키보드가 아직 있는 줄 알고** 보이는 화면(비주얼 뷰포트)을
 * 키보드 높이만큼 짧게 붙잡아 둔다 (WebKit 버그 — Apple 개발자 포럼 800125 · 800154, FB19889436. 26.1 에서 고쳐졌다가 27 베타에서 다시 보고됐다).
 * 레이아웃 뷰포트는 그 짧은 화면에 밀려 다녀서(페이지를 아래로 넘기면 짧은 화면의 바닥이 레이아웃 뷰포트를 끌고 내려간다)
 * `visualViewport.offsetTop` 이 0 ~ 키보드 높이 사이를 오가고, **고정 · 붙박이 요소가 전부 offsetTop 만큼 위로** 그려진다.
 * Alan 의 화면은 하단 메뉴 · 저장 막대가 345px(키보드 높이) 위에 떠 있었고 머리줄은 화면 위로 사라져 있었다.
 * 표시는 "글자를 치는 중이 아닌데 `visualViewport.height` 가 창 높이(`innerHeight` — 키보드와 상관없다)보다 키보드만큼 짧다" 이다.
 * 그때 실제로 보이는 화면의 맨 위는 비주얼 뷰포트의 맨 위라서, 고정 요소를 `offsetTop + 창 높이 − 고정 요소 바닥` 만큼 **내리면** 제자리다
 * (`viewportShift`). 재는 일 · 나눠 주는 일은 `components/layout/visible-viewport.ts`.
 */

/** 이만큼 넘게 어긋나면 도구막대가 아니라 **키보드**다 — 그때는 건드리지 않는다 */
export const MAX_LIFT = 150;

/**
 * 글자를 치는 중이 아닌데 보이는 화면이 창 높이보다 이만큼 넘게 짧으면 iOS 가 붙잡아 둔 **유령 키보드**다.
 * 도구막대(수십 px)보다 크고 가장 작은 자판(216px 남짓)보다 작다 — PC 의 가로 스크롤 막대(17px 안팎)도 걸리지 않는다.
 */
export const GHOST_MIN = 120;

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

/** 지금 화면을 잰 값 — 읽는 일은 `components/layout/visible-viewport.ts` 가 한다 */
export type ViewportMetrics = {
  /** `window.innerHeight` — 창 높이. 키보드와 상관없어서 유령 키보드가 남아도 그대로다 */
  innerHeight: number;
  /** `document.documentElement.clientHeight` — 처음 레이아웃 높이 */
  layoutHeight: number;
  /** `visualViewport.height` — 지금 보인다고 브라우저가 말하는 높이 */
  viewportHeight: number;
  /** `visualViewport.offsetTop` — 비주얼 뷰포트가 레이아웃 뷰포트 맨 위에서 아래로 밀린 양 */
  offsetTop: number;
  /** `visualViewport.scale` — 손가락으로 확대한 배율 */
  scale: number;
  /** `position: fixed; bottom: 0` 상자의 바닥 (getBoundingClientRect) — 브라우저가 고정 요소의 바닥을 실제로 둔 곳 */
  boxBottom: number;
  /** 글자를 치는 중 — 키보드가 진짜로 올라와 있을 수 있다 (`isTypingTarget`) */
  typing: boolean;
};

export type ViewportShift = {
  /** 바닥에 붙는 것(하단 메뉴 · 저장 막대)을 옮길 픽셀 — **양수면 아래로, 음수면 위로** (translateY 에 그대로 넣는다) */
  pin: number;
  /** 위에 붙거나 화면 전체를 덮는 것(머리줄 · 팝업 · 서랍)을 내릴 픽셀 — 유령 키보드일 때만 0 이 아니다 */
  ghost: number;
};

/**
 * 고정 · 붙박이 요소를 지금 보이는 화면에 맞추려면 얼마나 옮겨야 하나.
 *
 * - 글자를 치는 중이면 손대지 않는다 (진짜 키보드 — 바는 지금처럼 자판 뒤에 둔다).
 * - **유령 키보드** (확대하지 않았고 · 보이는 화면이 창 높이보다 `GHOST_MIN` 넘게 짧다): 보이는 화면의 맨 위가 비주얼 뷰포트의 맨 위,
 *   높이는 창 높이다. 고정 요소 바닥이 그 화면 바닥(`offsetTop + 창 높이`)에 오도록 **내린다**. 페이지를 위로 넘겨 offsetTop 이 0 이면
 *   고정 요소가 이미 제자리라 0 이다. 머리줄 · 팝업도 같은 양을 내린다 (`ghost`).
 * - 그 밖에는 예전 그대로 — 도구막대 · 확대로 보이는 바닥이 레이아웃 바닥보다 조금(≤ MAX_LIFT) 위면 바닥 막대만 그만큼 올린다.
 */
export function viewportShift(m: ViewportMetrics): ViewportShift {
  const none: ViewportShift = { pin: 0, ghost: 0 };
  if (m.typing) return none;
  const values = [m.innerHeight, m.layoutHeight, m.viewportHeight, m.offsetTop, m.scale, m.boxBottom];
  if (!values.every(Number.isFinite)) return none;
  const zoomed = Math.abs(m.scale - 1) > 0.01;
  const full = Math.max(m.innerHeight, m.layoutHeight);
  if (!zoomed && full - m.viewportHeight >= GHOST_MIN) {
    const drop = Math.round(m.offsetTop + full - m.boxBottom);
    // 내리는 쪽만 — 그 밖의 값은 잰 것이 어긋난 것이다 (그대로 둔다)
    const ghost = drop > 0 && drop < full ? drop : 0;
    return { pin: ghost, ghost };
  }
  const lift = bottomNavLift(m.layoutHeight, m.viewportHeight, m.offsetTop);
  return { pin: lift ? -lift : 0, ghost: 0 };
}

/** 누르면 자판이 뜨지 않는 입력칸 — 체크 · 단추 · 파일 고르기 */
const NO_KEYBOARD = new Set(["button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit"]);

/** 지금 포커스가 자판(또는 아이폰의 고르기 바퀴)을 띄우는 칸인가 — 글 칸 · 고르기 칸 · 글 편집기(contenteditable) */
export function isTypingTarget(el: { tagName?: string; type?: string; isContentEditable?: boolean } | null | undefined): boolean {
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = (el.tagName ?? "").toUpperCase();
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") return !NO_KEYBOARD.has((el.type || "text").toLowerCase());
  return false;
}
