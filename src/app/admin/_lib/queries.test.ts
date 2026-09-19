import { describe, it, expect } from "vitest";
import { sectionChip } from "./queries";
import { week5SectionIds, collapseWeek5 } from "@/lib/week5";

const term = { year: 2026, month: 9 };
const course = { name: "650+ 왕기초반", target_score: 650, program: "score" };

/** 같은 (기수·강좌·시간대)의 월수금 + 화목금 = 주5일 한 쌍 */
const mwf = { id: 1, term_id: 9, course_id: 65, track: "mwf", time_block: "10:00~12:10", start_time: null, term, course };
const ttf = { id: 2, term_id: 9, course_id: 65, track: "ttf", time_block: "10:00~12:10", start_time: null, term, course };
/** 화목금만 등록한 주3일 학생 */
const solo = { id: 3, term_id: 9, course_id: 75, track: "ttf", time_block: "11:10~12:10", start_time: null, term, course: { name: "750+ 유형마스터", target_score: 750, program: "score" } };

describe("sectionChip — 명단 카드의 반 배지", () => {
  it("레벨 숫자로 줄이고 트랙·시간을 붙여 쓴다", () => {
    expect(sectionChip(mwf)).toBe("9월 · 650+ · 월수금 10:00~12:10");
  });

  it("스파르타는 레벨 앞에 붙인다", () => {
    const s = { ...mwf, course: { name: "스파르타 650+ 중급속성", target_score: 650, program: "sparta" } };
    expect(sectionChip(s)).toBe("9월 · 스파르타 650+ · 월수금 10:00~12:10");
  });

  it("주5일이면 트랙 대신 주5일로 적는다 (2026-09-19 Alan)", () => {
    const week5 = week5SectionIds([mwf, ttf]);
    expect(sectionChip(mwf, week5)).toBe("9월 · 650+ · 주5일 10:00~12:10");
    expect(sectionChip(ttf, week5)).toBe("9월 · 650+ · 주5일 10:00~12:10");
  });

  it("한 트랙만 들으면 주3일이라 트랙 이름 그대로다", () => {
    const week5 = week5SectionIds([solo]);
    expect(sectionChip(solo, week5)).toBe("9월 · 750+ · 화목금 11:10~12:10");
  });

  it("레벨을 못 읽으면 강좌 이름을 그대로 쓴다 — 짐작하지 않는다", () => {
    const s = { ...mwf, course: { name: "특별반", target_score: null, program: "score" } };
    expect(sectionChip(s)).toBe("9월 · 특별반 · 월수금 10:00~12:10");
  });

  it("반이 없으면 반 미배정", () => {
    expect(sectionChip(null)).toBe("반 미배정");
  });
});

describe("명단 카드가 주5일 두 줄을 한 줄로 합친다", () => {
  const rows = [
    { id: 11, mode: "onsite", section: mwf },
    { id: 12, mode: "onsite", section: ttf },
    { id: 13, mode: "live", section: solo },
  ];

  it("주5일 짝은 월수금 줄만 남고, 주3일 줄은 그대로 남는다", () => {
    const week5 = week5SectionIds(rows.map((r) => r.section));
    const kept = collapseWeek5(rows, (r) => r.section, week5);
    expect(kept.map((r) => r.id)).toEqual([11, 13]);
    expect(kept.map((r) => sectionChip(r.section, week5))).toEqual([
      "9월 · 650+ · 주5일 10:00~12:10",
      "9월 · 750+ · 화목금 11:10~12:10",
    ]);
  });

  it("다른 학생의 반과는 짝이 되지 않는다 — 학생마다 따로 센다", () => {
    // 학생 A 는 월수금만, 학생 B 는 화목금만 → 둘 다 주3일이다
    expect(week5SectionIds([mwf]).size).toBe(0);
    expect(week5SectionIds([ttf]).size).toBe(0);
  });
});
