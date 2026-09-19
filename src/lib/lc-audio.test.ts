import { describe, it, expect } from "vitest";
import { bookSectionsByLevel, bookTimeLabel, bookTimesLabel, explicitBookSet } from "./lc-audio";

const TRACK = { mwf: "월수금", ttf: "화목금" };

/**
 * 2026년 9월 650 편성표 그대로 (CLAUDE.md 도메인 규칙 1 "LC 교재"):
 * 10:00 은 화목금이 LC(A반 교재), 11:10 은 월수금이 LC(B반 교재). 나머지 두 시간은 RC 라 교재가 없다.
 * **달 홀짝(9월=홀수달=A)으로는 절대 설명되지 않는 배치다** — 같은 달 같은 레벨인데 A 와 B 가 함께 나온다.
 */
const c650 = { target_score: 650, program: "score" };
const mwf1000 = { track: "mwf", time_block: "10:00~11:00", book_set: null, course: c650 }; // RC
const ttf1000 = { track: "ttf", time_block: "10:00~11:00", book_set: "A", course: c650 };
const mwf1110 = { track: "mwf", time_block: "11:10~12:10", book_set: "B", course: c650 };
const ttf1110 = { track: "ttf", time_block: "11:10~12:10", book_set: null, course: c650 }; // RC
/** 주5일 120분 학생이 접근하는 묶음 반 — 그릇이라 교재가 없다 */
const bundle = { track: "mwf", time_block: "10:00~12:10", book_set: null, course: c650 };

describe("explicitBookSet — 반에 지정된 교재만 믿는다", () => {
  it("A·B 만 값이고 나머지는 null", () => {
    expect(explicitBookSet(ttf1000)).toBe("A");
    expect(explicitBookSet(mwf1110)).toBe("B");
    expect(explicitBookSet(mwf1000)).toBeNull();
    expect(explicitBookSet({ book_set: "C" })).toBeNull();
    expect(explicitBookSet(null)).toBeNull();
  });
});

describe("bookSectionsByLevel — 레벨 × 교재 반", () => {
  it("주5일 120분 학생은 A·B 두 권을 쓴다 — 한 시간은 A, 다음 시간은 B (2026-09-19 Alan)", () => {
    const byLevel = bookSectionsByLevel([bundle, mwf1000, ttf1000, mwf1110, ttf1110]);
    const s650 = byLevel.get(650)!;
    expect([...s650.keys()].sort()).toEqual(["A", "B"]);
    expect(bookTimesLabel(s650.get("A")!, TRACK)).toBe("화목금 10:00~11:00");
    expect(bookTimesLabel(s650.get("B")!, TRACK)).toBe("월수금 11:10~12:10");
  });

  it("주3일 60분 학생은 한 권만 쓴다", () => {
    const byLevel = bookSectionsByLevel([ttf1000]);
    expect([...byLevel.get(650)!.keys()]).toEqual(["A"]);
  });

  it("RC 시간·묶음 반만 있으면 아무 교재도 나오지 않는다 — **달로 짐작하지 않는다**", () => {
    expect(bookSectionsByLevel([bundle, mwf1000, ttf1110]).size).toBe(0);
  });

  it("레벨을 섞지 않는다 — 650 은 B, 850 은 A 일 수 있다", () => {
    const s850 = { track: "ttf", time_block: "12:30~13:40", book_set: "A", course: { target_score: 850, program: "score" } };
    const byLevel = bookSectionsByLevel([mwf1110, s850]);
    expect([...byLevel.get(650)!.keys()]).toEqual(["B"]);
    expect([...byLevel.get(850)!.keys()]).toEqual(["A"]);
  });

  it("스파르타 반 자체는 교재가 없다 — 함께 듣는 시간 단위 반에 지정돼 있다", () => {
    const sparta = { track: "mwf", time_block: "10:00~13:40", book_set: "A", course: { target_score: 650, program: "sparta" } };
    expect(bookSectionsByLevel([sparta]).size).toBe(0);
  });
});

describe("bookTimeLabel — 왜 이 교재인지 적는다", () => {
  it("트랙과 시간대를 붙여 쓴다. **주5일로 합치지 않는다** (트랙마다 교재가 다르다)", () => {
    expect(bookTimeLabel(ttf1000, TRACK)).toBe("화목금 10:00~11:00");
  });

  it("같은 교재를 여러 시간에 쓰면 한 줄로 모으고 순서를 고정한다", () => {
    const evening = { track: "mwf", time_block: "19:40~20:40", book_set: "B", course: c650 };
    expect(bookTimesLabel([evening, mwf1110, mwf1110], TRACK)).toBe("월수금 11:10~12:10 · 월수금 19:40~20:40");
  });

  it("시간대를 모르면 트랙만 적는다 — 없는 시간을 지어내지 않는다", () => {
    expect(bookTimeLabel({ track: "mwf", time_block: null, book_set: "A" }, TRACK)).toBe("월수금");
    expect(bookTimesLabel([], TRACK)).toBe("");
  });
});
