import { describe, expect, it } from "vitest";
import { buildMissingBoard, type MissingEnrollment, type MissingSubmission } from "./homework-missing";
import { homeworkTermRates, type RateSection } from "./homework-rate";

/*
 * homework-missing.test.ts 와 같은 줄인 달력 — 2026년 10월 기수 (개강 10/6 화 · 종강 10/31):
 *   월수금 10/7(수) · 10/9(금) · 10/12(월) · 10/14(수)
 *   화목금 10/6(화) · 10/8(목) · 10/13(화) · 10/15(목)
 * 11월 기수(개강 11/4)는 월수금 11/4 · 11/6 두 날만.
 */
const MWF = ["2026-10-07", "2026-10-09", "2026-10-12", "2026-10-14"];
const TTF = ["2026-10-06", "2026-10-08", "2026-10-13", "2026-10-15"];
const NOV_MWF = ["2026-11-04", "2026-11-06"];

const sec = (id: number, track: "mwf" | "ttf", level: number, subject: string | null, dates = track === "mwf" ? MWF : TTF, termId = 10): RateSection => ({
  id,
  termId,
  track,
  level,
  subject,
  opens: termId === 10 ? "2026-10-06" : "2026-11-04",
  closes: termId === 10 ? "2026-10-31" : "2026-11-30",
  dates,
});

// 10월 — 시간 단위 반
const S650_10_MWF = sec(1, "mwf", 650, "rc");
const S650_11_MWF = sec(2, "mwf", 650, "lc");
const S650_10_TTF = sec(3, "ttf", 650, "lc");
const S650_11_TTF = sec(4, "ttf", 650, "rc");
const S850_1230_MWF = sec(5, "mwf", 850, "lc");
const S850_1350_MWF = sec(6, "mwf", 850, "rc");
// 10월 — 그릇 반 (120분 묶음 · 속성반 · 2주완성)
const S650_120_MWF = sec(10, "mwf", 650, null);
const SPARTA650_MWF = sec(11, "mwf", 650, null);
const TWOWEEK850_MWF = sec(12, "mwf", 850, null, MWF.slice(0, 2));
// 10월 — 교재 레벨 목록에 없는 레벨 (숙제를 낼 수 없다)
const S999 = sec(30, "mwf", 999, "rc");
// 11월 — 750 단과
const N750_MWF = sec(40, "mwf", 750, "rc", NOV_MWF, 11);

const SECTIONS = new Map(
  [S650_10_MWF, S650_11_MWF, S650_10_TTF, S650_11_TTF, S850_1230_MWF, S850_1350_MWF, S650_120_MWF, SPARTA650_MWF, TWOWEEK850_MWF, S999, N750_MWF].map((s) => [s.id, s]),
);
const INCLUDES = new Map<number, number[]>([
  [10, [1, 2]],
  [11, [1, 2, 5]],
  [12, [5, 6]],
]);
const LEVELS = [650, 750, 850];

/** 같은 트랙의 다음 수업일 = 기한 날짜 (마지막 수업일은 다음 달 첫 같은 트랙 수업일 · 모르면 null) */
const nextOf = (dates: readonly string[], after: string | null = null): [string, string | null][] => dates.map((d, i) => [d, dates[i + 1] ?? after]);
const DUE = new Map([...nextOf(MWF, "2026-11-04"), ...nextOf(TTF), ...nextOf(NOV_MWF)]);
const at = (kst: string) => Date.parse(`${kst}:00+09:00`);
const sub = (date: string, level: number, subject: string) => ({ date, level, subject });

