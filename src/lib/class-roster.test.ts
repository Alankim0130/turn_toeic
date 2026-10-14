import { describe, expect, it } from "vitest";
import {
  buildClassRoster,
  groupByLevel,
  columnDetail,
  columnHeading,
  marksText,
  rosterDisposition,
  rosterFileName,
  rosterTerms,
  type RosterEnrollment,
  type RosterPerson,
  type RosterSection,
  type RosterSubject,
} from "./class-roster";

// 10월 편성 (재생 DB · 운영과 같은 모양) — 650 10:00 = B과정(월수금 RC · 화목금 LC) · 11:10 = A과정(월수금 LC · 화목금 RC),
// 850 12:30 = B(월수금 RC · 화목금 LC) · 13:50 = A(월수금 LC · 화목금 RC). 이름은 지어낸 것이다 (실명을 넣지 않는다)
const CLOSES = "2026-11-03";
const sec = (id: number, o: Partial<RosterSection> & Pick<RosterSection, "track" | "timeBlock">): RosterSection => ({
  id,
  subject: null,
  bookSet: null,
  recorded: false,
  closesAt: CLOSES,
  courseId: 650,
  level: 650,
  program: "score",
  courseName: "650+ 왕기초반",
  ...o,
});
const SECTIONS: RosterSection[] = [
  sec(1, { track: "mwf", timeBlock: "10:00~11:00", subject: "rc", bookSet: "B" }),
  sec(2, { track: "ttf", timeBlock: "10:00~11:00", subject: "lc", bookSet: "B" }),
  sec(3, { track: "mwf", timeBlock: "10:00~12:10" }),
  sec(4, { track: "ttf", timeBlock: "10:00~12:10" }),
  sec(5, { track: "mwf", timeBlock: "11:10~12:10", subject: "lc", bookSet: "A" }),
  sec(6, { track: "ttf", timeBlock: "11:10~12:10", subject: "rc", bookSet: "A" }),
  sec(8, { track: "ttf", timeBlock: "18:30~19:30", subject: "lc", bookSet: "B", recorded: true }),
  sec(9, { track: "mwf", timeBlock: "19:40~20:40", subject: "lc", bookSet: "A" }),
  sec(11, { track: "mwf", timeBlock: "10:00~11:00", subject: "lc", bookSet: "B", courseId: 750, level: 750, courseName: "750+ 유형마스터" }),
  sec(14, { track: "ttf", timeBlock: "11:10~12:10", subject: "lc", bookSet: "A", courseId: 750, level: 750, courseName: "750+ 유형마스터" }),
  sec(21, { track: "mwf", timeBlock: "12:30~13:40", subject: "rc", bookSet: "B", courseId: 850, level: 850, courseName: "850+ 문제마스터" }),
  sec(22, { track: "ttf", timeBlock: "12:30~13:40", subject: "lc", bookSet: "B", courseId: 850, level: 850, courseName: "850+ 문제마스터" }),
  sec(25, { track: "mwf", timeBlock: "13:50~15:00", subject: "lc", bookSet: "A", courseId: 850, level: 850, courseName: "850+ 문제마스터" }),
  sec(26, { track: "ttf", timeBlock: "13:50~15:00", subject: "rc", bookSet: "A", courseId: 850, level: 850, courseName: "850+ 문제마스터" }),
  sec(31, { track: "mwf", timeBlock: "10:00~13:40", courseId: 6501, program: "sparta", courseName: "스파르타 650+ 중급속성" }),
  sec(32, { track: "ttf", timeBlock: "10:00~13:40", courseId: 6501, program: "sparta", courseName: "스파르타 650+ 중급속성" }),
  sec(41, { track: "mwf", timeBlock: "12:30~15:00", courseId: 8502, level: 850, program: "twoweek", courseName: "850+ 2주완성", closesAt: "2026-10-17" }),
  sec(42, { track: "ttf", timeBlock: "12:30~15:00", courseId: 8502, level: 850, program: "twoweek", courseName: "850+ 2주완성", closesAt: "2026-10-17" }),
];
// DB term_section_includes 가 주는 것과 같은 꼴 (같은 트랙 안)
const INCLUDES = new Map<number, number[]>([
  [3, [1, 5]],
  [4, [2, 6]],
  [31, [1, 5, 21]],
  [32, [2, 6, 22]],
  [41, [21, 25]],
  [42, [22, 26]],
]);

