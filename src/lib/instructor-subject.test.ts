import { describe, expect, it } from "vitest";
import { planSubjects, subjectOf, type SubjectSection } from "./instructor-subject";

/**
 * 2026년 9월 편성표 그대로 (CLAUDE.md 미확정 1 "평달 (9·10월)").
 * 시간대가 과목을 고정하고 교재 A/B 만 달마다 뒤바뀐다 — LC 를 듣는 쪽에만 book_set 이 있다.
 */
const s = (id: number, course: number, block: string, track: string, book: string | null, pkg = false): SubjectSection & { track: string } => ({
  id,
  course_id: course,
  time_block: block,
  book_set: book,
  package: pkg,
  track,
});

const SEPT = [
  // 650 (course 1) — 10:00 은 화목금이 A(LC), 11:10 은 월수금이 B(LC)
  s(1, 1, "10:00~11:00", "ttf", "A"),
  s(2, 1, "10:00~11:00", "mwf", null),
  s(3, 1, "11:10~12:10", "mwf", "B"),
  s(4, 1, "11:10~12:10", "ttf", null),
  // 750 (course 2) — 650 과 같은 시간에 서로 반대 과목
  s(5, 2, "10:00~11:00", "mwf", "A"),
  s(6, 2, "10:00~11:00", "ttf", null),
  s(7, 2, "11:10~12:10", "ttf", "B"),
  s(8, 2, "11:10~12:10", "mwf", null),
  // 850 문풀 (course 3)
  s(9, 3, "12:30~13:40", "ttf", "A"),
  s(10, 3, "12:30~13:40", "mwf", null),
  s(11, 3, "13:50~15:00", "mwf", "B"),
  s(12, 3, "13:50~15:00", "ttf", null),
  // 묶음 반 (120분 · 140분) 과 스파르타 — 두 과목을 이어 듣는다
  s(13, 1, "10:00~12:10", "mwf", null, true),
  s(14, 1, "10:00~12:10", "ttf", null, true),
  s(15, 3, "12:30~15:00", "mwf", null, true),
  s(16, 4, "10:00~13:40", "mwf", null, true),
];

describe("planSubjects — 반의 LC 교재가 과목을 말해 준다", () => {
  const plan = planSubjects(SEPT);
  const subjectOfId = new Map(plan.assign.map((a) => [a.id, a.subject]));

  it("LC 교재가 있는 반은 LC (이혜영)", () => {
    for (const id of [1, 3, 5, 7, 9, 11]) expect(subjectOfId.get(id), `반 ${id}`).toBe("lc");
  });

  it("같은 강좌·시간대의 반대쪽 트랙은 RC (이영수)", () => {
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

describe("LC 교재를 안 정했으면 짐작하지 않는다", () => {
  it("그 강좌·시간대에 교재가 하나도 없으면 unknown", () => {
    const plan = planSubjects([s(1, 1, "10:00~11:00", "mwf", null), s(2, 1, "10:00~11:00", "ttf", null)]);
    expect(plan.assign).toHaveLength(0);
    expect(plan.unknown.sort((a, b) => a - b)).toEqual([1, 2]);
  });

  it("교재를 넣은 시간대만 정해지고 나머지는 그대로 남는다", () => {
    const plan = planSubjects([
      s(1, 1, "10:00~11:00", "ttf", "A"),
      s(2, 1, "10:00~11:00", "mwf", null),
      s(3, 1, "11:10~12:10", "mwf", null),
      s(4, 1, "11:10~12:10", "ttf", null),
    ]);
    expect(plan.assign).toEqual([
      { id: 1, subject: "lc" },
      { id: 2, subject: "rc" },
    ]);
    expect(plan.unknown).toEqual([3, 4]);
  });

  it("다른 강좌의 교재를 빌려 오지 않는다 (강좌별로 따로 본다)", () => {
    const plan = planSubjects([s(1, 1, "10:00~11:00", "ttf", "A"), s(2, 2, "10:00~11:00", "mwf", null)]);
    expect(plan.assign).toEqual([{ id: 1, subject: "lc" }]);
    expect(plan.unknown).toEqual([2]);
  });
});

describe("subjectOf — 반을 만들 때 (아직 id 가 없다)", () => {
  it("LC 교재를 고른 줄은 LC", () => {
    expect(subjectOf({ bookSet: "A", isPackage: false, groupHasBook: true })).toBe("lc");
  });
  it("같은 묶음에 교재가 있으면 안 고른 줄은 RC", () => {
    expect(subjectOf({ bookSet: null, isPackage: false, groupHasBook: true })).toBe("rc");
  });
  it("묶음 시간대는 정하지 않는다", () => {
    expect(subjectOf({ bookSet: "A", isPackage: true, groupHasBook: true })).toBeNull();
  });
  it("교재를 아무도 안 골랐으면 정하지 않는다", () => {
    expect(subjectOf({ bookSet: null, isPackage: false, groupHasBook: false })).toBeNull();
  });
});
