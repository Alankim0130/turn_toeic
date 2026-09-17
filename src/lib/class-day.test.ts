import { describe, expect, it } from "vitest";
import { initialDay, initialMonth } from "./class-day";

const SEP = ["2026-09-03", "2026-09-04", "2026-09-07", "2026-09-17", "2026-09-21"];

describe("initialDay — 달력이 처음 고르는 날짜", () => {
  it("오늘 수업이 있으면 오늘", () => {
    expect(initialDay(SEP, "2026-09-17")).toBe("2026-09-17");
  });

  it("오늘 수업이 없으면 다음 수업일", () => {
    expect(initialDay(SEP, "2026-09-10")).toBe("2026-09-17");
  });

  it("개강 전이면 첫 수업일", () => {
    expect(initialDay(SEP, "2026-08-20")).toBe("2026-09-03");
  });

  it("다 지난 달이면 마지막 수업일 — 빈 날을 고르지 않는다", () => {
    expect(initialDay(SEP, "2026-10-05")).toBe("2026-09-21");
  });

  it("수업일이 없으면 고르지 않는다", () => {
    expect(initialDay([], "2026-09-17")).toBeNull();
  });

  it("같은 날짜가 두 번 와도(주5일 두 반) 한 번만 센다", () => {
    expect(initialDay(["2026-09-21", "2026-09-21", "2026-09-17"], "2026-09-01")).toBe("2026-09-17");
  });
});

describe("initialMonth — 대시보드가 띄울 달", () => {
  const MONTHS = [
    { year: 2026, month: 8 },
    { year: 2026, month: 9 },
    { year: 2026, month: 10 },
  ];

  it("이번 달이 있으면 이번 달", () => {
    expect(initialMonth(MONTHS, "2026-09-17")).toBe(1);
  });

  it("이번 달이 없으면 앞으로 올 첫 달", () => {
    expect(initialMonth([MONTHS[0], MONTHS[2]], "2026-09-17")).toBe(1);
  });

  it("다 지났으면 마지막 달 — 빈 달력을 띄우지 않는다", () => {
    expect(initialMonth(MONTHS, "2026-12-01")).toBe(2);
  });

  it("아직 시작 전이면 첫 달", () => {
    expect(initialMonth(MONTHS, "2026-06-01")).toBe(0);
  });

  it("해가 바뀌어도 순서대로 — 문자열 비교가 12월 > 2월 로 뒤집히지 않는다", () => {
    const across = [{ year: 2026, month: 12 }, { year: 2027, month: 2 }];
    expect(initialMonth(across, "2027-01-15")).toBe(1);
    expect(initialMonth(across, "2026-12-15")).toBe(0);
  });

  it("빈 목록은 -1", () => {
    expect(initialMonth([], "2026-09-17")).toBe(-1);
  });
});