const PEOPLE = new Map<string, RosterPerson>([
  ["u120x5", { name: "다온", staff: false }],
  ["u120mwfLive", { name: "가온", staff: false }],
  ["u60x5", { name: "라온", staff: false }],
  ["uRcOnly", { name: "마루", staff: false }],
  ["uSparta", { name: "나리", staff: false }],
  ["uTwoWeek", { name: "바다", staff: false }],
  ["uTeacher", { name: "아라", staff: true }],
  ["uEvening", { name: "사랑", staff: false }],
  ["uRecorded", { name: "자람", staff: false }],
  ["uTwoLevels", { name: "하늘", staff: false }],
]);
const ENROLL: RosterEnrollment[] = [
  // 120분 주5일 현장
  { studentId: "u120x5", sectionId: 3, mode: "onsite" },
  { studentId: "u120x5", sectionId: 4, mode: "onsite" },
  // 120분 주3일 월수금 불라방
  { studentId: "u120mwfLive", sectionId: 3, mode: "live" },
  // 60분 주5일 10:00 (월수금 RC · 화목금 LC)
  { studentId: "u60x5", sectionId: 1, mode: "onsite" },
  { studentId: "u60x5", sectionId: 2, mode: "onsite" },
  // 60분 주3일 RC 단과
  { studentId: "uRcOnly", sectionId: 1, mode: "onsite" },
  // 650 중급속성 불라방
  { studentId: "uSparta", sectionId: 31, mode: "live" },
  { studentId: "uSparta", sectionId: 32, mode: "live" },
  // 850 2주완성 주5일
  { studentId: "uTwoWeek", sectionId: 41, mode: "onsite" },
  { studentId: "uTwoWeek", sectionId: 42, mode: "onsite" },
  // 강사 계정의 테스트 배정
  { studentId: "uTeacher", sectionId: 3, mode: "onsite" },
  // 저녁 60분 월수금 LC
  { studentId: "uEvening", sectionId: 9, mode: "onsite" },
  // 저녁 화목금 인강 LC
  { studentId: "uRecorded", sectionId: 8, mode: "onsite" },
  // 650 RC 단과 월수금 + 750 LC 단과 화목금 (두 레벨)
  { studentId: "uTwoLevels", sectionId: 1, mode: "onsite" },
  { studentId: "uTwoLevels", sectionId: 14, mode: "live" },
];

const build = (subject: RosterSubject, today = "2026-10-14", over: Partial<Parameters<typeof buildClassRoster>[0]> = {}) =>
  buildClassRoster({ sections: SECTIONS, includes: INCLUDES, enrollments: ENROLL, people: PEOPLE, subject, today, ...over });

/** 칸 → "이름(표시)" 목록 — 칸 머리로 찾는다 */
const view = (r: ReturnType<typeof build>) =>
  Object.fromEntries(r.levels.flatMap((l) => l.columns.map((c) => [`${columnHeading(c)} ${c.time}`, c.students.map((s) => s.name + marksText(s.marks))])));

describe("반별 명단 — 종이 명단처럼 한 칸이 수업 한 반 (2026-10-14 Alan)", () => {
  it("LC 명단: 120분은 그 과목 시간의 칸에, 주5일 60분은 한 칸에, 속성반은 650 과 850 화목금 12:30 에 선다", () => {
    expect(view(build("lc"))).toEqual({
      "650B (화목금) 10:00~11:00": ["나리(불/프)", "다온", "라온"],
      "650A (월수금) 11:10~12:10": ["가온(불/월)", "나리(불/프)", "다온"],
      "650B (화목금) 18:30~19:30": ["자람(화)"],
      "650A (월수금) 19:40~20:40": ["사랑(월)"],
      "750A (화목금) 11:10~12:10": ["하늘(불/화)"],
      // 속성반은 850 12:30 만 듣는다 — 그 시간 LC 는 화목금이라 850 월수금 13:50 칸에는 없다 (종이 명단과 같다)
      "850B (화목금) 12:30~13:40": ["나리(불/프)", "바다(2주)"],
      "850A (월수금) 13:50~15:00": ["바다(2주)"],
    });
  });

  it("RC 명단은 같은 학생이 반대 시간의 칸에 선다 — RC 단과는 RC 명단에만", () => {
    expect(view(build("rc"))).toEqual({
      "650B (월수금) 10:00~11:00": ["가온(불/월)", "나리(불/프)", "다온", "라온", "마루(월)", "하늘(월)"],
      "650A (화목금) 11:10~12:10": ["나리(불/프)", "다온"],
      "850B (월수금) 12:30~13:40": ["나리(불/프)", "바다(2주)"],
      "850A (화목금) 13:50~15:00": ["바다(2주)"],
    });
  });

  it("강사 · 관리자 · 조교 계정은 넣지 않는다 — 학생 화면을 보려고 넣은 테스트 배정이다", () => {
    const all = [...build("lc").levels, ...build("rc").levels].flatMap((l) => l.columns.flatMap((c) => c.students.map((s) => s.id)));
    expect(all).not.toContain("uTeacher");
  });

  it("이름은 가나다순 — 같은 칸에 들어온 순서와 상관없다", () => {
    for (const subject of ["lc", "rc"] as const) {
      for (const col of build(subject).levels.flatMap((l) => l.columns)) {
        const names = col.students.map((s) => s.name);
        expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "ko")));
      }
    }
  });

  it("칸은 레벨 → 시작 시각 → 트랙(월수금 먼저) 순, 레벨마다 묶고 사람 수를 센다", () => {
    const r = build("lc");
    expect(r.levels.map((l) => [l.label, l.count, l.columns.map((c) => c.sectionId)])).toEqual([
      ["650", 6, [2, 5, 8, 9]],
      ["750", 1, [14]],
      ["850", 2, [22, 25]],
    ]);
    // 이 명단에 선 학생 · 이 과목 수업이 없는 학생 (LC 명단의 RC 단과)
    expect(r.total).toBe(8);
    expect(r.elsewhere).toBe(1);
  });

  it("학생이 없는 반은 칸을 그리지 않고 따로 둔다", () => {
    expect(build("lc").empty.map((c) => c.sectionId)).toEqual([11]);
  });

  it("종강한 배정은 빠진다 — 앞 절반이 끝난 2주완성 학생이 그 달 끝까지 남지 않게", () => {
    const after = view(build("lc", "2026-10-18"));
    expect(Object.values(after).flat()).not.toContain("바다(2주)");
    expect(after["850B (화목금) 12:30~13:40"]).toEqual(["나리(불/프)"]);
    // 13:50 칸은 비어 따로 간다
    expect(build("lc", "2026-10-18").empty.map((c) => c.sectionId)).toContain(25);
  });

  it("방학달 통짜 반(과목 칸이 빔)은 두 과목 명단에 다 선다", () => {
    const vac: RosterSection[] = [sec(71, { track: "mwf", timeBlock: "10:00~12:10", bookSet: "A" })];
    const enroll: RosterEnrollment[] = [{ studentId: "u120x5", sectionId: 71, mode: "onsite" }];
    for (const subject of ["lc", "rc"] as const) {
      const r = buildClassRoster({ sections: vac, includes: new Map(), enrollments: enroll, people: PEOPLE, subject, today: "2026-10-14" });
      expect(r.levels[0].columns[0]).toMatchObject({ title: "650A", bothSubjects: true, students: [{ name: "다온", marks: ["월"] }] });
      expect(columnDetail(r.levels[0].columns[0])).toBe("10:00~12:10 RC·LC");
    }
  });

  it("같은 학생이 같은 칸에 두 번 오지 않는다 (120분 반과 그 안의 60분 반을 함께 배정해도)", () => {
    const r = build("lc", "2026-10-14", { enrollments: [...ENROLL, { studentId: "u120x5", sectionId: 5, mode: "onsite" }] });
    expect(r.levels[0].columns.find((c) => c.sectionId === 5)?.students.filter((s) => s.id === "u120x5")).toHaveLength(1);
  });

  it("칸 머리 — 레벨 + 과정 글자 (트랙) · 시간 · 인강", () => {
    const col = build("lc").levels[0].columns.find((c) => c.sectionId === 8)!;
    expect(columnHeading(col)).toBe("650B (화목금)");
    expect(columnDetail(col)).toBe("18:30~19:30 인강");
    expect(marksText([])).toBe("");
    expect(marksText(["불", "월"])).toBe("(불/월)");
  });
});

