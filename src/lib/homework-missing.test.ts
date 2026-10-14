import { describe, expect, it } from "vitest";
import {
  buildMissingBoard,
  defaultPicks,
  dueAt,
  dueLabel,
  expectedSlots,
  HOMEWORK_DUE_LABEL,
  HOMEWORK_MISSING_TITLE,
  homeworkMissingMessage,
  isOverdue,
  MISSING_TITLE_MAX,
  missingRelated,
  missingStatus,
  missingStudentCount,
  newMissingOf,
  onlyAlerted,
  rowOf,
  shortDay,
  unalertedCount,
  type MissingEnrollment,
  type MissingSection,
  type MissingSubmission,
} from "./homework-missing";

/*
 * 2026년 10월 기수 (개강 10/6 화 · 종강 10/31) 를 줄인 달력:
 *   월수금 10/7(수) · 10/9(금) · 10/12(월) · 10/14(수)
 *   화목금 10/6(화) · 10/8(목) · 10/13(화) · 10/15(목)
 * 편성은 10월 650 과 같은 꼴 — 10:00 월수금 RC · 화목금 LC (B과정), 11:10 은 과목이 반대.
 */
const MWF = ["2026-10-07", "2026-10-09", "2026-10-12", "2026-10-14"];
const TTF = ["2026-10-06", "2026-10-08", "2026-10-13", "2026-10-15"];
const OPENS = "2026-10-06";
const CLOSES = "2026-10-31";

const sec = (id: number, track: "mwf" | "ttf", level: number, subject: string | null, dates = track === "mwf" ? MWF : TTF): MissingSection => ({
  id,
  track,
  level,
  subject,
  opens: OPENS,
  closes: CLOSES,
  dates,
});

// 시간 단위 반 (60 · 70분)
const S650_10_MWF = sec(1, "mwf", 650, "rc");
const S650_11_MWF = sec(2, "mwf", 650, "lc");
const S650_10_TTF = sec(3, "ttf", 650, "lc");
const S650_11_TTF = sec(4, "ttf", 650, "rc");
const S850_1230_MWF = sec(5, "mwf", 850, "lc");
const S850_1350_MWF = sec(6, "mwf", 850, "rc");
// 그릇 반 — 120분 묶음 · 속성반 · 2주완성 (과목 칸이 없다)
const S650_120_MWF = sec(10, "mwf", 650, null);
const SPARTA650_MWF = sec(11, "mwf", 650, null);
const TWOWEEK850_MWF = sec(12, "mwf", 850, null, MWF.slice(0, 2)); // 앞 절반만
// 방학달 통짜 반 — 품은 반이 없고 과목도 없다
const VAC750 = sec(20, "mwf", 750, null);

const SECTIONS = new Map(
  [S650_10_MWF, S650_11_MWF, S650_10_TTF, S650_11_TTF, S850_1230_MWF, S850_1350_MWF, S650_120_MWF, SPARTA650_MWF, TWOWEEK850_MWF, VAC750].map((s) => [s.id, s]),
);
// DB term_section_includes 가 주는 것과 같은 꼴
const INCLUDES = new Map<number, number[]>([
  [10, [1, 2]],
  [11, [1, 2, 5]],
  [12, [5, 6]],
]);

const asObj = (m: Map<string, Set<string>>) => Object.fromEntries([...m].sort().map(([d, s]) => [d, [...s].sort()]));

/**
 * 수업일 → 숙제 기한 날짜 = 같은 트랙의 다음 수업일 (DB `homework_due_dates` 가 반 편성 달력에서 주는 것과 같은 꼴).
 * 트랙의 마지막 수업일은 `after` 가 있으면 그 날(다음 달 첫 같은 트랙 수업일), 없으면 모른다(null).
 */
const nextOf = (dates: readonly string[], after: string | null = null): [string, string | null][] =>
  dates.map((d, i) => [d, dates[i + 1] ?? after]);
