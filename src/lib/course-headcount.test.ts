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

  it("주5일(월수금 + 화목금 두 반)은 한 사람이다", () => {
    const rows = [
      { student_id: "a", role: "student", course_id: 68 },
      { student_id: "a", role: "student", course_id: 68 },
      { student_id: "b", role: "student", course_id: 68 },
    ];
    expect(courseHeadcounts(COURSES, rows).find((h) => h.id === 68)?.count).toBe(2);
  });

  it("테스터(강사·관리자 계정)의 테스트용 배정은 세지 않는다 · 조교는 센다 (학생명단 등록생 수와 같은 규칙)", () => {
    const rows = [
      { student_id: "t1", role: "admin", course_id: 71 },
      { student_id: "t2", role: "instructor", course_id: 71 },
      { student_id: "s1", role: "student", course_id: 71 },
      { student_id: "x1", role: "assistant", course_id: 71 },
    ];
    expect(courseHeadcounts(COURSES, rows).find((h) => h.id === 71)?.count).toBe(2);
  });

  it("두 강좌를 함께 듣는 사람은 강좌마다 한 번씩 센다", () => {
    const rows = [
      { student_id: "a", role: "student", course_id: 68 },
      { student_id: "a", role: "student", course_id: 70 },
    ];
    const byId = new Map(courseHeadcounts(COURSES, rows).map((h) => [h.id, h.count]));
    expect([byId.get(68), byId.get(70)]).toEqual([1, 1]);
  });

  it("총인원은 강좌 칸의 합이 아니라 사람 수다 — 두 강좌·주5일 두 반이어도 한 명, 테스터는 뺀다", () => {
    const rows = [
      { student_id: "a", role: "student", course_id: 68 },
      { student_id: "a", role: "student", course_id: 68 },
      { student_id: "a", role: "student", course_id: 70 },
      { student_id: "b", role: "student", course_id: 71 },
      { student_id: "t", role: "admin", course_id: 71 },
      { student_id: "x", role: "student", course_id: null },
    ];
    expect(headcountTotal(rows)).toBe(2);
    expect(headcountTotal([])).toBe(0);
  });

  it("쓰지 않는 강좌는 숨기되, 그 강좌에 학생이 있으면 보인다 (사람이 사라지지 않게)", () => {
    const old: HeadcountCourse = { id: 1, name: "예전 강좌", program: "score", target_score: 900, is_active: false };
    expect(courseHeadcounts([...COURSES, old], []).some((h) => h.id === 1)).toBe(false);
    expect(courseHeadcounts([...COURSES, old], [{ student_id: "a", role: "student", course_id: 1 }]).find((h) => h.id === 1)?.count).toBe(1);
  });
});