describe("명단을 고를 기수 · 받는 파일 이름", () => {
  it("아직 종강하지 않은 기수만 개강일 순 — 날짜를 안 정한 기수는 빼고", () => {
    const terms = [
      { id: 9, year: 2026, month: 9, enrollment_opens_at: "2026-09-03", closes_at: "2026-10-03" },
      { id: 11, year: 2026, month: 11, enrollment_opens_at: "2026-11-04", closes_at: "2026-12-01" },
      { id: 10, year: 2026, month: 10, enrollment_opens_at: "2026-10-06", closes_at: "2026-11-03" },
      { id: 12, year: 2026, month: 12, enrollment_opens_at: null, closes_at: null },
    ];
    expect(rosterTerms(terms, "2026-10-14").map((t) => t.month)).toEqual([10, 11]);
    expect(rosterTerms(terms, "2026-10-03").map((t) => t.month)).toEqual([9, 10, 11]);
  });

  it("파일 이름은 달과 과목 — 한글 이름과 영문 이름을 함께 준다", () => {
    expect(rosterFileName({ year: 2026, month: 10 }, "lc")).toBe("역전토익_반별명단_2026-10_LC.pdf");
    expect(rosterDisposition({ year: 2026, month: 10 }, "rc")).toBe(
      `attachment; filename="winnertoeic-class-roster_2026-10_RC.pdf"; filename*=UTF-8''${encodeURIComponent("역전토익_반별명단_2026-10_RC.pdf")}`,
    );
  });
});

describe("카드 명단 — 레벨별 · 가나다순 (휴대폰 기본 화면)", () => {
  it("레벨 작은 것부터, 묶음 안은 이름 가나다순, 두 레벨이면 두 묶음 다, 반이 없으면 맨 끝", () => {
    const people = [
      { name: "하늘", levels: [650] },
      { name: "가온", levels: [750] },
      { name: "나리", levels: [650, 750] },
      { name: "다온", levels: [] as number[] },
      { name: "라온", levels: [650, 650] },
    ];
    const groups = groupByLevel(people, (p) => p.levels, (p) => p.name);
    expect(groups.map((g) => [g.level, g.items.map((p) => p.name)])).toEqual([
      [650, ["나리", "라온", "하늘"]],
      [750, ["가온", "나리"]],
      [null, ["다온"]],
    ]);
  });
});