const DUE = new Map([...nextOf(MWF), ...nextOf(TTF)]);
/** KST 시각 → ms */
const at = (kst: string) => Date.parse(`${kst}:00+09:00`);

describe("낼 숙제 칸 — 반이 정한다 (날짜 · 레벨 · 과목)", () => {
  it("주3일 60분 단과 — 그 트랙 수업일마다 그 시간의 과목 하나", () => {
    const got = expectedSlots([{ sectionId: 1, from: "2026-10-01" }], 650, INCLUDES, SECTIONS);
    expect(asObj(got)).toEqual(Object.fromEntries(MWF.map((d) => [d, ["rc"]])));
  });

  it("주5일 60분 — 월수금은 RC, 화목금은 LC (같은 10:00 이라도 트랙마다 과목이 다르다)", () => {
    const got = expectedSlots(
      [
        { sectionId: 1, from: "2026-10-01" },
        { sectionId: 3, from: "2026-10-01" },
      ],
      650,
      INCLUDES,
      SECTIONS,
    );
    expect(asObj(got)).toEqual({ ...Object.fromEntries(MWF.map((d) => [d, ["rc"]])), ...Object.fromEntries(TTF.map((d) => [d, ["lc"]])) });
  });

  it("120분 묶음 — 품은 두 시간 단위 반의 과목이 다 (RC · LC)", () => {
    const got = expectedSlots([{ sectionId: 10, from: "2026-10-01" }], 650, INCLUDES, SECTIONS);
    expect(asObj(got)).toEqual(Object.fromEntries(MWF.map((d) => [d, ["lc", "rc"]])));
  });

  it("속성반 — 레벨마다 따로: 650 은 RC · LC, 850 은 함께 듣는 12:30 시간의 과목", () => {
    const e = [{ sectionId: 11, from: "2026-10-01" }];
    expect(asObj(expectedSlots(e, 650, INCLUDES, SECTIONS))).toEqual(Object.fromEntries(MWF.map((d) => [d, ["lc", "rc"]])));
    expect(asObj(expectedSlots(e, 850, INCLUDES, SECTIONS))).toEqual(Object.fromEntries(MWF.map((d) => [d, ["lc"]])));
    expect(expectedSlots(e, 750, INCLUDES, SECTIONS).size).toBe(0);
  });

  it("2주완성 — 품은 850 반은 한 달 내내지만 2주완성 반의 회차(앞 절반)만 센다", () => {
    const got = expectedSlots([{ sectionId: 12, from: "2026-10-01" }], 850, INCLUDES, SECTIONS);
    expect(asObj(got)).toEqual(Object.fromEntries(MWF.slice(0, 2).map((d) => [d, ["lc", "rc"]])));
  });

  it("과목 칸이 빈 반(방학달 통짜 반)은 두 과목", () => {
    const got = expectedSlots([{ sectionId: 20, from: "2026-10-01" }], 750, INCLUDES, SECTIONS);
    expect(asObj(got)).toEqual(Object.fromEntries(MWF.map((d) => [d, ["lc", "rc"]])));
  });

  it("배정일부터 센다 — 개강 뒤에 들어온 학생에게 그 전 수업 숙제는 묻지 않는다", () => {
    const got = expectedSlots([{ sectionId: 1, from: "2026-10-10" }], 650, INCLUDES, SECTIONS);
    expect([...got.keys()].sort()).toEqual(["2026-10-12", "2026-10-14"]);
  });

  it("개강일 전 · 종강일 뒤의 회차는 세지 않는다 (달력은 앞뒤 달을 찍을 수 있다)", () => {
    const odd = new Map(SECTIONS).set(30, { ...sec(30, "mwf", 650, "rc"), dates: ["2026-10-02", "2026-10-07", "2026-11-02"] });
    expect([...expectedSlots([{ sectionId: 30, from: "2026-09-20" }], 650, INCLUDES, odd).keys()]).toEqual(["2026-10-07"]);
  });
});