describe("학생 한 명의 달마다 숙제 제출률", () => {
  it("주3일 60분 단과 — 기한이 지난 숙제만 세고, 늦게 낸 숙제도 냄이다", () => {
    // 10/12 오후 6시 — 10/7 숙제(기한 10/9 5시) · 10/9 숙제(기한 10/12 5시)가 지났다. 10/12 · 10/14 숙제는 기한 전
    const [r] = homeworkTermRates({
      now: at("2026-10-12T18:00"),
      due: DUE,
      sections: SECTIONS,
      includes: INCLUDES,
      enrollments: [{ sectionId: 1, from: "2026-10-01" }],
      // 10/7 은 기한 뒤(10/10)에 냈어도 냄 · 10/9 는 안 냄 · 10/12 는 기한 전에 미리 냄
      submissions: [sub("2026-10-07", 650, "rc"), sub("2026-10-12", 650, "rc")],
      levels: LEVELS,
    });
    expect(r).toMatchObject({ termId: 10, total: 4, past: 2, done: 1, upcoming: 2, upcomingDone: 1, rate: 50, fill: 50, opens: "2026-10-06", closes: "2026-10-31" });
    expect(r.missing).toEqual([{ date: "2026-10-09", subject: "rc", due: "2026-10-12", level: 650 }]);
    expect(r.lines).toEqual([{ level: 650, subject: "rc", past: 2, done: 1, upcoming: 2, upcomingDone: 1 }]);
  });

  it("기한 오후 5시 정각까지는 기한 전 — 5시를 넘겨야 지난 숙제", () => {
    const base = { due: DUE, sections: SECTIONS, includes: INCLUDES, enrollments: [{ sectionId: 1, from: "2026-10-01" }], submissions: [], levels: LEVELS };
    expect(homeworkTermRates({ ...base, now: at("2026-10-09T17:00") })[0]).toMatchObject({ past: 0, rate: null });
    expect(homeworkTermRates({ ...base, now: at("2026-10-09T17:01") })[0]).toMatchObject({ past: 1, done: 0, rate: 0 });
  });

  it("기한을 모르는 숙제(다음 수업일이 아직 달력에 없음)는 지난 숙제로 세지 않는다", () => {
    const due = new Map(DUE);
    due.set("2026-10-14", null);
    const [r] = homeworkTermRates({ now: at("2026-12-31T23:00"), due, sections: SECTIONS, includes: INCLUDES, enrollments: [{ sectionId: 1, from: "2026-10-01" }], submissions: [], levels: LEVELS });
    expect(r).toMatchObject({ past: 3, upcoming: 1, rate: 0 });
  });

  it("반에 들어온 날(배정일)부터 — 그 전 수업 숙제는 묻지 않는다", () => {
    // 11/5 — 10/14 숙제의 기한(다음 달 첫 월수금 수업 11/4 오후 5시)까지 지났다
    const [r] = homeworkTermRates({
      now: at("2026-11-05T12:00"),
      due: DUE,
      sections: SECTIONS,
      includes: INCLUDES,
      enrollments: [{ sectionId: 1, from: "2026-10-10" }],
      submissions: [],
      levels: LEVELS,
    });
    expect(r).toMatchObject({ total: 2, past: 2, done: 0, rate: 0 });
    expect(r.missing.map((m) => m.date)).toEqual(["2026-10-12", "2026-10-14"]);
  });

  it("주5일 60분 — 월수금은 RC, 화목금은 LC 를 한 달에 더한다", () => {
    const [r] = homeworkTermRates({
      now: at("2026-10-20T12:00"),
      due: DUE,
      sections: SECTIONS,
      includes: INCLUDES,
      enrollments: [
        { sectionId: 1, from: "2026-10-01" },
        { sectionId: 3, from: "2026-10-01" },
      ],
      submissions: [...MWF.map((d) => sub(d, 650, "rc")), sub("2026-10-06", 650, "lc")],
      levels: LEVELS,
    });
    // 월수금 4개 다 냄(10/14 는 기한 11/4 전이라 기한 전) · 화목금 10/15 는 기한 모름(null) → 기한 전
    expect(r.lines).toEqual([
      { level: 650, subject: "rc", past: 3, done: 3, upcoming: 1, upcomingDone: 1 },
      { level: 650, subject: "lc", past: 3, done: 1, upcoming: 1, upcomingDone: 0 },
    ]);
    expect(r).toMatchObject({ past: 6, done: 4, rate: 67, total: 8, fill: 63 });
  });

  it("속성반 — 650 · 850 을 한 달에 더하고 레벨 × 과목 줄을 따로 준다", () => {
    const [r] = homeworkTermRates({
      now: at("2026-10-20T12:00"),
      due: DUE,
      sections: SECTIONS,
      includes: INCLUDES,
      enrollments: [{ sectionId: 11, from: "2026-10-01" }],
      submissions: [sub("2026-10-07", 650, "rc"), sub("2026-10-07", 650, "lc"), sub("2026-10-07", 850, "lc")],
      levels: LEVELS,
    });
    expect(r.lines.map((l) => [l.level, l.subject, l.past, l.done])).toEqual([
      [650, "rc", 3, 1],
      [650, "lc", 3, 1],
      [850, "lc", 3, 1],
    ]);
    expect(r).toMatchObject({ past: 9, done: 3, rate: 33 });
    // 안 낸 숙제 — 날짜 순, 같은 날은 레벨 · RC 먼저
    expect(r.missing.slice(0, 3).map((m) => `${m.date} ${m.level} ${m.subject}`)).toEqual(["2026-10-09 650 rc", "2026-10-09 650 lc", "2026-10-09 850 lc"]);
  });

  it("2주완성 — 앞 절반 수업일만, 품은 850 두 시간의 과목", () => {
    const [r] = homeworkTermRates({
      now: at("2026-10-20T12:00"),
      due: DUE,
      sections: SECTIONS,
      includes: INCLUDES,
      enrollments: [{ sectionId: 12, from: "2026-10-01" }],
      submissions: [],
      levels: LEVELS,
    });
    expect(r).toMatchObject({ total: 4, past: 4 });
    expect([...new Set(r.missing.map((m) => m.date))]).toEqual(MWF.slice(0, 2));
  });

  it("교재 레벨 목록에 없는 레벨은 세지 않는다 (숙제를 낼 수 없는 레벨)", () => {
    const rows = homeworkTermRates({
      now: at("2026-10-20T12:00"),
      due: DUE,
      sections: SECTIONS,
      includes: INCLUDES,
      enrollments: [{ sectionId: 30, from: "2026-10-01" }],
      submissions: [],
      levels: LEVELS,
    });
    expect(rows).toEqual([]);
  });

  it("두 달을 들었으면 달마다 한 줄 — 개강일 순", () => {
    const rows = homeworkTermRates({
      now: at("2026-11-09T12:00"),
      due: DUE,
      sections: SECTIONS,
      includes: INCLUDES,
      enrollments: [
        { sectionId: 40, from: "2026-10-28" },
        { sectionId: 1, from: "2026-10-01" },
      ],
      submissions: [...MWF.map((d) => sub(d, 650, "rc")), sub("2026-11-04", 750, "rc")],
      levels: LEVELS,
    });
    expect(rows.map((r) => [r.termId, r.past, r.done, r.rate])).toEqual([
      [10, 4, 4, 100],
      [11, 1, 1, 100],
    ]);
    expect(rows[1]).toMatchObject({ opens: "2026-11-04", closes: "2026-11-30", sectionIds: [40] });
  });

  it("아직 기한이 지난 숙제가 없으면 제출률은 없다 (0% 로 적지 않는다)", () => {
    const [r] = homeworkTermRates({
      now: at("2026-10-06T09:00"),
      due: DUE,
      sections: SECTIONS,
      includes: INCLUDES,
      enrollments: [{ sectionId: 10, from: "2026-10-01" }],
      submissions: [],
      levels: LEVELS,
    });
    expect(r).toMatchObject({ past: 0, rate: null, fill: 0, total: 8 });
  });
});

