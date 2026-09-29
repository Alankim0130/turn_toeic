import { describe, expect, it } from "vitest";
import { duplicateSlot, HOURS, joinTime, minuteOptions, normalizeTime, parseSlotInput, splitTime } from "./timetable-admin";

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

describe("시 · 분 고르기 칸 (24시간제)", () => {
  it("시는 00 ~ 23 스물네 칸 — 오후 6시는 18 이다 (브로슈어 표기)", () => {
    expect(HOURS).toHaveLength(24);
    expect(HOURS[0]).toBe("00");
    expect(HOURS).toContain("18");
    expect(HOURS.at(-1)).toBe("23");
  });

  it("분은 5분 간격 열두 칸 — 시간표의 10분 단위가 전부 들어 있다", () => {
    const m = minuteOptions();
    expect(m).toHaveLength(12);
    expect(m[0]).toBe("00");
    expect(m.at(-1)).toBe("55");
    for (const v of ["00", "10", "30", "40", "50"]) expect(m).toContain(v);
  });

  it("저장된 값이 5분 간격 사이면 그 값도 칸에 넣고 순서를 지킨다", () => {
    const m = minuteOptions("12");
    expect(m).toHaveLength(13);
    expect(m.slice(2, 4)).toEqual(["10", "12"]);
    expect(minuteOptions("30")).toHaveLength(12);
    expect(minuteOptions("75")).toHaveLength(12);
  });

  it("DB 시각을 두 칸으로 나눈다 — 못 읽으면 빈칸", () => {
    expect(splitTime("18:30:00")).toEqual({ h: "18", m: "30" });
    expect(splitTime("9:05")).toEqual({ h: "09", m: "05" });
    expect(splitTime(null)).toBeNull();
    expect(splitTime("")).toBeNull();
  });

  it("고른 두 칸을 HH:MM 으로 합친다 — 하나라도 비면 null", () => {
    expect(joinTime("18", "30")).toBe("18:30");
    expect(joinTime("9", "05")).toBe("09:05");
    expect(joinTime("", "30")).toBeNull();
    expect(joinTime("18", "")).toBeNull();
    expect(joinTime("24", "00")).toBeNull();
    expect(joinTime("18", "5")).toBeNull();
    expect(joinTime(null, undefined)).toBeNull();
  });

  it("빈칸으로 보내면 저장하지 않고 고르라고 말한다", () => {
    const r = parseSlotInput({ month: "2026-10", level: "650", program: "score", start: joinTime("", ""), end: joinTime("11", "00"), ttfRecorded: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/골라/);
  });
});

describe("parseSlotInput — 달 줄", () => {
  const base = { month: "2027-01", level: "650", program: "score", start: "17:00", end: "19:10", ttfRecorded: true };

  it("브로슈어 줄 하나 — 2027년 1월 650 17:00~19:10 화목금 인강", () => {
    const r = parseSlotInput(base);
    expect(r).toEqual({
      ok: true,
      slot: { year: 2027, month: 1, level: 650, program: "score", start: "17:00", end: "19:10", ttfRecorded: true, bookSet: null, subjectMwf: null, subjectTtf: null },
    });
  });

  it("과정 · 트랙별 과목을 받는다 — 엉뚱한 값은 비운다", () => {
    const r = parseSlotInput({ ...base, bookSet: "B", subjectMwf: "rc", subjectTtf: "lc" });
    expect(r.ok && [r.slot.bookSet, r.slot.subjectMwf, r.slot.subjectTtf]).toEqual(["B", "rc", "lc"]);
    const bad = parseSlotInput({ ...base, bookSet: "C", subjectMwf: "LC", subjectTtf: "" });
    expect(bad.ok && [bad.slot.bookSet, bad.slot.subjectMwf, bad.slot.subjectTtf]).toEqual([null, null, null]);
  });

  it("종료가 시작보다 앞이면 거절", () => {
    const r = parseSlotInput({ ...base, end: "16:00" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/종료 시각/);
  });

  it("같은 시각도 거절 (DB check 와 같다)", () => {
    expect(parseSlotInput({ ...base, end: "17:00" }).ok).toBe(false);
  });

  it("달·과정·레벨이 엉뚱하면 거절", () => {
    expect(parseSlotInput({ ...base, month: "2027-13" }).ok).toBe(false);
    expect(parseSlotInput({ ...base, month: "regular" }).ok).toBe(false);
    expect(parseSlotInput({ ...base, program: "premium" }).ok).toBe(false);
    expect(parseSlotInput({ ...base, level: "abc" }).ok).toBe(false);
    expect(parseSlotInput({ ...base, level: "5" }).ok).toBe(false);
  });

  it("시각 표기는 정규화해서 돌려준다", () => {
    const r = parseSlotInput({ ...base, start: "9:30", end: "11:40:00" });
    expect(r.ok && r.slot.start).toBe("09:30");
    expect(r.ok && r.slot.end).toBe("11:40");
  });
});

describe("duplicateSlot — 같은 달·자리에 같은 시간", () => {
  const rows = [
    { id: 1, year: 2026, month: 10, level: 650, program: "score", start_time: "10:00:00", end_time: "12:10:00" },
    { id: 2, year: 2026, month: 11, level: 650, program: "score", start_time: "10:00:00", end_time: "12:10:00" },
  ];
  const slot = { year: 2026, month: 10, level: 650, program: "score" as const, start: "10:00", end: "12:10", ttfRecorded: false, bookSet: null, subjectMwf: null, subjectTtf: null };

  it("같은 달·레벨·과정·시간이면 겹친다 (DB 시각의 초는 무시)", () => {
    expect(duplicateSlot(rows, slot)?.id).toBe(1);
  });
  it("자기 자신은 빼고 본다 (고칠 때)", () => {
    expect(duplicateSlot(rows, slot, 1)).toBeNull();
  });
  it("달이 다르면 겹치지 않는다", () => {
    expect(duplicateSlot(rows, { ...slot, month: 11 })?.id).toBe(2);
    expect(duplicateSlot(rows, { ...slot, month: 12 })).toBeNull();
    expect(duplicateSlot(rows, { ...slot, start: "10:00", end: "11:00" })).toBeNull();
  });
});
