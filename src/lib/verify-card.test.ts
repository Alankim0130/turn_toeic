import { describe, expect, it } from "vitest";
import { needsVerifyCard } from "./verify-card";

const order = { created_at: "2026-10-01T08:00:00+00:00" };
const at = (result: string | null, created_at: string) => ({ result, created_at });

describe("등업신청 현황 카드 — 등업이 끝났으면 그리지 않는다 (2026-10-02 Alan)", () => {
  it("유효한 등록이 있고 할 일이 없으면 그리지 않는다", () => {
    expect(needsVerifyCard([order], at("approved", "2026-10-01T07:53:56+00:00"))).toBe(false);
    expect(needsVerifyCard([order], at("closed", "2026-10-02T01:00:00+00:00"))).toBe(false);
    // 스태프가 수강증 없이 배정한 등록 — 올린 수강증이 없어도 등업은 끝났다
    expect(needsVerifyCard([order], undefined)).toBe(false);
    // 등록 전에 반려됐다가 다시 올려 등록된 학생 — 그 반려는 지난 일
    expect(needsVerifyCard([order], at("rejected", "2026-09-30T08:00:00+00:00"))).toBe(false);
  });

  it("등록 뒤에도 할 일이 남았으면 그린다 — 확인 중 · 받아 둠 · 그 뒤의 반려", () => {
    expect(needsVerifyCard([order], at(null, "2026-10-20T08:00:00+00:00"))).toBe(true);
    expect(needsVerifyCard([order], at("rejected", "2026-10-20T08:00:00+00:00"))).toBe(true);
  });

  it("유효한 등록이 없으면 그린다 — 아직 등업 전 · 졸업생은 신청하기로 가는 길", () => {
    expect(needsVerifyCard([], undefined)).toBe(true);
    expect(needsVerifyCard([], at("approved", "2026-08-01T00:00:00+00:00"))).toBe(true);
    expect(needsVerifyCard([], at(null, "2026-10-01T00:00:00+00:00"))).toBe(true);
  });

  it("등록이 여럿이면 가장 늦은 등록과 견준다", () => {
    const newer = { created_at: "2026-10-25T00:00:00+00:00" };
    expect(needsVerifyCard([order, newer], at("rejected", "2026-10-20T08:00:00+00:00"))).toBe(false);
    expect(needsVerifyCard([order, newer], at("rejected", "2026-10-26T08:00:00+00:00"))).toBe(true);
  });
});
