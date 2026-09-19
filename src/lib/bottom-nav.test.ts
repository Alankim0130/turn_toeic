import { describe, expect, it } from "vitest";
import { bottomNavLift, MAX_LIFT } from "./bottom-nav";

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
