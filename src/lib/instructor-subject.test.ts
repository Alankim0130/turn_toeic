import { describe, expect, it } from "vitest";
import { planSubjects, subjectOf, subjectsWithin, type SubjectSection } from "./instructor-subject";

/**
 * 2026년 9월 편성표 그대로 (CLAUDE.md 미확정 1 "평달 (9·10월)").
 * 과정 A/B 는 (강좌·시간대) 단위이고 과목은 반의 과목 칸(`subject`)에 있다 (2026-09-23).
 */
const s = (id: number, course: number, block: string, track: string, subject: string | null, pkg = false): SubjectSection & { track: string } => ({
  id,
  course_id: course,
  time_block: block,
  subject,
  package: pkg,
  track,
});

const SEPT = [
  // 650 (course 1) — 10:00 A 과정: 월수금 RC · 화목금 LC, 11:10 B 과정: 월수금 LC · 화목금 RC
  s(1, 1, "10:00~11:00", "ttf", "lc"),
  s(2, 1, "10:00~11:00", "mwf", "rc"),
  s(3, 1, "11:10~12:10", "mwf", "lc"),
  s(4, 1, "11:10~12:10", "ttf", "rc"),
  // 750 (course 2) — 650 과 같은 시간에 서로 반대 과목
  s(5, 2, "10:00~11:00", "mwf", "lc"),
  s(6, 2, "10:00~11:00", "ttf", "rc"),
  s(7, 2, "11:10~12:10", "ttf", "lc"),
  s(8, 2, "11:10~12:10", "mwf", "rc"),
  // 850 문풀 (course 3)
  s(9, 3, "12:30~13:40", "ttf", "lc"),
  s(10, 3, "12:30~13:40", "mwf", "rc"),
  s(11, 3, "13:50~15:00", "mwf", "lc"),
  s(12, 3, "13:50~15:00", "ttf", "rc"),
  // 묶음 반 (120분 · 140분) 과 스파르타 — 두 과목을 이어 듣는다
  s(13, 1, "10:00~12:10", "mwf", null, true),
  s(14, 1, "10:00~12:10", "ttf", null, true),
  s(15, 3, "12:30~15:00", "mwf", null, true),
  s(16, 4, "10:00~13:40", "mwf", null, true),
];

describe("planSubjects — 반의 과목 칸이 담당을 정한다", () => {
  const plan = planSubjects(SEPT);
  const subjectOfId = new Map(plan.assign.map((a) => [a.id, a.subject]));

  it("과목이 LC 인 반은 LC (이혜영)", () => {
    for (const id of [1, 3, 5, 7, 9, 11]) expect(subjectOfId.get(id), `반 ${id}`).toBe("lc");
  });

  it("과목이 RC 인 반은 RC (이영수)", () => {
    for (const id of [2, 4, 6, 8, 10, 12]) expect(subjectOfId.get(id), `반 ${id}`).toBe("rc");
  });

  it("한 시간에 두 강사가 한 명씩 — 같은 시간·트랙에 같은 과목이 겹치지 않는다", () => {
    const seen = new Map<string, string>();
    for (const row of SEPT.filter((r) => !r.package)) {
      const subject = subjectOfId.get(row.id)!;
      const key = `${row.time_block}|${row.track}|${subject}`;
      expect(seen.has(key), `${key} 가 두 반에 겹친다`).toBe(false);
      seen.set(key, String(row.id));
    }
  });

  it("묶음 반·스파르타 반은 담당을 비운다", () => {
    expect(plan.clear.sort((a, b) => a - b)).toEqual([13, 14, 15, 16]);
    for (const id of plan.clear) expect(subjectOfId.has(id)).toBe(false);
  });

  it("12개 전부 과목이 정해진다", () => {
    expect(plan.assign).toHaveLength(12);
    expect(plan.unknown).toHaveLength(0);
  });
});

describe("과목 칸이 비어 있으면 짐작하지 않는다", () => {
  it("비어 있으면 unknown — 방학달 통짜 반처럼 두 과목을 이어 듣는 반이 여기 해당한다", () => {
    const plan = planSubjects([s(1, 1, "10:00~12:10", "mwf", null), s(2, 1, "10:00~12:10", "ttf", null)]);
    expect(plan.assign).toHaveLength(0);
    expect(plan.unknown.sort((a, b) => a - b)).toEqual([1, 2]);
  });

  it("고른 반만 정해지고 나머지는 그대로 남는다", () => {
    const plan = planSubjects([s(1, 1, "10:00~11:00", "ttf", "lc"), s(2, 1, "10:00~11:00", "mwf", "rc"), s(3, 1, "11:10~12:10", "mwf", null), s(4, 1, "11:10~12:10", "ttf", null)]);
    expect(plan.assign).toEqual([
      { id: 1, subject: "lc" },
      { id: 2, subject: "rc" },
    ]);
    expect(plan.unknown).toEqual([3, 4]);
  });

  it("엉뚱한 값은 과목으로 보지 않는다", () => {
    const plan = planSubjects([s(1, 1, "10:00~11:00", "ttf", "LC")]);
    expect(plan.assign).toHaveLength(0);
    expect(plan.unknown).toEqual([1]);
  });
});

describe("subjectOf — 반 하나", () => {
  it("과목 칸 그대로", () => {
    expect(subjectOf({ subject: "lc", isPackage: false })).toBe("lc");
    expect(subjectOf({ subject: "rc", isPackage: false })).toBe("rc");
  });
  it("묶음 시간대는 정하지 않는다", () => {
    expect(subjectOf({ subject: "lc", isPackage: true })).toBeNull();
  });
  it("비어 있으면 정하지 않는다", () => {
    expect(subjectOf({ subject: null, isPackage: false })).toBeNull();
    expect(subjectOf({ subject: undefined, isPackage: false })).toBeNull();
  });
});

describe("subjectsWithin — 내 시간표의 함께 듣는 시간", () => {
  it("120분 묶음 학생: 10:00 RC · 11:10 LC", () => {
    const m = subjectsWithin([
      { id: 1, subject: "rc" },
      { id: 2, subject: "lc" },
    ]);
    expect(m.get(1)).toBe("rc");
    expect(m.get(2)).toBe("lc");
  });

  it("스파르타처럼 세 시간을 들어도 각자 제 과목으로 읽는다", () => {
    const m = subjectsWithin([
      { id: 1, subject: "rc" },
      { id: 2, subject: "lc" },
      { id: 3, subject: "lc" },
    ]);
    expect([...m.values()]).toEqual(["rc", "lc", "lc"]);
  });

  it("과목 칸이 비어 있는 반은 아무 말도 하지 않는다", () => {
    const m = subjectsWithin([{ id: 1, subject: null }, { id: 2, subject: "lc" }, { id: 3 }]);
    expect(m.size).toBe(1);
    expect(m.get(2)).toBe("lc");
  });

  it("빈 목록도 안전하다", () => {
    expect(subjectsWithin([]).size).toBe(0);
  });
});
