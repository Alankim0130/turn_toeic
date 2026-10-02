import { describe, expect, it } from "vitest";
import { holidaysOfYear, monthHolidayNames } from "./holidays";

describe("공휴일 — 학생 달력에도 대체공휴일까지 적는다 (2026-10-02 Alan)", () => {
  it("2026년 10월: 개천절이 토요일이라 10/5(월) 대체공휴일, 그리고 한글날", () => {
    expect([...monthHolidayNames(2026, 10)]).toEqual([
      ["2026-10-03", ["개천절"]],
      ["2026-10-05", ["대체공휴일"]],
      ["2026-10-09", ["한글날"]],
    ]);
  });

  it("2026년 대체공휴일 — 삼일절(일) · 부처님오신날(일) · 광복절(토) · 개천절(토)", () => {
    expect(holidaysOfYear(2026).filter((h) => h.substitute).map((h) => h.date)).toEqual(["2026-03-02", "2026-05-25", "2026-08-17", "2026-10-05"]);
  });

  it("달의 끝날까지 본다 (31일 · 2월)", () => {
    expect(monthHolidayNames(2026, 12).get("2026-12-25")).toEqual(["성탄절"]);
    expect(monthHolidayNames(2027, 2).get("2027-02-09")).toEqual(["대체공휴일"]); // 설날(일) 다음 첫 평일
    expect([...monthHolidayNames(2026, 11)]).toEqual([]);
  });

  it("자료가 없는 해는 비워 둔다 (지어내지 않는다)", () => {
    expect(monthHolidayNames(2099, 10).size).toBe(0);
  });
});