describe("격자 — 반마다 한 카드, 수업일 열 × RC · LC", () => {
  // 10/12(월) 오후 6시 — 월수금 10/7(기한 10/9) · 10/9(기한 10/12 5시)는 기한이 지났고, 화목금 10/6(기한 10/8)만 지났다 (10/8 은 10/13 5시까지)
  const now = at("2026-10-12T18:00");
  const people = new Map([
    ["kim", { name: "김가나", staff: false }],
    ["lee", { name: "이다라", staff: false }],
    ["park", { name: "박마바", staff: false }],
    ["late", { name: "최늦게", staff: false }],
    // 강사 · 관리자 · 조교 계정 — 학생 화면을 보려고 반에 넣어 둔 테스트 배정
    ["ssam", { name: "알런", staff: true }],
    ["jogyo", { name: "조교", staff: true }],
  ]);
  const enrollments: MissingEnrollment[] = [
    { studentId: "kim", sectionId: 10, from: "2026-10-01" },
    { studentId: "lee", sectionId: 10, from: "2026-10-01" },
    { studentId: "late", sectionId: 10, from: "2026-10-08" },
    { studentId: "ssam", sectionId: 10, from: "2026-10-01" },
    { studentId: "jogyo", sectionId: 2, from: "2026-10-01" }, // 이 반에는 조교 계정만 있다
    { studentId: "park", sectionId: 1, from: "2026-10-01" },
    { studentId: "park", sectionId: 3, from: "2026-10-01" },
  ];
  const submissions: MissingSubmission[] = [
    // 김가나 — 10/7 둘 다, 10/9 RC 만
    { userId: "kim", date: "2026-10-07", level: 650, subject: "rc" },
    { userId: "kim", date: "2026-10-07", level: 650, subject: "lc" },
    { userId: "kim", date: "2026-10-09", level: 650, subject: "rc" },
    // 이다라 — 다 냈고 오늘 것도 냈다
    { userId: "lee", date: "2026-10-07", level: 650, subject: "rc" },
    { userId: "lee", date: "2026-10-07", level: 650, subject: "lc" },
    { userId: "lee", date: "2026-10-09", level: 650, subject: "rc" },
    { userId: "lee", date: "2026-10-09", level: 650, subject: "lc" },
    { userId: "lee", date: "2026-10-12", level: 650, subject: "rc" },
    // 최늦게 — 들어오기 전 날짜에 낸 것 (해당 없음 칸이라도 '냄' 으로 보인다)
    { userId: "late", date: "2026-10-07", level: 650, subject: "rc" },
    // 다른 레벨로 낸 것은 이 레벨 격자에 안 보인다
    { userId: "kim", date: "2026-10-09", level: 750, subject: "lc" },
  ];
  // 알림 신청 — 학생 넷 모두 (신청하지 않은 학생은 아래 "알림 신청" 에서 따로 본다)
  const alerts = new Set(["kim", "lee", "park", "late"]);
  const board = buildMissingBoard({
    level: 650,
    now,
    due: DUE,
    sections: SECTIONS,
    includes: INCLUDES,
    enrollments,
    submissions,
    people,
    alerts,
    // 반 정렬 키 — 시간 단위 반 → 묶음 순으로 보이게 (화면은 과정 · 레벨 · 시간 · 트랙으로 준다)
    sortKeyOf: (id) => [id],
  });

  it("직접 배정된 반이 같은 학생끼리 한 카드 — 주5일 60분(1 + 3)과 120분 묶음(10)", () => {
    expect(board.map((g) => g.key)).toEqual(["1,3", "10"]);
  });

  it("열 — 반의 수업일 순서대로 1회 · 2회 …, 트랙 · 그 날 과목 · 기한(같은 트랙 다음 수업일)을 단다", () => {
    const week5 = board[0];
    expect(week5.columns.map((c) => [c.seq, c.date, c.track, c.subjects.join(""), c.due, c.overdue])).toEqual([
      [1, "2026-10-06", "ttf", "lc", "2026-10-08", true],
      [2, "2026-10-07", "mwf", "rc", "2026-10-09", true],
      [3, "2026-10-08", "ttf", "lc", "2026-10-13", false], // 목요일 숙제는 다음 화요일 5시까지
      [4, "2026-10-09", "mwf", "rc", "2026-10-12", true], // 금요일 숙제는 다음 월요일 5시까지 — 6시라 지났다
      [5, "2026-10-12", "mwf", "rc", "2026-10-14", false],
      [6, "2026-10-13", "ttf", "lc", "2026-10-15", false],
      [7, "2026-10-14", "mwf", "rc", null, false], // 다음 수업일이 달력에 없으면 기한을 모른다
      [8, "2026-10-15", "ttf", "lc", null, false],
    ]);
    expect(board[1].columns.map((c) => c.subjects)).toEqual(MWF.map(() => ["rc", "lc"]));
  });

  it("칸 — 냄 · 기한이 지났는데 안 냄 · 기한 전은 아직 · 들어오기 전은 해당 없음", () => {
    const g = board[1];
    const kim = g.rows.find((r) => r.id === "kim")!;
    expect(kim.cells).toEqual([
      ["done", "done"],
      ["done", "missing"],
      ["upcoming", "upcoming"], // 오늘 (10/12) 수업 숙제는 수요일 5시까지다
      ["upcoming", "upcoming"],
    ]);
    expect(kim).toMatchObject({ past: 4, done: 3, rate: 75, alerts: true, missing: [{ date: "2026-10-09", subject: "lc", due: "2026-10-12" }] });

    const late = g.rows.find((r) => r.id === "late")!;
    expect(late.cells[0]).toEqual(["done", "none"]); // 10/7 — 들어오기 전 (그래도 낸 것은 보인다)
    expect(late.cells[1]).toEqual(["missing", "missing"]);
    expect(late).toMatchObject({ past: 2, done: 0, rate: 0 });

    const lee = g.rows.find((r) => r.id === "lee")!;
    expect(lee).toMatchObject({ past: 4, done: 4, rate: 100, missing: [] });
    expect(lee.cells[2]).toEqual(["done", "upcoming"]); // 오늘 낸 것은 냄
  });

  it("줄 순서 — 안 낸 숙제가 많은 학생 → 이름", () => {
    expect(board[1].rows.map((r) => r.id)).toEqual(["late", "kim", "lee"]);
  });

  it("강사 · 관리자 · 조교 계정은 반에 배정돼 있어도 명단에 없다 — 그 계정만 있는 반은 카드도 없다 (2026-10-08 Alan \"이건 빼줘\")", () => {
    const ids = board.flatMap((g) => g.rows.map((r) => r.id));
    expect(ids).not.toContain("ssam");
    expect(ids).not.toContain("jogyo");
    expect(board.map((g) => g.key)).not.toContain("2");
    // 보내기도 같은 격자로 다시 세므로 고른 목록에 끼어 와도 받지 않는다 (actions.ts 의 rowOf)
    expect(rowOf(board, "ssam")).toBeNull();
    expect(rowOf(board, "jogyo")).toBeNull();
    // 학생과 같은 반이어도 학생 수에 세지 않는다
    expect(board[1].rows).toHaveLength(3);
  });

  it("주5일 60분 학생 — 월수금 날은 RC 칸만, 화목금 날은 LC 칸만 · 기한도 트랙마다 따로", () => {
    const park = board[0].rows[0];
    expect(park.cells.map((c) => c.length)).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
    // 10/8(목) 화목금 숙제는 다음 화목금 수업 10/13(화) 5시까지라 아직이다 — 월수금 10/12 가 끼어 있어도 상관없다
    expect(park.missing.map((m) => `${m.date} ${m.subject}`)).toEqual(["2026-10-06 lc", "2026-10-07 rc", "2026-10-09 rc"]);
    expect(park.cells[2]).toEqual(["upcoming"]);
    expect(park).toMatchObject({ past: 3, done: 0, rate: 0 });
  });

  it("탭 숫자 · 전체선택 — 기한 지난 숙제를 안 낸 학생, 마지막 알림 뒤에 새로 기한이 지난 것이 없는 학생은 빼고", () => {
    expect(missingStudentCount(board)).toBe(3); // late · kim · park (lee 는 다 냄, 강사 · 조교 계정은 명단에 없다)
    expect(defaultPicks(board).sort()).toEqual(["kim", "late", "park"]);
    // 김가나는 10/12 6시 반에 알림을 받았다 — 안 낸 10/9 LC 의 기한(10/12 5시)이 그보다 앞이라 이미 알린 숙제다
    expect(defaultPicks(board, new Map([["kim", at("2026-10-12T18:30")]])).sort()).toEqual(["late", "park"]);
    // 기한보다 앞서 받은 알림은 이 숙제를 몰랐다 — 다시 골라진다
    expect(defaultPicks(board, new Map([["kim", at("2026-10-12T16:00")]])).sort()).toEqual(["kim", "late", "park"]);
    expect(rowOf(board, "park")?.name).toBe("박마바");
    expect(rowOf(board, "nobody")).toBeNull();
  });

  it("레벨이 다르면 그 레벨에 숙제가 있는 학생만 — 속성반 학생은 650 · 850 탭에 다 선다", () => {
    const e: MissingEnrollment[] = [
      { studentId: "sp", sectionId: 11, from: "2026-10-01" },
      { studentId: "kim", sectionId: 10, from: "2026-10-01" },
    ];
    const ids = (level: number) =>
      buildMissingBoard({ level, now, due: DUE, sections: SECTIONS, includes: INCLUDES, enrollments: e, submissions: [], people, alerts }).flatMap((g) =>
        g.rows.map((r) => r.id),
      );
    expect(ids(650).sort()).toEqual(["kim", "sp"]);
    expect(ids(850)).toEqual(["sp"]);
    expect(ids(750)).toEqual([]);
  });

  it("기한이 지난 숙제가 없으면 제출률은 비운다 (0% 로 적지 않는다)", () => {
    const early = buildMissingBoard({
      level: 650,
      now: at("2026-10-08T10:00"), // 10/7(수) 수업은 끝났지만 숙제는 10/9(금) 5시까지다
      due: DUE,
      sections: SECTIONS,
      includes: INCLUDES,
      enrollments: [{ studentId: "kim", sectionId: 1, from: "2026-10-01" }],
      submissions: [],
      people,
      alerts,
    });
    expect(early[0].rows[0]).toMatchObject({ past: 0, rate: null, missing: [] });
    expect(early[0].rows[0].cells[0]).toEqual(["upcoming"]);
    expect(missingStudentCount(early)).toBe(0);
  });
});