/**
 * **미제출 알림 화면과 같은 숫자인가** — 같은 데이터로 `buildMissingBoard`(레벨 탭마다 학생 줄)를 만들어 학생마다 · 레벨마다 견준다.
 * 배정 · 낸 숙제 · 시각을 정해진 씨앗으로 섞어 여러 판을 돌린다.
 */
describe("미제출 알림 화면의 제출률과 같다", () => {
  const SECTION_IDS = [1, 2, 3, 4, 5, 6, 10, 11, 12];
  const ALL_DATES = [...MWF, ...TTF].sort();
  function rng(seed: number) {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 2 ** 32;
    };
  }

  it("학생 30명 × 50판 — 레벨마다 기한 지난 숙제 · 낸 숙제 · 안 낸 숙제가 같다", () => {
    for (let round = 0; round < 50; round++) {
      const rand = rng(round + 1);
      const enrollments: MissingEnrollment[] = [];
      const submissions: MissingSubmission[] = [];
      for (let i = 0; i < 30; i++) {
        const studentId = `s${i}`;
        const picks = SECTION_IDS.filter(() => rand() < 0.25);
        for (const sectionId of picks.length ? picks : [SECTION_IDS[Math.floor(rand() * SECTION_IDS.length)]]) {
          enrollments.push({ studentId, sectionId, from: ALL_DATES[Math.floor(rand() * ALL_DATES.length)] });
        }
        for (const date of ALL_DATES) for (const level of [650, 850]) for (const subject of ["rc", "lc"]) if (rand() < 0.4) submissions.push({ userId: studentId, date, level, subject });
      }
      const now = at(`2026-10-${String(6 + Math.floor(rand() * 20)).padStart(2, "0")}T${String(Math.floor(rand() * 24)).padStart(2, "0")}:00`);
      const people = new Map(enrollments.map((e) => [e.studentId, { name: e.studentId, staff: false }]));

      for (const level of LEVELS) {
        const groups = buildMissingBoard({ level, now, due: DUE, sections: SECTIONS, includes: INCLUDES, enrollments, submissions, people, optedOut: new Set() });
        const boardRows = new Map(groups.flatMap((g) => g.rows.map((r) => [r.id, r] as const)));
        for (const studentId of new Set(enrollments.map((e) => e.studentId))) {
          const rates = homeworkTermRates({
            now,
            due: DUE,
            sections: SECTIONS,
            includes: INCLUDES,
            enrollments: enrollments.filter((e) => e.studentId === studentId),
            submissions: submissions.filter((s) => s.userId === studentId),
            levels: LEVELS,
          });
          const lines = rates.flatMap((r) => r.lines).filter((l) => l.level === level);
          const mine = { past: lines.reduce((n, l) => n + l.past, 0), done: lines.reduce((n, l) => n + l.done, 0) };
          const board = boardRows.get(studentId);
          expect({ round, level, studentId, ...mine }).toEqual({ round, level, studentId, past: board?.past ?? 0, done: board?.done ?? 0 });
          const missing = rates.flatMap((r) => r.missing).filter((m) => m.level === level).map((m) => `${m.date}|${m.subject}`);
          expect(missing).toEqual((board?.missing ?? []).map((m) => `${m.date}|${m.subject}`));
        }
      }
    }
  });
});
