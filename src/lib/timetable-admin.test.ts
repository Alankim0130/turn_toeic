import { describe, expect, it } from "vitest";
import { duplicateSlot, normalizeTime, parseSlotInput } from "./timetable-admin";

describe("normalizeTime", () => {
  it("9:00 · 09:00 · 09:00:00 → 09:00", () => {
    expect(normalizeTime("9:00")).toBe("09:00");
    expect(normalizeTime("09:00")).toBe("09:00");
    expect(normalizeTime("09:00:00")).toBe("09:00");
  });
  it("틀린 값은 null", () => {
    expect(normalizeTime("25:00")).toBeNull();
    expect(normalizeTime("10:60")).toBeNull();
    expect(normalizeTime("10")).toBeNull();
    expect(normalizeTime("")).toBeNull();
    expect(normalizeTime(null)).toBeNull();
  });
});

describe("parseSlotInput", () => {
  const base = { level: "650", program: "score", season: "vacation", start: "17:00", end: "19:10", ttfRecorded: true };

  it("브로슈어 줄 하나 — 방학달 650 17:00~19:10 화목금 인강", () => {
    const r = parseSlotInput(base);
    expect(r).toEqual({ ok: true, slot: { level: 650, program: "score", season: "vacation", start: "17:00", end: "19:10", ttfRecorded: true } });
  });

  it("종료가 시작보다 앞이면 거절", () => {
    const r = parseSlotInput({ ...base, end: "16:00" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/종료 시각/);
  });

  it("같은 시각도 거절 (DB check 와 같다)", () => {
    expect(parseSlotInput({ ...base, end: "17:00" }).ok).toBe(false);
  });

  it("과정·계절·레벨이 엉뚱하면 거절", () => {
    expect(parseSlotInput({ ...base, program: "premium" }).ok).toBe(false);
    expect(parseSlotInput({ ...base, season: "summer" }).ok).toBe(false);
    expect(parseSlotInput({ ...base, level: "abc" }).ok).toBe(false);
    expect(parseSlotInput({ ...base, level: "5" }).ok).toBe(false);
  });

  it("시각 표기는 정규화해서 돌려준다", () => {
    const r = parseSlotInput({ ...base, start: "9:30", end: "11:40:00" });
    expect(r.ok && r.slot.start).toBe("09:30");
    expect(r.ok && r.slot.end).toBe("11:40");
  });
});

describe("duplicateSlot — 같은 자리에 같은 시간", () => {
  const rows = [
    { id: 1, level: 650, program: "score", season: "regular", start_time: "10:00:00", end_time: "12:10:00" },
    { id: 2, level: 650, program: "score", season: "vacation", start_time: "10:00:00", end_time: "12:10:00" },
  ];
  const slot = { level: 650, program: "score" as const, season: "regular" as const, start: "10:00", end: "12:10", ttfRecorded: false };

  it("같은 레벨·과정·계절·시간이면 겹친다 (DB 시각의 초는 무시)", () => {
    expect(duplicateSlot(rows, slot)?.id).toBe(1);
  });
  it("자기 자신은 빼고 본다 (고칠 때)", () => {
    expect(duplicateSlot(rows, slot, 1)).toBeNull();
  });
  it("계절이 다르면 겹치지 않는다", () => {
    expect(duplicateSlot(rows, { ...slot, season: "vacation" })?.id).toBe(2);
    expect(duplicateSlot(rows, { ...slot, start: "10:00", end: "11:00" })).toBeNull();
  });
});
