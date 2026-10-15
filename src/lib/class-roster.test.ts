import { describe, expect, it } from "vitest";
import {
  buildClassRoster,
  groupByLevel,
  columnDetail,
  columnHeading,
  marksText,
  rosterDisposition,
  rosterFileName,
  rosterMarks,
  rosterTerms,
  type RosterEnrollment,
  type RosterPerson,
  type RosterSection,
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

const build = (today = "2026-10-14", over: Partial<Parameters<typeof buildClassRoster>[0]> = {}) =>
  buildClassRoster({ sections: SECTIONS, includes: INCLUDES, enrollments: ENROLL, people: PEOPLE, today, ...over });

/** 칸 → "이름(표시)" 목록 — 칸 이름("650B 10:00~11:00")으로 찾는다 */
const view = (r: ReturnType<typeof build>) =>
  Object.fromEntries(r.levels.flatMap((l) => l.columns.map((c) => [columnHeading(c), c.students.map((s) => s.name + marksText(s.marks))])));

describe("반별 명단 — 한 칸이 한 레벨의 수업 시간 한 칸 · LC · RC 를 합친다 (2026-10-14 Alan)", () => {
  it("월수금 · 화목금을 한 칸에 합친다 — 120분은 두 시간 칸에, 주5일 60분은 한 칸에, 속성반은 650 칸과 850 12:30 칸에 선다", () => {
    expect(view(build())).toEqual({
      // 10:00 = 월수금 RC + 화목금 LC — RC 단과(마루 · 하늘)도 이 칸에 선다 (예전 LC 명단에는 없었다)
      "650B 10:00~11:00": ["가온(불/월)", "나리(불/프)", "다온", "라온", "마루(RC)", "하늘(RC)"],
      "650A 11:10~12:10": ["가온(불/월)", "나리(불/프)", "다온"],
      "650B 18:30~19:30": ["자람(LC)"],
      "650A 19:40~20:40": ["사랑(LC)"],
      "750A 11:10~12:10": ["하늘(불/LC)"],
      // 속성반은 850 12:30 만 듣는다 — 13:50 칸에는 없다
      "850B 12:30~13:40": ["나리(불/프)", "바다(2주)"],
      "850A 13:50~15:00": ["바다(2주)"],
    });
  });

  it("칸 머리 둘째 줄은 트랙마다 과목 — 월 RC · 화 LC, 저녁 인강, 한 트랙만 연 시간", () => {
    const cols = Object.fromEntries(build().levels.flatMap((l) => l.columns.map((c) => [columnHeading(c), columnDetail(c)])));
    expect(cols["650B 10:00~11:00"]).toBe("월 RC · 화 LC");
    expect(cols["650A 11:10~12:10"]).toBe("월 LC · 화 RC");
    expect(cols["650B 18:30~19:30"]).toBe("화 LC 인강");
    expect(cols["650A 19:40~20:40"]).toBe("월 LC");
  });

  it("단과는 (LC) · (RC) — 그 강좌에서 듣는 시간이 전부 한 과목일 때만. 주5일 60분 · 120분 · 속성반은 단과가 아니다", () => {
    const marks = (id: string) =>
      [...new Set(build().levels.flatMap((l) => l.columns.flatMap((c) => c.students.filter((s) => s.id === id).map((s) => marksText(s.marks)))))];
    expect(marks("uRcOnly")).toEqual(["(RC)"]);
    expect(marks("uEvening")).toEqual(["(LC)"]);
    expect(marks("u60x5")).toEqual([""]); // 월수금 RC + 화목금 LC
    expect(marks("u120x5")).toEqual([""]);
    expect(marks("u120mwfLive")).toEqual(["(불/월)"]); // 주3일 120분 — 월수금 RC + LC 라 단과가 아니고 한 트랙
    expect(marks("uSparta")).toEqual(["(불/프)"]);
    // 650 RC 단과 + 750 LC 단과 — 강좌마다 따로 본다
    expect(view(build())["650B 10:00~11:00"]).toContain("하늘(RC)");
    expect(view(build())["750A 11:10~12:10"]).toEqual(["하늘(불/LC)"]);
  });

  it("단과 두 장이어도 같은 과목이면 단과 — 10:00 월수금 RC + 11:10 화목금 RC 는 두 칸 다 (RC)", () => {
    const r = build("2026-10-14", { enrollments: [{ studentId: "uRcOnly", sectionId: 1, mode: "onsite" }, { studentId: "uRcOnly", sectionId: 6, mode: "onsite" }] });
    expect(view(r)).toEqual({ "650B 10:00~11:00": ["마루(RC)"], "650A 11:10~12:10": ["마루(RC)"] });
    // 10:00 월수금 RC + 11:10 월수금 LC 는 두 과목 — 단과가 아니고 월수금만이라 (월)
    const both = build("2026-10-14", { enrollments: [{ studentId: "uRcOnly", sectionId: 1, mode: "onsite" }, { studentId: "uRcOnly", sectionId: 5, mode: "onsite" }] });
    expect(view(both)).toEqual({ "650B 10:00~11:00": ["마루(월)"], "650A 11:10~12:10": ["마루(월)"] });
  });

  it("강사 · 관리자 · 조교 계정은 넣지 않는다 — 학생 화면을 보려고 넣은 테스트 배정이다", () => {
    const all = build().levels.flatMap((l) => l.columns.flatMap((c) => c.students.map((s) => s.id)));
    expect(all).not.toContain("uTeacher");
  });

  it("이름은 가나다순 — 같은 칸에 들어온 순서와 상관없다", () => {
    for (const col of build().levels.flatMap((l) => l.columns)) {
      const names = col.students.map((s) => s.name);
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "ko")));
    }
  });

  it("칸은 레벨 → 시작 시각 순, 레벨마다 묶고 사람 수를 센다 — 칸 하나에 두 트랙의 반이 들어간다", () => {
    const r = build();
    expect(r.levels.map((l) => [l.label, l.count, l.columns.map((c) => c.sectionIds)])).toEqual([
      ["650", 8, [[1, 2], [5, 6], [8], [9]]],
      ["750", 1, [[14]]],
      ["850", 2, [[21, 22], [25, 26]]],
    ]);
    expect(r.total).toBe(9);
    expect(r.unplaced).toBe(0);
  });

  it("학생이 없는 칸은 그리지 않고 따로 둔다", () => {
    expect(build().empty.map((c) => c.sectionIds)).toEqual([[11]]);
  });

  it("종강한 배정은 빠진다 — 앞 절반이 끝난 2주완성 학생이 그 달 끝까지 남지 않게", () => {
    const after = view(build("2026-10-18"));
    expect(Object.values(after).flat()).not.toContain("바다(2주)");
    expect(after["850B 12:30~13:40"]).toEqual(["나리(불/프)"]);
    // 13:50 칸은 비어 따로 간다
    expect(build("2026-10-18").empty.map((c) => c.sectionIds)).toContainEqual([25, 26]);
  });

  it("방학달 통짜 반(과목 칸이 빔)은 RC·LC — 단과로 보지 않는다", () => {
    const vac: RosterSection[] = [sec(71, { track: "mwf", timeBlock: "10:00~12:10", bookSet: "A" }), sec(72, { track: "ttf", timeBlock: "10:00~12:10", bookSet: "A" })];
    const r = buildClassRoster({ sections: vac, includes: new Map(), enrollments: [{ studentId: "u120x5", sectionId: 71, mode: "onsite" }], people: PEOPLE, today: "2026-10-14" });
    expect(r.levels[0].columns[0]).toMatchObject({ title: "650A", sectionIds: [71, 72], students: [{ name: "다온", marks: ["월"] }] });
    expect(columnDetail(r.levels[0].columns[0])).toBe("RC·LC");
    const one = buildClassRoster({ sections: [vac[0]], includes: new Map(), enrollments: [{ studentId: "u120x5", sectionId: 71, mode: "onsite" }], people: PEOPLE, today: "2026-10-14" });
    expect(columnDetail(one.levels[0].columns[0])).toBe("월 RC·LC");
    expect(columnDetail({ tracks: [{ track: "mwf", subject: null, recorded: false }, { track: "ttf", subject: null, recorded: true }] })).toBe("RC·LC · 화 인강");
  });

  it("같은 학생이 같은 칸에 두 번 오지 않는다 (120분 반과 그 안의 60분 반을 함께 배정해도 · 두 트랙이 한 칸이어도)", () => {
    const r = build("2026-10-14", { enrollments: [...ENROLL, { studentId: "u120x5", sectionId: 5, mode: "onsite" }] });
    for (const col of r.levels.flatMap((l) => l.columns)) expect(col.students.filter((s) => s.id === "u120x5").length).toBeLessThanOrEqual(1);
  });

  it("품을 반이 아직 없는 속성반 학생은 칸을 못 찾은 학생으로 센다", () => {
    const r = build("2026-10-14", { includes: new Map([...INCLUDES].filter(([k]) => k !== 31 && k !== 32)) });
    expect(Object.values(view(r)).flat()).not.toContain("나리(불/프)");
    expect(r.unplaced).toBe(1);
  });

  it("칸 이름 · 표시 글자", () => {
    const col = build().levels[0].columns.find((c) => c.sectionIds.includes(8))!;
    expect(columnHeading(col)).toBe("650B 18:30~19:30");
    expect(marksText([])).toBe("");
    expect(marksText(["불", "RC"])).toBe("(불/RC)");
  });
});

