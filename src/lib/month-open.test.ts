import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { sectionKeyOf } from "@/components/admin/sections/bulk";
import { autoOpenCells, autoOpenInserts, autoOpenMessage, autoOpensMonth, sectionInsertOf, type OpenCourse, type OpenSlot } from "./month-open";

/**
 * 2026-10-22 Alan — "방학달 1,2,7,8월만 강사가 직접 반을 열어야하고 나머지는 자동으로 세팅되도록 부탁해!"
 * 평달 달력을 저장하면 시간표 · 반이 저절로 생긴다 — 새 반 개설 표에서 강좌마다 '전체 선택' 을 누른 것과 같은 반이다.
 */

// 10월(짝수달) 시간표 모양 — 시간 단위 열 줄 + 한달완성 다섯 · 속성반 셋 · 2주완성 하나 = 19줄
let nextId = 1;
const row = (level: number, label: string, program = "score", plan: [string | null, string | null, string | null] = [null, null, null]): OpenSlot => {
  const [start, end] = label.split("~");
  return {
    id: nextId++,
    level,
    program,
    start_time: `${start}:00`,
    end_time: `${end}:00`,
    ttf_recorded: start >= "18:00",
    book_set: plan[0],
    subject_mwf: plan[1],
    subject_ttf: plan[2],
  };
};
const OCT: OpenSlot[] = [
  row(650, "10:00~11:00", "score", ["B", "rc", "lc"]),
  row(650, "11:10~12:10", "score", ["A", "lc", "rc"]),
  row(650, "18:30~19:30", "score", ["B", "rc", "lc"]),
  row(650, "19:40~20:40", "score", ["A", "lc", "rc"]),
  row(650, "10:00~12:10"),
  row(650, "18:30~20:40"),
  row(750, "10:00~11:00", "score", ["B", "lc", "rc"]),
  row(750, "11:10~12:10", "score", ["A", "rc", "lc"]),
  row(750, "18:30~19:30", "score", ["B", "lc", "rc"]),
  row(750, "19:40~20:40", "score", ["A", "rc", "lc"]),
  row(750, "10:00~12:10"),
  row(750, "18:30~20:40"),
  row(850, "12:30~13:40", "score", ["B", "rc", "lc"]),
  row(850, "13:50~15:00", "score", ["A", "lc", "rc"]),
  row(850, "12:30~15:00"),
  row(650, "10:00~13:40", "sparta"),
  row(750, "10:00~13:40", "sparta"),
  row(750, "10:00~15:00", "sparta"),
  row(850, "12:30~15:00", "twoweek"),
];
const COURSES: OpenCourse[] = [
  { id: 1, program: "score", target_score: 650 },
  { id: 2, program: "score", target_score: 750 },
  { id: 3, program: "score", target_score: 850 },
  { id: 4, program: "sparta", target_score: 650 },
  { id: 5, program: "sparta", target_score: 750 },
  { id: 6, program: "twoweek", target_score: 850 },
];
const TERM = { id: 77, enrollment_opens_at: "2026-11-04", closes_at: "2026-12-01" };

describe("평달만 저절로 연다", () => {
  it("3 · 4 · 5 · 6 · 9 · 10 · 11 · 12월은 저절로, 1 · 2 · 7 · 8월(방학달)은 강사가 직접", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].filter(autoOpensMonth)).toEqual([3, 4, 5, 6, 9, 10, 11, 12]);
  });
});

