import { describe, expect, it } from "vitest";
import { carryOverNote, flipSet, nextMonthDefaults, slotKey, type PrevSection } from "./course-set";

/** 2026년 9월 650 편성표 (과정 A/B 는 시간대 단위, 과목은 트랙마다) */
const SEPT: PrevSection[] = [
  { course_id: 1, track: "mwf", time_block: "10:00~11:00", subject: "rc", book_set: "A" },
  { course_id: 1, track: "ttf", time_block: "10:00~11:00", subject: "lc", book_set: "A" },
  { course_id: 1, track: "mwf", time_block: "11:10~12:10", subject: "lc", book_set: "B" },
  { course_id: 1, track: "ttf", time_block: "11:10~12:10", subject: "rc", book_set: "B" },
  // 묶음 반 — 과목도 과정도 없다
  { course_id: 1, track: "mwf", time_block: "10:00~12:10", subject: null, book_set: null },
];

describe("flipSet — A ↔ B", () => {
  it("뒤집고, 없으면 null", () => {
    expect(flipSet("A")).toBe("B");
    expect(flipSet("B")).toBe("A");
    expect(flipSet(null)).toBeNull();
    expect(flipSet("C")).toBeNull();
  });
});

describe("nextMonthDefaults — 과목은 그대로, 과정은 뒤집는다", () => {
  it("9월 → 10월: 10:00 A 과정이 B 과정으로, 월수금 RC · 화목금 LC 는 그대로", () => {
    const d = nextMonthDefaults(SEPT, { prevMonth: 9, month: 10 });
    expect(d.get(slotKey(1, "mwf", "10:00~11:00"))).toEqual({ subject: "rc", set: "B" });
    expect(d.get(slotKey(1, "ttf", "10:00~11:00"))).toEqual({ subject: "lc", set: "B" });
    expect(d.get(slotKey(1, "mwf", "11:10~12:10"))).toEqual({ subject: "lc", set: "A" });
    expect(d.get(slotKey(1, "ttf", "11:10~12:10"))).toEqual({ subject: "rc", set: "A" });
  });

  it("묶음 반처럼 아무 값도 없는 자리는 넣지 않는다", () => {
    const d = nextMonthDefaults(SEPT, { prevMonth: 9, month: 10 });
    expect(d.has(slotKey(1, "mwf", "10:00~12:10"))).toBe(false);
    expect(d.size).toBe(4);
  });

  it("방학달로 넘어가면(12월 → 1월) 아무것도 채우지 않는다 — 시간표가 다르다 (2026-09-23 Alan)", () => {
    expect(nextMonthDefaults(SEPT, { prevMonth: 12, month: 1 }).size).toBe(0);
  });

  it("방학달에서 평달로 돌아올 때(2월 → 3월)도 채우지 않는다", () => {
    expect(nextMonthDefaults(SEPT, { prevMonth: 2, month: 3 }).size).toBe(0);
  });

  it("방학달끼리(7월 → 8월)는 같은 자리가 있으면 뒤집어 잇는다", () => {
    const d = nextMonthDefaults([{ course_id: 1, track: "mwf", time_block: "10:00~12:10", subject: null, book_set: "A" }], { prevMonth: 7, month: 8 });
    expect(d.get(slotKey(1, "mwf", "10:00~12:10"))).toEqual({ subject: null, set: "B" });
  });

  it("과목 칸이 비어 있어도 과정만 있으면 뒤집어 넣고, 엉뚱한 값은 버린다", () => {
    const d = nextMonthDefaults([{ course_id: 2, track: "ttf", time_block: "12:30~13:40", subject: "x", book_set: "B" }], { prevMonth: 10, month: 11 });
    expect(d.get(slotKey(2, "ttf", "12:30~13:40"))).toEqual({ subject: null, set: "A" });
  });
});

describe("carryOverNote — 표 위의 한 줄", () => {
  it("처음 여는 달(지난달 반 없음)은 아무 말도 하지 않는다", () => {
    expect(carryOverNote({ prevMonth: 9, month: 10 }, false, 0)).toBeNull();
  });
  it("이어받았으면 뒤집었다고 말한다", () => {
    expect(carryOverNote({ prevMonth: 9, month: 10 }, true, 4)).toMatch(/9월 편성을 이어받았어요/);
  });
  it("계절이 바뀌면 직접 고르라고 말한다", () => {
    expect(carryOverNote({ prevMonth: 12, month: 1 }, true, 0)).toMatch(/1월은 방학달이라/);
    expect(carryOverNote({ prevMonth: 2, month: 3 }, true, 0)).toMatch(/3월은 평달이라/);
  });
});
