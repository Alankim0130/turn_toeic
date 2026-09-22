import { describe, expect, it } from "vitest";
import { fitBox, MIN_SWIPE, stepIndex, swipeDirection } from "./photo-viewer";

describe("swipeDirection", () => {
  it("왼쪽으로 밀면 다음, 오른쪽으로 밀면 이전", () => {
    expect(swipeDirection(-120, 0)).toBe(1);
    expect(swipeDirection(120, 0)).toBe(-1);
  });

  it("짧게 밀린 것은 넘기지 않는다 — 누르다 손이 흔들린 것이다", () => {
    expect(swipeDirection(-(MIN_SWIPE - 1), 0)).toBeNull();
    expect(swipeDirection(10, 2)).toBeNull();
  });

  it("세로로 훑은 손짓은 넘기지 않는다 — 보던 사진이 제멋대로 바뀌면 안 된다", () => {
    expect(swipeDirection(0, -300)).toBeNull();
    // 가로로 60 갔지만 세로로 200 갔다 = 스크롤이다
    expect(swipeDirection(-60, 200)).toBeNull();
  });

  it("비스듬해도 가로가 확실히 크면 넘긴다", () => {
    expect(swipeDirection(-150, 40)).toBe(1);
  });
});

describe("fitBox", () => {
  const box = { w: 390, h: 700 };

  it("0·180도는 칸 그대로", () => {
    expect(fitBox(box, 0)).toEqual({ maxWidth: 390, maxHeight: 700 });
    expect(fitBox(box, 180)).toEqual({ maxWidth: 390, maxHeight: 700 });
  });

  it("90·270도는 가로·세로를 맞바꾼다 — 안 바꾸면 돌린 사진이 잘린다", () => {
    expect(fitBox(box, 90)).toEqual({ maxWidth: 700, maxHeight: 390 });
    expect(fitBox(box, 270)).toEqual({ maxWidth: 700, maxHeight: 390 });
  });

  it("360도를 넘겨도 같다", () => {
    expect(fitBox(box, 450)).toEqual({ maxWidth: 700, maxHeight: 390 });
  });

  it("아직 못 잰 칸은 null — CSS 기본값으로 그린다", () => {
    expect(fitBox({ w: 0, h: 0 }, 0)).toBeNull();
    expect(fitBox({ w: 390, h: 0 }, 90)).toBeNull();
  });
});

describe("stepIndex", () => {
  it("끝에서 다음을 누르면 처음으로 돌아간다", () => {
    expect(stepIndex(3, 1, 4)).toBe(0);
    expect(stepIndex(0, -1, 4)).toBe(3);
  });

  it("한 장뿐이면 그대로", () => {
    expect(stepIndex(0, 1, 1)).toBe(0);
    expect(stepIndex(0, -1, 1)).toBe(0);
  });

  it("사진이 없으면 0", () => {
    expect(stepIndex(0, 1, 0)).toBe(0);
  });
});