describe("autoOpenCells — 강좌마다 '전체 선택' 과 같은 칸", () => {
  it("10월 시간표 19줄 × 월수금 · 화목금 = 반 38개 (10월에 실제로 연 반 수와 같다)", () => {
    const cells = autoOpenCells(COURSES, OCT, new Set());
    expect(cells).toHaveLength(38);
    // 강좌마다: 650 · 750 점수보장반 12 · 850 6 · 중급속성 2 · 실전속성 4 · 2주완성 2
    const per = (id: number) => cells.filter((c) => c.course.id === id).length;
    expect([1, 2, 3, 4, 5, 6].map(per)).toEqual([12, 12, 6, 2, 4, 2]);
  });

  it("강좌와 레벨 · 과정이 같은 줄만 — 점수보장반 줄로 속성반을 만들지 않는다", () => {
    for (const c of autoOpenCells(COURSES, OCT, new Set())) {
      expect(c.slot.level).toBe(c.course.target_score);
      expect(c.slot.program).toBe(c.course.program);
    }
  });

  it("이미 있는 (강좌 · 트랙 · 시간대)는 건너뛴다", () => {
    const taken = new Set([sectionKeyOf(1, "mwf", "10:00~11:00"), sectionKeyOf(6, "ttf", "12:30~15:00")]);
    const cells = autoOpenCells(COURSES, OCT, taken);
    expect(cells).toHaveLength(36);
    expect(cells.some((c) => c.course.id === 1 && c.track === "mwf" && c.slot.start_time === "10:00:00" && c.slot.end_time === "11:00:00")).toBe(false);
  });

  it("시간표 줄이 없는 강좌 · 레벨이 없는 강좌는 열지 않는다 — 시간 없는 반을 만들지 않는다", () => {
    const cells = autoOpenCells([{ id: 9, program: "score", target_score: 900 }, { id: 10, program: "score", target_score: null }], OCT, new Set());
    expect(cells).toEqual([]);
  });
});

describe("반 한 줄 — 새 반 개설과 같은 값", () => {
  const inserts = autoOpenInserts({ term: TERM, courses: COURSES, slots: OCT, taken: new Set(), sessions: { mwf: 9, ttf: 9 } });
  const find = (courseId: number, label: string, track: string) => inserts.find((r) => r.course_id === courseId && r.time_block === label && r.track === track)!;

  it("모집 중 · 정원 없음 · 개강일 · 종강일은 기수에서 · 회차 수는 그 트랙 수업일 수", () => {
    for (const r of inserts) {
      expect(r).toMatchObject({ term_id: 77, status: "open", capacity: null, enrollment_opens_at: "2026-11-04", closes_at: "2026-12-01", target_sessions: 9, bundle_id: null });
    }
  });

  it("시간 단위 반은 시간표의 과정 · 트랙별 과목 — 담당은 비워 DB 가 과목으로 정한다", () => {
    expect(find(1, "10:00~11:00", "mwf")).toMatchObject({ book_set: "B", subject: "rc", instructor_id: null, recorded: false, live_to_replay: true });
    expect(find(1, "10:00~11:00", "ttf")).toMatchObject({ book_set: "B", subject: "lc" });
    expect(find(2, "11:10~12:10", "ttf")).toMatchObject({ book_set: "A", subject: "lc" });
  });

  it("저녁 줄 — 화목금은 인강, 두 트랙 모두 불라방은 라이브만 (다시보기는 오전 짝)", () => {
    expect(find(1, "18:30~19:30", "ttf")).toMatchObject({ recorded: true, live_to_replay: false, subject: "lc" });
    expect(find(1, "18:30~19:30", "mwf")).toMatchObject({ recorded: false, live_to_replay: false, subject: "rc" });
  });

  it("그릇 반(한달완성 · 속성반 · 2주완성)은 과정 · 과목 · 담당을 비운다", () => {
    for (const [course, label] of [
      [1, "10:00~12:10"],
      [3, "12:30~15:00"],
      [4, "10:00~13:40"],
      [6, "12:30~15:00"],
    ] as const) {
      expect(find(course, label, "mwf"), `${course} ${label}`).toMatchObject({ book_set: null, subject: null, instructor_id: null });
    }
  });

  it("고른 강사는 그릇 반이 아닌 반에만 — 수업일이 아직 없으면 회차 수 1 (달력을 저장하면 DB 가 다시 센다)", () => {
    const slot = OCT[0];
    const base = { term: TERM, slot, kind: "hour" as const, track: "mwf" as const, sessions: 0, capacity: 30, status: "draft", instructorId: "t1" };
    expect(sectionInsertOf({ ...base, course: { id: 1, program: "score" } })).toMatchObject({ instructor_id: "t1", target_sessions: 1, capacity: 30, status: "draft" });
    expect(sectionInsertOf({ ...base, course: { id: 4, program: "sparta" } }).instructor_id).toBeNull();
    expect(sectionInsertOf({ ...base, kind: "package", course: { id: 1, program: "score" } }).instructor_id).toBeNull();
  });
});

