import { describe, expect, it } from "vitest";
import { courseHeadcounts, headcountLabel, headcountTotal, type HeadcountCourse } from "./course-headcount";

// 운영 강좌 그대로 (2026-09-23 조회) — 순서를 일부러 섞어 둔다
const COURSES: HeadcountCourse[] = [
  { id: 71, name: "스파르타 650+ 중급속성", program: "sparta", target_score: 650, is_active: true },
  { id: 70, name: "850+ 문제마스터", program: "score", target_score: 850, is_active: true },
  { id: 68, name: "650+ 왕기초반", program: "score", target_score: 650, is_active: true },
  { id: 72, name: "스파르타 750+ 실전속성", program: "sparta", target_score: 750, is_active: true },
  { id: 69, name: "750+ 유형마스터", program: "score", target_score: 750, is_active: true },
];

describe("대시보드 등록생 위젯 — 강좌마다 지금 수강 중인 사람 수", () => {
  it("이름: 점수보장반은 레벨 숫자, 속성반은 중급속성 · 실전속성", () => {
    expect(headcountLabel(COURSES[2])).toBe("650");
    expect(headcountLabel(COURSES[0])).toBe("중급속성");
    expect(headcountLabel(COURSES[3])).toBe("실전속성");
  });

  it("650 / 750 / 850 / 중급속성 / 실전속성 순서이고 학생이 없어도 0 으로 보인다", () => {
    expect(courseHeadcounts(COURSES, []).map((h) => `${h.label}:${h.count}`)).toEqual(["650:0", "750:0", "850:0", "중급속성:0", "실전속성:0"]);
  });

  it("2주완성(2026-10-05)은 `850 2주완성` — 속성반 다음 맨 뒤", () => {
    const withTwoWeek = [...COURSES, { id: 80, name: "850+ 2주완성", program: "twoweek", target_score: 850, is_active: true }];
    expect(headcountLabel(withTwoWeek[5])).toBe("850 2주완성");
    expect(courseHeadcounts(withTwoWeek, []).map((h) => h.label)).toEqual(["650", "750", "850", "중급속성", "실전속성", "850 2주완성"]);
  });

  it("주5일(월수금 + 화목금 두 반)은 한 사람이다", () => {
    const rows = [
      { student_id: "a", role: "student", course_id: 68, mode: "onsite" },
      { student_id: "a", role: "student", course_id: 68, mode: "onsite" },
      { student_id: "b", role: "student", course_id: 68, mode: "onsite" },
    ];
    expect(courseHeadcounts(COURSES, rows).find((h) => h.id === 68)?.count).toBe(2);
  });

  it("테스터(강사·관리자 계정)의 테스트용 배정은 세지 않는다 · 조교는 센다 (학생명단 등록생 수와 같은 규칙)", () => {
    const rows = [
      { student_id: "t1", role: "admin", course_id: 71, mode: "onsite" },
      { student_id: "t2", role: "instructor", course_id: 71, mode: "onsite" },
      { student_id: "s1", role: "student", course_id: 71, mode: "onsite" },
      { student_id: "x1", role: "assistant", course_id: 71, mode: "onsite" },
    ];
    expect(courseHeadcounts(COURSES, rows).find((h) => h.id === 71)?.count).toBe(2);
  });

  it("두 강좌를 함께 듣는 사람은 강좌마다 한 번씩 센다", () => {
    const rows = [
      { student_id: "a", role: "student", course_id: 68, mode: "onsite" },
      { student_id: "a", role: "student", course_id: 70, mode: "onsite" },
    ];
    const byId = new Map(courseHeadcounts(COURSES, rows).map((h) => [h.id, h.count]));
    expect([byId.get(68), byId.get(70)]).toEqual([1, 1]);
  });

  it("총인원은 강좌 칸의 합이 아니라 사람 수다 — 두 강좌·주5일 두 반이어도 한 명, 테스터는 뺀다", () => {
    const rows = [
      { student_id: "a", role: "student", course_id: 68, mode: "onsite" },
      { student_id: "a", role: "student", course_id: 68, mode: "onsite" },
      { student_id: "a", role: "student", course_id: 70, mode: "onsite" },
      { student_id: "b", role: "student", course_id: 71, mode: "onsite" },
      { student_id: "t", role: "admin", course_id: 71, mode: "onsite" },
      { student_id: "x", role: "student", course_id: null, mode: "onsite" },
    ];
    expect(headcountTotal(rows).count).toBe(2);
    expect(headcountTotal([])).toEqual({ count: 0, live: 0 });
  });

  it("그중 불라방 인원 (2026-10-06) — 사람마다 한 번, 큰 숫자(전체)는 그대로", () => {
    const rows = [
      // 주5일 불라방 — 두 반이어도 한 사람
      { student_id: "a", role: "student", course_id: 70, mode: "live" },
      { student_id: "a", role: "student", course_id: 70, mode: "live" },
      // 현장
      { student_id: "b", role: "student", course_id: 70, mode: "onsite" },
      // 주5일인데 월수금 현장 · 화목금 불라방 — 반 배정 하나라도 불라방이면 불라방
      { student_id: "c", role: "student", course_id: 70, mode: "onsite" },
      { student_id: "c", role: "student", course_id: 70, mode: "live" },
      // 테스터의 불라방 배정은 세지 않는다
      { student_id: "t", role: "admin", course_id: 70, mode: "live" },
    ];
    const h850 = courseHeadcounts(COURSES, rows).find((h) => h.id === 70);
    expect([h850?.count, h850?.live]).toEqual([3, 2]);
    expect(courseHeadcounts(COURSES, rows).find((h) => h.id === 68)).toMatchObject({ count: 0, live: 0 });
  });

  it("총인원의 불라방도 사람 수다 — 두 강좌에서 불라방이어도 한 명, 강좌를 모르는 줄 · 테스터는 뺀다", () => {
    const rows = [
      { student_id: "a", role: "student", course_id: 68, mode: "live" },
      { student_id: "a", role: "student", course_id: 70, mode: "live" },
      { student_id: "b", role: "student", course_id: 71, mode: "onsite" },
      { student_id: "c", role: "student", course_id: 69, mode: "live" },
      { student_id: "x", role: "student", course_id: null, mode: "live" },
      { student_id: "t", role: "instructor", course_id: 71, mode: "live" },
    ];
    expect(headcountTotal(rows)).toEqual({ count: 3, live: 2 });
  });

  it("쓰지 않는 강좌는 숨기되, 그 강좌에 학생이 있으면 보인다 (사람이 사라지지 않게)", () => {
    const old: HeadcountCourse = { id: 1, name: "예전 강좌", program: "score", target_score: 900, is_active: false };
    expect(courseHeadcounts([...COURSES, old], []).some((h) => h.id === 1)).toBe(false);
    expect(courseHeadcounts([...COURSES, old], [{ student_id: "a", role: "student", course_id: 1, mode: "onsite" }]).find((h) => h.id === 1)?.count).toBe(1);
  });
});
