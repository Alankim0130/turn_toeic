import { describe, expect, it } from "vitest";
import {
  buildMissingBoard,
  defaultPicks,
  expectedSlots,
  HOMEWORK_MISSING_TITLE,
  homeworkMissingMessage,
  MISSING_TITLE_MAX,
  missingRelated,
  missingStatus,
  missingStudentCount,
  rowOf,
  shortDay,
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
  const today = "2026-10-12"; // 10/7 · 10/9 는 지났고 10/12 는 오늘
  const people = new Map([
    ["kim", { name: "김가나", tester: false }],
    ["lee", { name: "이다라", tester: false }],
    ["park", { name: "박마바", tester: false }],
    ["late", { name: "최늦게", tester: false }],
    ["ssam", { name: "알런", tester: true }],
  ]);
  const enrollments: MissingEnrollment[] = [
    { studentId: "kim", sectionId: 10, from: "2026-10-01" },
    { studentId: "lee", sectionId: 10, from: "2026-10-01" },
    { studentId: "late", sectionId: 10, from: "2026-10-08" },
    { studentId: "ssam", sectionId: 10, from: "2026-10-01" },
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
  const board = buildMissingBoard({
    level: 650,
    today,
    sections: SECTIONS,
    includes: INCLUDES,
    enrollments,
    submissions,
    people,
    // 반 정렬 키 — 시간 단위 반 → 묶음 순으로 보이게 (화면은 과정 · 레벨 · 시간 · 트랙으로 준다)
    sortKeyOf: (id) => [id],
  });

  it("직접 배정된 반이 같은 학생끼리 한 카드 — 주5일 60분(1 + 3)과 120분 묶음(10)", () => {
    expect(board.map((g) => g.key)).toEqual(["1,3", "10"]);
  });

  it("열 — 반의 수업일 순서대로 1회 · 2회 …, 트랙과 그 날 과목을 단다", () => {
    const week5 = board[0];
    expect(week5.columns.map((c) => [c.seq, c.date, c.track, c.subjects.join("")])).toEqual([
      [1, "2026-10-06", "ttf", "lc"],
      [2, "2026-10-07", "mwf", "rc"],
      [3, "2026-10-08", "ttf", "lc"],
      [4, "2026-10-09", "mwf", "rc"],
      [5, "2026-10-12", "mwf", "rc"],
      [6, "2026-10-13", "ttf", "lc"],
      [7, "2026-10-14", "mwf", "rc"],
      [8, "2026-10-15", "ttf", "lc"],
    ]);
    expect(board[1].columns.map((c) => c.subjects)).toEqual(MWF.map(() => ["rc", "lc"]));
  });

  it("칸 — 냄 · 지난 수업인데 안 냄 · 오늘과 앞으로는 아직 · 들어오기 전은 해당 없음", () => {
    const g = board[1];
    const kim = g.rows.find((r) => r.id === "kim")!;
    expect(kim.cells).toEqual([
      ["done", "done"],
      ["done", "missing"],
      ["upcoming", "upcoming"], // 오늘 (10/12) 은 아직 낼 때가 아니다
      ["upcoming", "upcoming"],
    ]);
    expect(kim).toMatchObject({ past: 4, done: 3, rate: 75, missing: [{ date: "2026-10-09", subject: "lc" }] });

    const late = g.rows.find((r) => r.id === "late")!;
    expect(late.cells[0]).toEqual(["done", "none"]); // 10/7 — 들어오기 전 (그래도 낸 것은 보인다)
    expect(late.cells[1]).toEqual(["missing", "missing"]);
    expect(late).toMatchObject({ past: 2, done: 0, rate: 0 });

    const lee = g.rows.find((r) => r.id === "lee")!;
    expect(lee).toMatchObject({ past: 4, done: 4, rate: 100, missing: [] });
    expect(lee.cells[2]).toEqual(["done", "upcoming"]); // 오늘 낸 것은 냄
  });

  it("줄 순서 — 안 낸 숙제가 많은 학생 → 이름, 테스터는 맨 아래", () => {
    expect(board[1].rows.map((r) => r.id)).toEqual(["late", "kim", "lee", "ssam"]);
  });

  it("주5일 60분 학생 — 월수금 날은 RC 칸만, 화목금 날은 LC 칸만", () => {
    const park = board[0].rows[0];
    expect(park.cells.map((c) => c.length)).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
    expect(park.missing.map((m) => `${m.date} ${m.subject}`)).toEqual(["2026-10-06 lc", "2026-10-07 rc", "2026-10-08 lc", "2026-10-09 rc"]);
    expect(park.rate).toBe(0);
  });

  it("탭 숫자 · 전체선택 — 안 낸 숙제가 있는 학생만, 테스터와 오늘 이미 알림을 받은 학생은 빼고", () => {
    expect(missingStudentCount(board)).toBe(3); // late · kim · park (ssam 은 테스터, lee 는 다 냄)
    expect(defaultPicks(board).sort()).toEqual(["kim", "late", "park"]);
    expect(defaultPicks(board, new Set(["kim"])).sort()).toEqual(["late", "park"]);
    expect(rowOf(board, "park")?.name).toBe("박마바");
    expect(rowOf(board, "nobody")).toBeNull();
  });

  it("레벨이 다르면 그 레벨에 숙제가 있는 학생만 — 속성반 학생은 650 · 850 탭에 다 선다", () => {
    const e: MissingEnrollment[] = [
      { studentId: "sp", sectionId: 11, from: "2026-10-01" },
      { studentId: "kim", sectionId: 10, from: "2026-10-01" },
    ];
    const at = (level: number) =>
      buildMissingBoard({ level, today, sections: SECTIONS, includes: INCLUDES, enrollments: e, submissions: [], people }).flatMap((g) => g.rows.map((r) => r.id));
    expect(at(650).sort()).toEqual(["kim", "sp"]);
    expect(at(850)).toEqual(["sp"]);
    expect(at(750)).toEqual([]);
  });

  it("지난 수업이 없으면 제출률은 비운다 (0% 로 적지 않는다)", () => {
    const early = buildMissingBoard({
      level: 650,
      today: "2026-10-01",
      sections: SECTIONS,
      includes: INCLUDES,
      enrollments: [{ studentId: "kim", sectionId: 1, from: "2026-10-01" }],
      submissions: [],
      people,
    });
    expect(early[0].rows[0]).toMatchObject({ past: 0, rate: null, missing: [] });
    expect(missingStudentCount(early)).toBe(0);
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
        "김가나 학생, 아직 올리지 않은 숙제가 있어요.",
        "",
        "· 650 · RC — 10/7(수), 10/12(월)",
        "· 650 · LC — 10/9(금)",
        "",
        "숙제제출에서 그 수업 날짜를 눌러 올려 주세요. 지금까지 숙제 12개 중 9개를 냈어요.",
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
