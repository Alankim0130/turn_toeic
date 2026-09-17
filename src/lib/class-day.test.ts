import { describe, expect, it } from "vitest";
import { initialDay } from "./class-day";

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
