import { describe, expect, it } from "vitest";
import { bottomNavLift, GHOST_MIN, isTypingTarget, MAX_LIFT, viewportShift, type ViewportMetrics } from "./bottom-nav";

describe("bottomNavLift — 하단 바를 보이는 화면 바닥에 붙인다", () => {
  it("어긋남이 없으면 0 (그대로 바닥)", () => {
    expect(bottomNavLift(800, 800, 0)).toBe(0);
  });

  it("도구막대가 가리는 만큼 올린다", () => {
    expect(bottomNavLift(844, 756, 0)).toBe(88);
  });

  it("확대해서 위로 밀린 양(offsetTop)도 뺀다", () => {
    expect(bottomNavLift(844, 700, 44)).toBe(100);
  });

  it("소수점은 반올림한다 — 1px 씩 떠는 것을 막는다", () => {
    expect(bottomNavLift(844, 795.4, 0)).toBe(49);
  });

  it("보이는 높이가 더 크면(고무줄 스크롤) 올리지 않는다", () => {
    expect(bottomNavLift(800, 860, 0)).toBe(0);
  });

  it("키보드만큼 크게 어긋나면 올리지 않는다 — 바가 자판 위에 올라타면 입력칸을 가린다", () => {
    expect(bottomNavLift(844, 844 - MAX_LIFT - 1, 0)).toBe(0);
    expect(bottomNavLift(844, 500, 0)).toBe(0);
  });

  it("한계선까지는 올린다", () => {
    expect(bottomNavLift(844, 844 - MAX_LIFT, 0)).toBe(MAX_LIFT);
  });

  it("글자를 치는 중이면 손대지 않는다", () => {
    expect(bottomNavLift(844, 756, 0, true)).toBe(0);
  });

  it("잴 수 없는 값이면 0", () => {
    expect(bottomNavLift(NaN, 756, 0)).toBe(0);
  });
});

/** 아이폰 16 Pro Max 홈 화면 앱(상태 표시줄 아래 873px) — Alan 의 2026-10-22 캡처 */
const phone = (over: Partial<ViewportMetrics> = {}): ViewportMetrics => ({
  innerHeight: 873,
  layoutHeight: 873,
  viewportHeight: 873,
  offsetTop: 0,
  scale: 1,
  boxBottom: 873,
  typing: false,
  ...over,
});
/** 키보드를 닫았는데 iOS 가 화면을 키보드(345px)만큼 짧게 붙잡아 둔 상태 */
const ghost = (over: Partial<ViewportMetrics> = {}) => phone({ viewportHeight: 528, ...over });