describe("제출 기한 — 같은 트랙의 다음 수업일 오후 5시 (2026-10-14 Alan)", () => {
  const people = new Map([
    ["mwf", { name: "월수금", staff: false }],
    ["ttf", { name: "화목금", staff: false }],
    ["w5", { name: "주오일", staff: false }],
  ]);
  const enrollments: MissingEnrollment[] = [
    { studentId: "mwf", sectionId: 1, from: "2026-10-01" }, // 650 10:00 월수금 RC (단과)
    { studentId: "ttf", sectionId: 3, from: "2026-10-01" }, // 650 10:00 화목금 LC (단과)
    { studentId: "w5", sectionId: 1, from: "2026-10-01" }, // 주5일 60분 — 월수금 RC + 화목금 LC
    { studentId: "w5", sectionId: 3, from: "2026-10-01" },
  ];
  // 지난 숙제는 다 냈고 10/12(월) · 10/13(화) 숙제만 안 냈다
  const submissions: MissingSubmission[] = [
    ...["mwf", "w5"].flatMap((u) => ["2026-10-07", "2026-10-09"].map((date) => ({ userId: u, date, level: 650, subject: "rc" }))),
    ...["ttf", "w5"].flatMap((u) => ["2026-10-06", "2026-10-08"].map((date) => ({ userId: u, date, level: 650, subject: "lc" }))),
  ];
  const alerts = new Set(["mwf", "ttf", "w5"]);
  const boardAt = (kst: string) =>
    buildMissingBoard({ level: 650, now: at(kst), due: DUE, sections: SECTIONS, includes: INCLUDES, enrollments, submissions, people, alerts });
  const missingOf = (kst: string, id: string) => (rowOf(boardAt(kst), id)?.missing ?? []).map((m) => `${m.date} ${m.subject}`);

  it("기한 시각 — 그 날 오후 5시(KST), 5시를 넘기면 지난 것 · 기한을 모르면 지나지 않은 것", () => {
    expect(dueAt("2026-10-14")).toBe(Date.parse("2026-10-14T08:00:00Z"));
    expect(isOverdue("2026-10-14", at("2026-10-14T16:59"))).toBe(false);
    expect(isOverdue("2026-10-14", dueAt("2026-10-14"))).toBe(false); // 정각 5시까지는 낸 것으로 친다
    expect(isOverdue("2026-10-14", dueAt("2026-10-14") + 1000)).toBe(true);
    expect(isOverdue("2026-10-14", at("2026-10-14T22:00"))).toBe(true);
    expect(isOverdue(null, at("2027-01-01T00:00"))).toBe(false);
    expect(isOverdue("10월 14일", at("2027-01-01T00:00"))).toBe(false);
    expect(dueLabel("2026-10-14")).toBe("10/14(수) 오후 5시");
    expect(HOMEWORK_DUE_LABEL).toBe("오후 5시");
  });

  it("Alan 의 예 1 — 수요일 오후 10시: 월요일 숙제(기한 수요일 5시)가 미제출이다. 4시 59분에는 아직", () => {
    expect(missingOf("2026-10-14T22:00", "mwf")).toEqual(["2026-10-12 rc"]);
    expect(missingOf("2026-10-14T16:59", "mwf")).toEqual([]);
    // 화목금 학생의 화요일 숙제는 목요일 5시까지라 수요일 밤에는 아직이다
    expect(missingOf("2026-10-14T22:00", "ttf")).toEqual([]);
  });

  it("Alan 의 예 2 — 목요일 오후 6시: 화요일 숙제(기한 목요일 5시)가 미제출이다", () => {
    expect(missingOf("2026-10-15T18:00", "ttf")).toEqual(["2026-10-13 lc"]);
    expect(missingOf("2026-10-15T16:00", "ttf")).toEqual([]);
  });

  it("주5일은 월수금 숙제 · 화목금 숙제가 각자 제 트랙의 기한을 따른다", () => {
    expect(missingOf("2026-10-14T22:00", "w5")).toEqual(["2026-10-12 rc"]);
    expect(missingOf("2026-10-15T18:00", "w5")).toEqual(["2026-10-12 rc", "2026-10-13 lc"]);
  });

  it("그 달 마지막 수업의 숙제 — 다음 수업일이 달력에 없으면 기한을 몰라 미제출로 세지 않고, 다음 달 달력이 생기면 그 첫 같은 트랙 수업일이 기한이다", () => {
    const late = (due: ReadonlyMap<string, string | null>, kst: string) =>
      buildMissingBoard({
        level: 650,
        now: at(kst),
        due,
        sections: SECTIONS,
        includes: INCLUDES,
        enrollments: [{ studentId: "mwf", sectionId: 1, from: "2026-10-01" }],
        submissions: submissions.filter((x) => x.userId === "mwf"),
        people,
        alerts,
      })[0].rows[0];
    // 10/14(수)가 이 달력의 마지막 월수금 수업일이다
    expect(late(DUE, "2026-12-31T23:00").missing.map((m) => m.date)).toEqual(["2026-10-12"]);
    const nextMonth = new Map([...nextOf(MWF, "2026-11-04"), ...nextOf(TTF, "2026-11-05")]);
    expect(late(nextMonth, "2026-11-04T16:00").missing.map((m) => m.date)).toEqual(["2026-10-12"]);
    expect(late(nextMonth, "2026-11-04T18:00").missing.map((m) => m.date)).toEqual(["2026-10-12", "2026-10-14"]);
  });

  it("전체선택 — 마지막 알림 뒤에 새로 기한이 지난 숙제가 있는 학생만 (수요일 밤 알림 → 목요일 저녁에는 화요일 숙제를 안 낸 학생)", () => {
    // 수요일 밤 10시: 월요일 숙제를 안 낸 월수금 · 주5일 학생
    const wed = boardAt("2026-10-14T22:00");
    expect(defaultPicks(wed).sort()).toEqual(["mwf", "w5"]);
    // 그때 두 학생에게 알림을 보냈다 → 목요일 저녁 6시
    const sent = new Map([
      ["mwf", at("2026-10-14T22:05")],
      ["w5", at("2026-10-14T22:05")],
    ]);
    const thu = boardAt("2026-10-15T18:00");
    // 월수금 학생은 월요일 숙제를 아직 안 냈지만 이미 알렸다 — 새로 기한이 지난 것은 화요일 숙제뿐이다
    expect(defaultPicks(thu, sent).sort()).toEqual(["ttf", "w5"]);
    expect(newMissingOf(rowOf(thu, "w5")!, sent.get("w5")).map((m) => m.date)).toEqual(["2026-10-13"]);
    expect(newMissingOf(rowOf(thu, "mwf")!, sent.get("mwf"))).toEqual([]);
    expect(newMissingOf(rowOf(thu, "ttf")!, undefined).map((m) => m.date)).toEqual(["2026-10-13"]);
    // 알림 글은 아직 안 낸 것을 다 적는다 — 주5일 학생에게는 월요일 숙제도 다시 적힌다
    const w5 = rowOf(thu, "w5")!;
    expect(homeworkMissingMessage({ name: "주오일", level: 650, missing: w5.missing, past: w5.past, done: w5.done })).toContain("10/12(월)");
  });
});

