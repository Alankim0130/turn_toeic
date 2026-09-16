import { describe, expect, it } from "vitest";
import { PULL_THRESHOLD, pullDistance, pullOffset, shouldRefresh } from "./pull-to-refresh";

const at = (o: Partial<Parameters<typeof pullDistance>[0]> = {}) =>
  pullDistance({ startY: 100, startX: 50, y: 100, x: 50, scrollY: 0, touches: 1, ...o });

describe("pullDistance — 당김인지 아닌지", () => {
  it("맨 위에서 아래로 끌면 그 거리", () => {
    expect(at({ y: 190 })).toBe(90);
  });

  it("손을 댄 곳이 맨 위가 아니면 당김이 아니다", () => {
    expect(at({ startY: null, y: 190 })).toBeNull();
  });

  it("화면이 내려가 있으면 당김이 아니다 (스크롤 중)", () => {
    expect(at({ y: 190, scrollY: 240 })).toBeNull();
  });

  it("위로 올리는 것은 당김이 아니다", () => {
    expect(at({ y: 20 })).toBeNull();
  });

  it("가로로 더 움직이면 당김이 아니다 (옆으로 넘기기·글자 선택)", () => {
    expect(at({ y: 130, x: 300 })).toBeNull();
  });

  it("두 손가락은 당김이 아니다 (확대)", () => {
    expect(at({ y: 190, touches: 2 })).toBeNull();
  });

  it("제자리는 당김이 아니다", () => {
    expect(at()).toBeNull();
  });
});

describe("shouldRefresh — 손을 뗐을 때", () => {
  it("충분히 당겼으면 새로고침", () => {
    expect(shouldRefresh(PULL_THRESHOLD, 0)).toBe(true);
  });

  it("조금 당긴 것으로는 안 한다", () => {
    expect(shouldRefresh(PULL_THRESHOLD - 1, 0)).toBe(false);
  });

  it("당기는 사이에 화면이 내려갔으면 안 한다", () => {
    expect(shouldRefresh(PULL_THRESHOLD + 50, 120)).toBe(false);
  });
});

describe("pullOffset — 표시가 내려오는 거리", () => {
  it("당길수록 따라 내려온다", () => {
    expect(pullOffset(40)).toBe(40);
  });

  it("임계점을 넘으면 거의 멈춘다", () => {
    expect(pullOffset(400)).toBe(PULL_THRESHOLD + 16);
  });
});
