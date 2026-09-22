import { describe, expect, it } from "vitest";
import { classDayRounds, MATERIAL_ROUND_MAX, roundRowCount } from "./study-rounds";

describe("비대면 자료 회차 = 그 달 수업일 순서", () => {
  it("월수금 · 화목금을 합쳐 날짜순 (1회차 = 첫 수업일)", () => {
    // 9월: 화목금 9/3(목) · 월수금 9/4(금) · 화목금 9/8(화) · 월수금 9/7(월)
    expect(classDayRounds(["2026-09-04", "2026-09-03", "2026-09-08", "2026-09-07"])).toEqual(["2026-09-03", "2026-09-04", "2026-09-07", "2026-09-08"]);
  });

  it("같은 날은 하루로 센다", () => {
    expect(classDayRounds(["2026-09-03", "2026-09-03", "2026-09-04"])).toEqual(["2026-09-03", "2026-09-04"]);
  });

  it("개강일~종강일 밖 수업일은 회차가 아니다", () => {
    expect(classDayRounds(["2026-09-02", "2026-09-03", "2026-10-04"], { opens: "2026-09-03", closes: "2026-10-03" })).toEqual(["2026-09-03"]);
  });
});

describe("관리자 화면 회차 줄 수", () => {
  it("수업일 수와 올린 회차 중 큰 쪽 + 빈 줄 하나", () => {
    expect(roundRowCount(19, 0)).toBe(20);
    expect(roundRowCount(19, 22)).toBe(23);
    expect(roundRowCount(0, 0)).toBe(1);
  });
  it("끝(60회차)을 넘지 않는다", () => {
    expect(roundRowCount(70, 0)).toBe(MATERIAL_ROUND_MAX);
  });
});
