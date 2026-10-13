import { describe, expect, it } from "vitest";
import { blockMinutesIndex, courseHeadcounts, headcountLabel, headcountTotal, type HeadcountCourse } from "./course-headcount";

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

  describe("60분 · 120분 학생 나누기 (2026-10-13 Alan — \"60분수업 학생과 120분 수업학생 … 구분해서\")", () => {
    // 10월 650 반 전체 — 시간 단위 60분 넷과 그것을 품는 120분 묶음 둘 (월수금 · 화목금 같은 라벨)
    const BLOCKS_650 = ["10:00~11:00", "11:10~12:10", "10:00~12:10", "18:30~19:30", "19:40~20:40", "18:30~20:40"].map((time_block) => ({
      course_id: 68,
      term_id: 900,
      time_block,
    }));
    const row = (student_id: string, course_id: number, time_block: string, term_id = 900) => ({ student_id, role: "student", course_id, term_id, time_block, mode: "onsite" });

    it("분량은 반의 시간대에서 — 시간 단위 60분, 묶음은 안의 합 120분. 주5일 60분(60 + 60)은 60분, 주5일 120분 · 주3일 120분은 120분, 단과 두 장도 60분", () => {
      const rows = [
        row("a", 68, "10:00~11:00"), // 주5일 60분 — 월수금 RC + 화목금 LC
        row("a", 68, "10:00~11:00"),
        row("b", 68, "10:00~12:10"), // 주5일 120분
        row("b", 68, "10:00~12:10"),
        row("c", 68, "18:30~20:40"), // 주3일 120분 (저녁)
        row("d", 68, "10:00~11:00"), // 단과 두 장 — RC 둘
        row("d", 68, "11:10~12:10"),
      ];
      const h = courseHeadcounts(COURSES, rows, BLOCKS_650).find((h) => h.id === 68)!;
      expect(h.count).toBe(4);
      expect(h.kinds).toEqual([
        { minutes: 60, count: 2 },
        { minutes: 120, count: 2 },
      ]);
    });

    it("850 은 70분 · 140분 — 숫자를 코드에 적지 않는다. 묶음의 합은 아무도 안 듣는 70분 반까지 든 반 전체(blocks)로 낸다", () => {
      const blocks = ["12:30~13:40", "13:50~15:00", "12:30~15:00"].map((time_block) => ({ course_id: 70, term_id: 900, time_block }));
      const rows = [row("a", 70, "12:30~15:00"), row("a", 70, "12:30~15:00"), row("b", 70, "12:30~15:00")];
      expect(courseHeadcounts(COURSES, rows, blocks).find((h) => h.id === 70)?.kinds).toEqual([{ minutes: 140, count: 2 }]);
      // 반 전체 없이 배정만 보면 140분 묶음의 합을 모른다 → 어느 칸에도 적지 않는다 (큰 숫자는 그대로)
      const only = courseHeadcounts(COURSES, rows).find((h) => h.id === 70)!;
      expect([only.count, only.kinds]).toEqual([2, []]);
    });

    it("한 사람이 60분 반과 120분 묶음에 함께 있으면 긴 쪽(120분)이다", () => {
      const rows = [row("a", 68, "10:00~11:00"), row("a", 68, "18:30~20:40")];
      expect(courseHeadcounts(COURSES, rows, BLOCKS_650).find((h) => h.id === 68)?.kinds).toEqual([{ minutes: 120, count: 1 }]);
    });

    it("속성반 · 2주완성(그릇 반)은 나누지 않는다", () => {
      const withTwoWeek = [...COURSES, { id: 80, name: "850+ 2주완성", program: "twoweek", target_score: 850, is_active: true }];
      const blocks = [
        { course_id: 71, term_id: 900, time_block: "10:00~13:40" },
        { course_id: 80, term_id: 900, time_block: "12:30~15:00" },
      ];
      const rows = [row("a", 71, "10:00~13:40"), row("b", 80, "12:30~15:00"), row("b", 80, "12:30~15:00")];
      const out = courseHeadcounts(withTwoWeek, rows, blocks);
      expect(out.find((h) => h.id === 71)).toMatchObject({ count: 1, kinds: [] });
      expect(out.find((h) => h.id === 80)).toMatchObject({ count: 1, kinds: [] });
    });

    it("분량을 모르는 반(시간이 없는 반 · 방학달 통짜 120분)의 학생은 어느 칸에도 적지 않는다 — 아는 칸이 없으면 빈 목록", () => {
      // 방학달 — 10:00~12:10 통짜 하나뿐이라 쉬는 시간을 모른다
      const vacation = [{ course_id: 68, term_id: 901, time_block: "10:00~12:10" }];
      const rows = [row("a", 68, "10:00~12:10", 901), row("b", 68, "10:00~12:10", 901), row("c", 68, null as unknown as string, 901)];
      const h = courseHeadcounts(COURSES, rows, vacation).find((h) => h.id === 68)!;
      expect([h.count, h.kinds]).toEqual([3, []]);
      // 방학달 850 80분(15:30~16:50)은 한 교시라 분량을 안다 — 칸이 하나뿐이어도 적는다
      const b850 = [{ course_id: 70, term_id: 901, time_block: "15:30~16:50" }];
      expect(courseHeadcounts(COURSES, [row("a", 70, "15:30~16:50", 901)], b850).find((h) => h.id === 70)?.kinds).toEqual([{ minutes: 80, count: 1 }]);
    });

    it("기수가 다르면 트리를 따로 만든다 — 9월 반의 60분 라벨이 10월 묶음의 부품이 되지 않는다 · 테스터는 세지 않는다", () => {
      const blocks = [
        { course_id: 68, term_id: 899, time_block: "10:00~11:00" },
        { course_id: 68, term_id: 899, time_block: "11:10~12:10" },
        { course_id: 68, term_id: 900, time_block: "10:00~12:10" },
      ];
      const rows = [row("a", 68, "10:00~12:10"), { ...row("t", 68, "10:00~11:00", 899), role: "admin" }];
      expect(courseHeadcounts(COURSES, rows, blocks).find((h) => h.id === 68)).toMatchObject({ count: 1, kinds: [] });
    });

    it("blockMinutesIndex — (기수 · 강좌 · 시간대) 마다 분량, 강좌 · 시간이 없는 줄은 건너뛴다", () => {
      const index = blockMinutesIndex([...BLOCKS_650, { course_id: null, term_id: 900, time_block: "10:00~11:00" }, { course_id: 68, term_id: 900, time_block: null }]);
      expect(index.get("900|68|10:00~12:10")).toBe(120);
      expect(index.get("900|68|11:10~12:10")).toBe(60);
      expect(index.size).toBe(6);
    });
  });

  it("쓰지 않는 강좌는 숨기되, 그 강좌에 학생이 있으면 보인다 (사람이 사라지지 않게)", () => {
    const old: HeadcountCourse = { id: 1, name: "예전 강좌", program: "score", target_score: 900, is_active: false };
    expect(courseHeadcounts([...COURSES, old], []).some((h) => h.id === 1)).toBe(false);
    expect(courseHeadcounts([...COURSES, old], [{ student_id: "a", role: "student", course_id: 1, mode: "onsite" }]).find((h) => h.id === 1)?.count).toBe(1);
  });
});