describe("알림 신청 — 신청한 학생만 명단 · 전체선택 · 보내기 (2026-10-14 Alan)", () => {
  const people = new Map([
    ["yes", { name: "가신청", staff: false }],
    ["no", { name: "나안함", staff: false }],
    ["no2", { name: "다안함", staff: false }],
  ]);
  const enrollments: MissingEnrollment[] = [
    { studentId: "yes", sectionId: 10, from: "2026-10-01" },
    { studentId: "no", sectionId: 10, from: "2026-10-01" },
    { studentId: "no2", sectionId: 1, from: "2026-10-01" }, // 이 반에는 신청 안 한 학생뿐이다
  ];
  const board = buildMissingBoard({
    level: 650,
    now: at("2026-10-12T18:00"),
    due: DUE,
    sections: SECTIONS,
    includes: INCLUDES,
    enrollments,
    submissions: [],
    people,
    alerts: new Set(["yes"]),
    sortKeyOf: (id) => [id],
  });

  it("줄은 다 만들고 신청 여부를 단다 — 신청한 학생이 먼저 선다", () => {
    const g = board.find((x) => x.key === "10")!;
    expect(g.rows.map((r) => [r.id, r.alerts])).toEqual([
      ["yes", true],
      ["no", false],
    ]);
    expect(unalertedCount(board)).toBe(2);
  });

  it("화면은 신청한 학생만 — 신청한 학생이 없는 반은 카드도 없다", () => {
    const shown = onlyAlerted(board);
    expect(shown.map((g) => g.key)).toEqual(["10"]);
    expect(shown[0].rows.map((r) => r.id)).toEqual(["yes"]);
    expect(unalertedCount(shown)).toBe(0);
  });

  it("탭 숫자 · 전체선택은 신청한 학생만 센다 — 안 낸 숙제가 있어도 신청 안 한 학생은 고르지 않는다", () => {
    expect(rowOf(board, "no")!.missing.length).toBeGreaterThan(0);
    expect(missingStudentCount(board)).toBe(1);
    expect(defaultPicks(board)).toEqual(["yes"]);
  });
});

