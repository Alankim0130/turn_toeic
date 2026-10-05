import { describe, expect, it } from "vitest";
import { SINGLE_SUBJECT_LABEL, singleSubjectOf } from "./section-type";
import { groupWeek5, week5SectionIds } from "./week5";

/**
 * 학생명단 카드의 단과 이름표 (2026-10-05 Alan — "종합반이 대부분이니 RC단과, LC단과만 표시").
 * 반 한 줄(주5일이면 두 반)의 과목이 하나일 때만 단과다.
 */

type Sec = {
  id: number;
  term_id: number;
  course_id: number;
  track: string;
  time_block: string;
  subject: string | null;
  course: { course_type: string; program: string };
};

const SCORE = { course_type: "full", program: "score" };
const sec = (id: number, track: string, time_block: string, subject: string | null, course = SCORE, course_id = 650): Sec => ({
  id,
  term_id: 10,
  course_id,
  track,
  time_block,
  subject,
  course,
});

describe("singleSubjectOf — 반 한 줄이 단과인지", () => {
  it("주3일 60분 RC → RC단과", () => {
    expect(singleSubjectOf([sec(1, "mwf", "10:00~11:00", "rc")])).toBe("rc");
  });

  it("주3일 60분 LC · 850 70분 LC → LC단과", () => {
    expect(singleSubjectOf([sec(1, "ttf", "11:10~12:10", "lc")])).toBe("lc");
    expect(singleSubjectOf([sec(2, "mwf", "13:50~15:00", "lc", SCORE, 850)])).toBe("lc");
  });

  it("주5일 60분은 두 트랙의 과목이 반대라(월수금 RC · 화목금 LC) 단과가 아니다", () => {
    expect(singleSubjectOf([sec(1, "mwf", "10:00~11:00", "rc"), sec(2, "ttf", "10:00~11:00", "lc")])).toBeNull();
  });

  it("주5일이어도 두 트랙이 같은 과목이면 단과다 (시간표에서 그렇게 정한 시간)", () => {
    expect(singleSubjectOf([sec(1, "mwf", "10:00~11:00", "rc"), sec(2, "ttf", "10:00~11:00", "rc")])).toBe("rc");
  });

  it("묶음 반(120 · 140분) · 방학달 통짜 반은 과목 칸이 비어 종합 — 적지 않는다", () => {
    expect(singleSubjectOf([sec(1, "mwf", "10:00~12:10", null)])).toBeNull();
    expect(singleSubjectOf([sec(1, "mwf", "12:30~15:00", null, SCORE, 850), sec(2, "ttf", "12:30~15:00", null, SCORE, 850)])).toBeNull();
  });

  it("속성반 · 2주완성(그릇 반)은 과목 칸이 잘못 채워져 있어도 종합이다", () => {
    expect(singleSubjectOf([sec(1, "mwf", "10:00~13:40", "rc", { course_type: "full", program: "sparta" })])).toBeNull();
    expect(singleSubjectOf([sec(1, "mwf", "12:30~15:00", "lc", { course_type: "full", program: "twoweek" }, 850)])).toBeNull();
  });

  it("과목을 아직 안 고른 시간 단위 반은 모른다 — 짐작해 적지 않는다", () => {
    expect(singleSubjectOf([sec(1, "mwf", "10:00~11:00", null)])).toBeNull();
    expect(singleSubjectOf([sec(1, "mwf", "10:00~11:00", "rc"), sec(2, "ttf", "10:00~11:00", null)])).toBeNull();
  });

  it("강좌가 단과 상품(course_type lc · rc)이면 그 과목이다 — sectionTypeLabel 과 같은 순서", () => {
    expect(singleSubjectOf([sec(1, "mwf", "10:00~12:10", null, { course_type: "lc", program: "score" })])).toBe("lc");
  });

  it("반이 없으면 null · 이상한 과목 값은 모른다", () => {
    expect(singleSubjectOf([])).toBeNull();
    expect(singleSubjectOf([sec(1, "mwf", "10:00~11:00", "LC")])).toBeNull();
    expect(singleSubjectOf([{ subject: "rc", course: null }])).toBe("rc");
  });

  it("이름표는 Alan 이 적은 그대로", () => {
    expect(SINGLE_SUBJECT_LABEL).toEqual({ rc: "RC단과", lc: "LC단과" });
  });
});

describe("학생명단 카드처럼 — 주5일 짝을 한 줄로 묶은 뒤 판정", () => {
  /** 명단 화면(`/admin/students`)과 같은 순서: 그 학생의 반으로 짝을 찾고 → 묶고 → 줄마다 판정 */
  const lines = (sections: Sec[]) => {
    const week5 = week5SectionIds(sections);
    return groupWeek5(sections, (s) => s, week5).map((g) => ({ ids: g.map((s) => s.id), single: singleSubjectOf(g) }));
  };

  it("주3일 60분 RC 학생 → 한 줄, RC단과", () => {
    expect(lines([sec(1, "mwf", "10:00~11:00", "rc")])).toEqual([{ ids: [1], single: "rc" }]);
  });

  it("주5일 60분 학생 → 한 줄, 표시 없음", () => {
    expect(lines([sec(2, "ttf", "10:00~11:00", "lc"), sec(1, "mwf", "10:00~11:00", "rc")])).toEqual([{ ids: [1, 2], single: null }]);
  });

  it("주5일 120분 학생(묶음 반 둘) → 한 줄, 표시 없음", () => {
    expect(lines([sec(1, "mwf", "10:00~12:10", null), sec(2, "ttf", "10:00~12:10", null)])).toEqual([{ ids: [1, 2], single: null }]);
  });

  it("두 달 등록 — 9월 종합 · 10월 RC 단과면 줄마다 따로", () => {
    const sept = { ...sec(1, "mwf", "10:00~12:10", null), term_id: 9 };
    const octo = sec(2, "mwf", "10:00~11:00", "rc");
    expect(lines([sept, octo])).toEqual([
      { ids: [1], single: null },
      { ids: [2], single: "rc" },
    ]);
  });
});
