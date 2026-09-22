import { describe, expect, it } from "vitest";
import { assignableError, orderPhase, orderWindow, type AssignableSection } from "./enrollment-window";

describe("등록 단계 = 날짜", () => {
  const o = { activates_on: "2026-09-03", access_until: "2026-10-03" };
  it("개강 전 · 기간 안(양 끝 포함) · 종강 뒤", () => {
    expect(orderPhase(o, "2026-09-02")).toBe("preliminary");
    expect(orderPhase(o, "2026-09-03")).toBe("active");
    expect(orderPhase(o, "2026-10-03")).toBe("active");
    expect(orderPhase(o, "2026-10-04")).toBe("expired");
  });
});

// 운영 날짜: 9월 기수 9/3~10/3 · 10월 기수 10/6~11/1
const sep = (id: number): AssignableSection => ({ id, term_id: 8, enrollment_opens_at: "2026-09-03", closes_at: "2026-10-03" });
const oct = (id: number): AssignableSection => ({ id, term_id: 40, enrollment_opens_at: "2026-10-06", closes_at: "2026-11-01" });

describe("등록에 넣을 수 있는 반", () => {
  it("같은 달 두 반(주5일)은 된다", () => {
    expect(assignableError([sep(1), sep(2)], "2026-09-22")).toBeNull();
  });

  it("두 달의 반을 한 등록에 넣지 않는다", () => {
    expect(assignableError([sep(1), oct(2)], "2026-09-22")).toMatch(/한 달/);
  });

  it("종강한 반은 안 된다 — 종강일 당일까지는 된다", () => {
    expect(assignableError([sep(1)], "2026-10-03")).toBeNull();
    expect(assignableError([sep(1)], "2026-10-04")).toMatch(/종강/);
  });

  it("반이 없으면 안 된다", () => {
    expect(assignableError([], "2026-09-22")).not.toBeNull();
  });
});

describe("등록 기간과 상태 = 반의 개강일~종강일", () => {
  it("개강일이 지났으면 active", () => {
    expect(orderWindow([sep(1), sep(2)], "2026-09-22")).toEqual({ activatesOn: "2026-09-03", accessUntil: "2026-10-03", status: "active" });
  });

  it("개강일 당일부터 active", () => {
    expect(orderWindow([oct(1)], "2026-10-06").status).toBe("active");
  });

  it("개강 전이면 예비등록 (preliminary)", () => {
    expect(orderWindow([oct(1)], "2026-10-05")).toEqual({ activatesOn: "2026-10-06", accessUntil: "2026-11-01", status: "preliminary" });
  });
});