describe("레벨별 명단 — 한 칸이 한 레벨의 한 트랙 · 시간을 합친다 (2026-10-14 밤 Alan \"시간대는 없애고 … 월수금/ 화목금만 분리\")", () => {
  const byTrack = (today = "2026-10-14", over: Partial<Parameters<typeof buildClassRoster>[0]> = {}) => build(today, { by: "track", ...over });

  it("레벨마다 월수금 · 화목금 두 칸 — 오전 · 저녁 · 60분 · 120분을 다 합치고, 주5일은 두 칸에, 속성반은 650 · 850 의 그 트랙 칸에 선다", () => {
    expect(view(byTrack())).toEqual({
      // 120분 주3일(가온)은 월수금만 — (월) 은 적지 않는다 (칸이 이미 월수금이다). 저녁 60분(사랑)도 같은 칸
      "650 월수금": ["가온(불)", "나리(불/프)", "다온", "라온", "마루(RC)", "사랑(LC)", "하늘(RC)"],
      // 저녁 화목금 인강(자람)도 화목금 칸
      "650 화목금": ["나리(불/프)", "다온", "라온", "자람(LC)"],
      "750 화목금": ["하늘(불/LC)"],
      "850 월수금": ["나리(불/프)", "바다(2주)"],
      "850 화목금": ["나리(불/프)", "바다(2주)"],
    });
  });

  it("칸 이름은 레벨 + 트랙이고 시간 · 둘째 줄이 없다 — 칸 순서는 레벨 → 월수금 · 화목금", () => {
    const r = byTrack();
    expect(r.by).toBe("track");
    expect(r.levels.map((l) => [l.label, l.count, l.columns.map((c) => [c.title, c.track, c.time, columnDetail(c)])])).toEqual([
      ["650", 8, [["650 월수금", "mwf", null, ""], ["650 화목금", "ttf", null, ""]]],
      ["750", 1, [["750 화목금", "ttf", null, ""]]],
      ["850", 2, [["850 월수금", "mwf", null, ""], ["850 화목금", "ttf", null, ""]]],
    ]);
    // 칸에 든 반 — 그 레벨 그 트랙의 시간 단위 반 전부 (묶음 · 속성반 · 2주완성 반은 칸이 아니다)
    expect(r.levels[0].columns.map((c) => c.sectionIds)).toEqual([[1, 5, 9], [2, 6, 8]]);
    expect(r.total).toBe(9);
    expect(r.unplaced).toBe(0);
    // 학생이 없는 칸 — 750 월수금
    expect(r.empty.map((c) => [columnHeading(c), c.sectionIds])).toEqual([["750 월수금", [11]]]);
  });

  it("불라방은 그 트랙으로 데려온 배정으로 — 월수금 현장 + 화목금 불라방이면 화목금 칸에만 (불)", () => {
    const mixed: RosterEnrollment[] = [
      { studentId: "u120x5", sectionId: 3, mode: "onsite" },
      { studentId: "u120x5", sectionId: 4, mode: "live" },
    ];
    expect(view(byTrack("2026-10-14", { enrollments: mixed }))).toEqual({ "650 월수금": ["다온"], "650 화목금": ["다온(불)"] });
    // 반별 명단은 같은 시간 칸에 두 트랙이 합쳐져 (불) 이 붙는다 — 그대로다
    expect(view(build("2026-10-14", { enrollments: mixed }))["650B 10:00~11:00"]).toEqual(["다온(불)"]);
  });

  it("단과는 그대로 (LC) · (RC) — 단과 두 장이면 두 트랙 칸 다, 한 사람은 한 칸에 한 번", () => {
    const r = byTrack("2026-10-14", {
      enrollments: [
        { studentId: "uRcOnly", sectionId: 1, mode: "onsite" },
        { studentId: "uRcOnly", sectionId: 6, mode: "onsite" },
        // 120분 묶음 + 그 안의 60분을 함께 배정해도 한 번
        { studentId: "u120x5", sectionId: 3, mode: "onsite" },
        { studentId: "u120x5", sectionId: 5, mode: "onsite" },
      ],
    });
    expect(view(r)).toEqual({ "650 월수금": ["다온", "마루(RC)"], "650 화목금": ["마루(RC)"] });
  });

  it("강사 · 관리자 · 조교 계정 · 종강한 배정은 빠진다 (반별 명단과 같은 규칙)", () => {
    const all = byTrack().levels.flatMap((l) => l.columns.flatMap((c) => c.students.map((s) => s.id)));
    expect(all).not.toContain("uTeacher");
    const after = view(byTrack("2026-10-18"));
    expect(after["850 월수금"]).toEqual(["나리(불/프)"]);
    expect(after["850 화목금"]).toEqual(["나리(불/프)"]);
  });

  it("범례 — 레벨별 명단은 (월) · (화) 를 쓰지 않는다, 반별 명단은 그대로", () => {
    expect(rosterMarks("track").map((m) => m.mark)).toEqual(["불", "프", "2주", "LC", "RC"]);
    expect(rosterMarks("time").map((m) => m.mark)).toEqual(["불", "프", "2주", "LC", "RC", "월", "화"]);
    expect(build().by).toBe("time");
  });

  it("방학달 통짜 반 · 시간이 빈 반도 그 레벨 그 트랙 칸에 — 반별 명단과 달리 반 하나가 칸 하나가 아니다", () => {
    const vac: RosterSection[] = [
      sec(71, { track: "mwf", timeBlock: "10:00~12:10", bookSet: "A" }),
      sec(72, { track: "ttf", timeBlock: "10:00~12:10", bookSet: "A" }),
      sec(73, { track: "mwf", timeBlock: null }),
    ];
    const r = buildClassRoster({
      sections: vac,
      includes: new Map(),
      enrollments: [
        { studentId: "u120x5", sectionId: 71, mode: "onsite" },
        { studentId: "u60x5", sectionId: 73, mode: "onsite" },
      ],
      people: PEOPLE,
      today: "2026-10-14",
      by: "track",
    });
    expect(r.levels[0].columns.map((c) => [c.title, c.sectionIds, c.students.map((s) => s.name + marksText(s.marks))])).toEqual([["650 월수금", [71, 73], ["다온", "라온"]]]);
    expect(r.empty.map((c) => c.title)).toEqual(["650 화목금"]);
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

  it("파일 이름은 달 — LC · RC 를 합친 한 장이라 과목이 없다. 한글 이름과 영문 이름을 함께 준다", () => {
    expect(rosterFileName({ year: 2026, month: 10 })).toBe("역전토익_반별명단_2026-10.pdf");
    expect(rosterDisposition({ year: 2026, month: 10 })).toBe(
      `attachment; filename="winnertoeic-class-roster_2026-10.pdf"; filename*=UTF-8''${encodeURIComponent("역전토익_반별명단_2026-10.pdf")}`,
    );
  });

  it("레벨별 명단은 이름이 다르다 — 두 파일을 받아도 섞이지 않게", () => {
    expect(rosterFileName({ year: 2026, month: 11 }, "track")).toBe("역전토익_레벨별명단_2026-11.pdf");
    expect(rosterFileName({ year: 2026, month: 11 }, "time")).toBe("역전토익_반별명단_2026-11.pdf");
    expect(rosterDisposition({ year: 2026, month: 11 }, "track")).toBe(
      `attachment; filename="winnertoeic-level-roster_2026-11.pdf"; filename*=UTF-8''${encodeURIComponent("역전토익_레벨별명단_2026-11.pdf")}`,
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