describe("제출률 단계 — 첫토익과 같은 문턱", () => {
  it.each([
    [100, "perfect"],
    [99, "good"],
    [70, "good"],
    [69, "warn"],
    [40, "warn"],
    [39, "risk"],
    [0, "risk"],
    [null, "none"],
  ] as const)("%s%% → %s", (rate, status) => {
    expect(missingStatus(rate)).toBe(status);
  });
});

describe("알림 글", () => {
  it("짧은 날짜 — 10/9(금)", () => {
    expect(shortDay("2026-10-09")).toBe("10/9(금)");
    expect(shortDay("2026-10-12")).toBe("10/12(월)");
  });

  it("이름 · 레벨 · 과목별 날짜 · 지금까지 낸 수 — RC 먼저", () => {
    const body = homeworkMissingMessage({
      name: "김가나",
      level: 650,
      missing: [
        { date: "2026-10-09", subject: "lc" },
        { date: "2026-10-07", subject: "rc" },
        { date: "2026-10-12", subject: "rc" },
      ],
      past: 12,
      done: 9,
    });
    expect(body).toBe(
      [
        "김가나 학생, 제출 기한이 지났는데 아직 올리지 않은 숙제가 있어요.",
        "",
        "· 650 · RC — 10/7(수), 10/12(월)",
        "· 650 · LC — 10/9(금)",
        "",
        "숙제제출에서 그 수업 날짜를 눌러 올려 주세요. 숙제는 다음 수업일 오후 5시까지 내요. 기한이 지난 숙제 12개 중 9개를 냈어요.",
      ].join("\n"),
    );
  });

  it("날짜가 많아도 알림함 한도(1,000자) 안이다", () => {
    const days = Array.from({ length: 40 }, (_, i) => `2026-10-${String((i % 28) + 1).padStart(2, "0")}`);
    const body = homeworkMissingMessage({
      name: "가".repeat(40),
      level: 850,
      missing: [...days.map((date) => ({ date, subject: "rc" as const })), ...days.map((date) => ({ date: date.replace("-10-", "-11-"), subject: "lc" as const }))],
      past: 80,
      done: 0,
    });
    expect(body.length).toBeLessThanOrEqual(1000);
    expect(body).toContain("외 ");
  });

  it("기본 제목은 알림함 제목 한도 안이다", () => {
    expect(HOMEWORK_MISSING_TITLE.length).toBeLessThanOrEqual(MISSING_TITLE_MAX);
    expect(MISSING_TITLE_MAX).toBe(80);
  });

  it("알림 표시 — 기수 · 레벨 · 안 낸 과목(RC 먼저) · 개수 (조교가 보내면 트리거가 이 과목의 선생님 이름을 단다)", () => {
    expect(
      missingRelated(7, 650, [
        { date: "2026-10-09", subject: "lc" },
        { date: "2026-10-07", subject: "rc" },
      ]),
    ).toEqual({ termId: 7, level: 650, subjects: ["rc", "lc"], missing: 2 });
    expect(missingRelated(7, 650, [{ date: "2026-10-09", subject: "lc" }]).subjects).toEqual(["lc"]);
  });
});