describe("viewportShift — 키보드를 닫은 뒤 남는 유령 키보드 (2026-10-22 반 편성 화면)", () => {
  it("평소에는 아무것도 옮기지 않는다", () => {
    expect(viewportShift(phone())).toEqual({ pin: 0, ghost: 0 });
  });

  it("페이지를 내려 비주얼 뷰포트가 레이아웃 뷰포트 아래쪽에 붙으면(offsetTop 345) 고정 요소를 345px 내린다 — 캡처의 바로 그 상태", () => {
    expect(viewportShift(ghost({ offsetTop: 345 }))).toEqual({ pin: 345, ghost: 345 });
  });

  it("중간쯤이면 그만큼만 — 내리는 양은 offsetTop 을 따라간다", () => {
    expect(viewportShift(ghost({ offsetTop: 120 }))).toEqual({ pin: 120, ghost: 120 });
  });

  it("페이지를 위로 넘겨 offsetTop 이 0 이면 고정 요소가 이미 제자리다", () => {
    expect(viewportShift(ghost({ offsetTop: 0 }))).toEqual({ pin: 0, ghost: 0 });
  });

  it("고정 요소의 바닥이 짧은 화면에 맞춰 섰으면(레이아웃 뷰포트가 짧다) 그 차이만큼 내린다", () => {
    expect(viewportShift(ghost({ boxBottom: 528 }))).toEqual({ pin: 345, ghost: 345 });
  });

  it("창 높이가 늘 기준이다 — 처음 레이아웃 높이가 더 크면 그쪽", () => {
    expect(viewportShift(ghost({ innerHeight: 860, offsetTop: 345 }))).toEqual({ pin: 345, ghost: 345 });
  });

  it("글자를 치는 중이면 진짜 키보드다 — 손대지 않는다", () => {
    expect(viewportShift(ghost({ offsetTop: 345, typing: true }))).toEqual({ pin: 0, ghost: 0 });
  });

  it("손가락으로 확대한 동안은 유령 키보드로 보지 않고 예전 보정만 한다 (바닥 막대만 조금 올린다)", () => {
    expect(viewportShift(phone({ layoutHeight: 844, innerHeight: 844, viewportHeight: 700, offsetTop: 44, scale: 1.2, boxBottom: 844 }))).toEqual({ pin: -100, ghost: 0 });
    expect(viewportShift(phone({ viewportHeight: 400, offsetTop: 200, scale: 2 }))).toEqual({ pin: 0, ghost: 0 });
  });

  it("도구막대만큼(GHOST_MIN 보다 작게) 짧으면 예전 그대로 — 바닥 막대만 올린다", () => {
    expect(viewportShift(phone({ layoutHeight: 844, innerHeight: 844, viewportHeight: 756, boxBottom: 844 }))).toEqual({ pin: -88, ghost: 0 });
    expect(viewportShift(phone({ viewportHeight: 873 - GHOST_MIN + 1 }))).toEqual({ pin: -(GHOST_MIN - 1), ghost: 0 });
  });

  it("사파리 도구막대를 접어 창이 처음 레이아웃보다 커져도 그대로다", () => {
    expect(viewportShift({ innerHeight: 750, layoutHeight: 660, viewportHeight: 750, offsetTop: 0, scale: 1, boxBottom: 750, typing: false })).toEqual({ pin: 0, ghost: 0 });
  });

  it("PC 의 가로 스크롤 막대(17px)는 유령 키보드가 아니다", () => {
    expect(viewportShift({ innerHeight: 900, layoutHeight: 883, viewportHeight: 883, offsetTop: 0, scale: 1, boxBottom: 883, typing: false })).toEqual({ pin: 0, ghost: 0 });
  });

  it("잰 값이 어긋나면(위로 올리라거나 창보다 더 내리라면) 옮기지 않는다", () => {
    expect(viewportShift(ghost({ boxBottom: 1200 }))).toEqual({ pin: 0, ghost: 0 });
    expect(viewportShift(ghost({ offsetTop: 873, boxBottom: 0 }))).toEqual({ pin: 0, ghost: 0 });
  });

  it("잴 수 없는 값이면 0 — -0 도 내지 않는다", () => {
    expect(viewportShift(phone({ viewportHeight: NaN }))).toEqual({ pin: 0, ghost: 0 });
    const r = viewportShift(phone());
    expect(Object.is(r.pin, 0) && Object.is(r.ghost, 0)).toBe(true);
  });
});

describe("isTypingTarget — 자판을 띄우는 칸에 포커스가 있나", () => {
  it("글 칸 · 글 상자 · 고르기 칸 · 글 편집기", () => {
    expect(isTypingTarget({ tagName: "INPUT", type: "text" })).toBe(true);
    expect(isTypingTarget({ tagName: "INPUT" })).toBe(true);
    expect(isTypingTarget({ tagName: "INPUT", type: "DATE" })).toBe(true);
    expect(isTypingTarget({ tagName: "TEXTAREA" })).toBe(true);
    expect(isTypingTarget({ tagName: "SELECT" })).toBe(true);
    expect(isTypingTarget({ tagName: "DIV", isContentEditable: true })).toBe(true);
  });

  it("체크 · 단추 · 파일 고르기 · 그 밖의 요소는 아니다", () => {
    for (const type of ["checkbox", "radio", "button", "submit", "file", "range"]) expect(isTypingTarget({ tagName: "INPUT", type })).toBe(false);
    expect(isTypingTarget({ tagName: "BUTTON" })).toBe(false);
    expect(isTypingTarget({ tagName: "BODY" })).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
