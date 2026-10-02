import { describe, expect, it } from "vitest";
import { collapseWeek5, groupWeek5, studentTrackLabel, week5SectionIds, type Week5Section } from "./week5";

const TRACK = { mwf: "월수금", ttf: "화목금" };
const s = (id: number, track: string, block: string | null = "10:00~12:10", course = 1, term = 9): Week5Section => ({
  id,
  term_id: term,
  course_id: course,
  time_block: block,
  track,
});

describe("week5SectionIds — 같은 기수·강좌·시간대에 두 트랙이 다 있으면 주5일", () => {
  it("650 10:00 월수금 + 화목금 → 둘 다 주5일", () => {
    expect([...week5SectionIds([s(1, "mwf"), s(2, "ttf")])].sort()).toEqual([1, 2]);
  });

  it("한 트랙만 있으면 주3일 (짝이 아니다)", () => {
    expect(week5SectionIds([s(1, "mwf")]).size).toBe(0);
  });

  it("시간대가 다르면 짝이 아니다 (오전 월수금 + 저녁 화목금)", () => {
    expect(week5SectionIds([s(1, "mwf", "10:00~12:10"), s(2, "ttf", "18:30~20:40")]).size).toBe(0);
  });

  it("강좌가 다르면 짝이 아니다 (650 월수금 + 750 화목금)", () => {
    expect(week5SectionIds([s(1, "mwf", "10:00~12:10", 1), s(2, "ttf", "10:00~12:10", 2)]).size).toBe(0);
  });

  it("기수가 다르면 짝이 아니다 (9월 월수금 + 10월 화목금)", () => {
    expect(week5SectionIds([s(1, "mwf", "10:00~12:10", 1, 9), s(2, "ttf", "10:00~12:10", 1, 10)]).size).toBe(0);
  });

  it("시간대가 없는 반은 묶지 않는다", () => {
    expect(week5SectionIds([s(1, "mwf", null), s(2, "ttf", null)]).size).toBe(0);
  });

  it("묶음 반과 그 안의 시간 단위 반이 각각 짝을 이룬다 (주5일 120분 학생)", () => {
    const ids = week5SectionIds([
      s(1, "mwf", "10:00~12:10"), s(2, "ttf", "10:00~12:10"),
      s(3, "mwf", "10:00~11:00"), s(4, "ttf", "10:00~11:00"),
      s(5, "mwf", "11:10~12:10"), s(6, "ttf", "11:10~12:10"),
    ]);
    expect([...ids].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("주3일 월수금 학생은 어느 반도 주5일이 아니다", () => {
    const ids = week5SectionIds([s(1, "mwf", "10:00~12:10"), s(3, "mwf", "10:00~11:00"), s(5, "mwf", "11:10~12:10")]);
    expect(ids.size).toBe(0);
  });
});

describe("studentTrackLabel — 학생에게 보이는 이름", () => {
  const week5 = week5SectionIds([s(1, "mwf"), s(2, "ttf")]);
  it("주5일 짝은 트랙 대신 주5일", () => {
    expect(studentTrackLabel({ id: 1, track: "mwf" }, week5, TRACK)).toBe("주5일");
    expect(studentTrackLabel({ id: 2, track: "ttf" }, week5, TRACK)).toBe("주5일");
  });
  it("주3일은 트랙 이름 그대로", () => {
    expect(studentTrackLabel({ id: 9, track: "mwf" }, week5, TRACK)).toBe("월수금");
    expect(studentTrackLabel({ id: 9, track: "ttf" }, week5, TRACK)).toBe("화목금");
  });
});

describe("collapseWeek5 — 등록 목록은 한 줄로", () => {
  const rows = [s(2, "ttf"), s(1, "mwf")];
  const week5 = week5SectionIds(rows);

  it("주5일 두 줄이 한 줄이 된다", () => {
    expect(collapseWeek5(rows, (r) => r, week5)).toHaveLength(1);
  });

  it("남는 줄은 늘 같다 (새로고침해도 안 바뀐다)", () => {
    const a = collapseWeek5([s(2, "ttf"), s(1, "mwf")], (r) => r, week5)[0].id;
    const b = collapseWeek5([s(1, "mwf"), s(2, "ttf")], (r) => r, week5)[0].id;
    expect(a).toBe(b);
  });

  it("주3일·다른 강좌 줄은 그대로 남는다", () => {
    const mixed = [s(1, "mwf"), s(2, "ttf"), s(7, "mwf", "18:30~20:40"), s(8, "ttf", "10:00~12:10", 2)];
    const ids = week5SectionIds(mixed);
    expect(collapseWeek5(mixed, (r) => r, ids).map((r) => r.id)).toEqual([1, 7, 8]);
  });
});

describe("groupWeek5 — 줄은 하나, 배정은 둘 (학생 관리 반 배정, 2026-10-02 Alan)", () => {
  it("주5일 짝은 한 묶음 [월수금, 화목금] 이고 collapseWeek5 와 같은 자리에 선다", () => {
    const rows = [s(2, "ttf"), s(7, "mwf", "18:30~20:40"), s(1, "mwf")];
    const week5 = week5SectionIds(rows);
    const groups = groupWeek5(rows, (r) => r, week5);
    expect(groups.map((g) => g.map((r) => r.id))).toEqual([[7], [1, 2]]);
    expect(groups.map((g) => g[0].id)).toEqual(collapseWeek5(rows, (r) => r, week5).map((r) => r.id));
  });

  it("주3일 · 다른 시간대 · 다른 달은 혼자 한 묶음이다", () => {
    const rows = [s(1, "mwf"), s(2, "ttf", "11:10~12:10"), s(3, "ttf", "10:00~12:10", 1, 10)];
    expect(groupWeek5(rows, (r) => r, week5SectionIds(rows)).map((g) => g.map((r) => r.id))).toEqual([[1], [2], [3]]);
  });

  it("반이 없는 줄도 혼자 남는다 (지워진 반)", () => {
    const rows: { id: number; section: Week5Section | null }[] = [
      { id: 11, section: s(1, "mwf") },
      { id: 12, section: null },
      { id: 13, section: s(2, "ttf") },
    ];
    const week5 = week5SectionIds(rows.flatMap((r) => (r.section ? [r.section] : [])));
    expect(groupWeek5(rows, (r) => r.section, week5).map((g) => g.map((r) => r.id))).toEqual([[11, 13], [12]]);
  });
});