describe("저장 · 버튼 뒤 한 줄", () => {
  it("열었으면 몇 개 · 시간표를 어디서 가져왔는지 · 받아 둔 수강증", () => {
    const msg = autoOpenMessage({ kind: "opened", month: 11, sections: 38, timetableMade: true, from: "2026년 10월", held: 3 });
    expect(msg).toContain("11월 시간표를 2026년 10월 시간표에서 가져와 만들고 반 38개를 저절로 열었어요");
    expect(msg).toContain("받아 둔 11월 수강증 3장은 곧 그 반에 배정돼요");
    expect(autoOpenMessage({ kind: "opened", month: 11, sections: 38, timetableMade: false, from: null, held: 0 }, { byButton: true })).toMatch(
      /^11월 시간표대로 반 38개를 열었어요\. 과정/,
    );
  });

  it("방학달 · 못 연 달 · 열 반이 없는 달", () => {
    expect(autoOpenMessage({ kind: "vacation", month: 1 })).toContain("1월은 방학달이라 반은 직접 열어요");
    expect(autoOpenMessage({ kind: "failed", month: 3, reason: "no_timetable" })).toContain("3월 반은 저절로 열지 못했어요 — 가져올 시간표가 없어요");
    expect(autoOpenMessage({ kind: "opened", month: 11, sections: 0, timetableMade: false, from: null, held: 0 })).toContain("열 반이 없어요");
  });
});

describe("모든 길이 같은 규칙을 쓴다", () => {
  const read = (p: string) => readFileSync(p, "utf8");

  it("달력 저장 · 시간표 만들기 · 카드 버튼이 autoOpenMonth 를 부르고, 새 반 개설도 같은 반 줄(sectionInsertOf)로 만든다", () => {
    const actions = read("src/app/admin/sections/actions.ts");
    expect(actions).toMatch(/export async function saveTermSchedule[\s\S]*?autoOpenMonth\(supabase/);
    expect(actions).toMatch(/export async function openMonthClasses\(formData: FormData\) \{\s*await requireStaff\(\);/);
    expect(read("src/app/admin/timetable/actions.ts")).toMatch(/export async function createMonthTimetable[\s\S]*?draftMonthTimetable\([\s\S]*?autoOpenMonth\(/);
    expect(read("src/app/admin/sections/bulk-actions.ts")).toContain("sectionInsertOf(");
  });

  it("자동 세팅은 반이 하나도 없을 때만 · 로그인한 세션으로 · 반이 열리면 받아 둔 수강증을 다시 맞춘다", () => {
    const core = read("src/app/admin/sections/_lib/open-month.ts");
    expect(core).toContain('import "server-only"');
    expect(core).toMatch(/if \(\(sectionCount \?\? 0\) > 0\) return null;/);
    expect(core).toMatch(/if \(!autoOpensMonth\(ym\.m\)\) return \{ kind: "vacation"/);
    expect(core).toContain("rematchHeldVerifications(createAdminClient()");
    // 시간표 · 반 쓰기는 부른 쪽의 세션(createClient) — 서비스 롤로 쓰지 않는다
    expect(core).not.toMatch(/createAdminClient\(\)\.from\(/);
  });
});
