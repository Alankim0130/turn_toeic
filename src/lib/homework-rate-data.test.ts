import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DB } from "@/app/admin/_lib/queries";
import { loadStudentHomeworkRates } from "@/app/admin/students/_lib/homework-rates";
import { myHomeworkRates } from "@/app/my/_lib/homework-rate";
import type { MyOrder, MySession } from "@/app/my/_lib/queries";

/**
 * 숙제 제출률(2026-10-30)이 읽는 길 — 강사 화면(학생 관리)의 `loadStudentHomeworkRates` 는 가짜 DB 로 실제로 돌리고,
 * 학생 화면의 `myHomeworkRates` 는 화면이 이미 읽은 모양(내 수업일 · 내 등록)으로 돌린다. 셈 자체는 `homework-rate.test.ts` 가 본다.
 */

const STUDENT = "a0000000-0000-0000-0000-000000000001";
const OTHER = "b0000000-0000-0000-0000-000000000002";

// 10월 — 650 120분 묶음 월수금(10) 이 10:00 RC(1) · 11:10 LC(2) 를 품는다. 11월 — 750 단과 월수금 RC(40)
const course650 = { name: "650+ 왕기초반", target_score: 650, program: "score" };
const course750 = { name: "750+ 유형마스터", target_score: 750, program: "score" };
const section = (id: number, term: number, subject: string | null, timeBlock: string, course = course650) => ({
  id,
  term_id: term,
  course_id: course === course650 ? 1 : 2,
  track: "mwf",
  time_block: timeBlock,
  start_time: null,
  subject,
  enrollment_opens_at: term === 10 ? "2026-10-06" : "2026-11-04",
  closes_at: term === 10 ? "2026-10-31" : "2026-11-30",
  term: term === 10 ? { year: 2026, month: 10 } : { year: 2026, month: 11 },
  course,
});
const S10 = section(10, 10, null, "10:00~12:10");
const S1 = section(1, 10, "rc", "10:00~11:00");
const S2 = section(2, 10, "lc", "11:10~12:10");
const S40 = section(40, 11, "rc", "10:00~11:00", course750);

const OCT = ["2026-10-07", "2026-10-09", "2026-10-12"];
const NOV = ["2026-11-04", "2026-11-06"];
const DUE: Record<string, string | null> = { "2026-10-07": "2026-10-09", "2026-10-09": "2026-10-12", "2026-10-12": "2026-11-04", "2026-11-04": "2026-11-06", "2026-11-06": null };

type Row = Record<string, unknown>;
function fakeDb(opts: { fail?: string[] } = {}): DB {
  const fail = opts.fail ?? [];
  const tables: Record<string, Row[]> = {
    enrollments: [
      // 배정일 10/9 오전 1시(KST) — 그 날부터 센다 (10/7 숙제는 묻지 않는다)
      { id: 1, student_id: STUDENT, status: "active", section_id: 10, created_at: "2026-10-08T16:00:00Z", section: S10 },
      { id: 2, student_id: STUDENT, status: "active", section_id: 40, created_at: "2026-10-28T03:00:00Z", section: S40 },
      { id: 3, student_id: OTHER, status: "active", section_id: 1, created_at: "2026-10-01T00:00:00Z", section: S1 },
    ],
    class_sections: [S10, S1, S2, S40],
    session_dates: [
      ...[S10, S1, S2].flatMap((s, i) => OCT.map((date, j) => ({ id: i * 10 + j, section_id: s.id, date }))),
      ...NOV.map((date, j) => ({ id: 100 + j, section_id: 40, date })),
    ],
    homework_submissions: [
      { id: 1, user_id: STUDENT, class_date: "2026-10-09", level: 650, subject: "rc" },
      { id: 2, user_id: STUDENT, class_date: "2026-10-12", level: 650, subject: "rc" },
      { id: 3, user_id: STUDENT, class_date: "2026-10-12", level: 650, subject: "lc" },
      { id: 4, user_id: STUDENT, class_date: "2026-11-04", level: 750, subject: "rc" },
      { id: 5, user_id: STUDENT, class_date: null, level: 650, subject: "rc" },
      // 다른 학생(10:00 RC 단과)의 숙제 — 내 10/9 LC 를 채우지 않는다
      { id: 6, user_id: OTHER, class_date: "2026-10-09", level: 650, subject: "rc" },
      { id: 7, user_id: OTHER, class_date: "2026-10-09", level: 650, subject: "lc" },
    ],
    lc_levels: [{ level: 650 }, { level: 750 }, { level: 850 }],
  };
  const from = (name: string) => {
    const eqs: [string, unknown][] = [];
    const ins: [string, unknown[]][] = [];
    const b = {
      select: () => b,
      eq: (col: string, val: unknown) => {
        eqs.push([col, val]);
        return b;
      },
      in: (col: string, vals: unknown[]) => {
        ins.push([col, vals]);
        return b;
      },
      order: () => b,
      range: () => b,
      then: (ok: (r: unknown) => unknown, bad?: (e: unknown) => unknown) => {
        if (fail.includes(name)) return Promise.resolve({ data: null, error: { message: "x" } }).then(ok, bad);
        const rows = (tables[name] ?? []).filter((r) => eqs.every(([c, v]) => r[c] === v) && ins.every(([c, vs]) => vs.includes(r[c])));
        return Promise.resolve({ data: rows, error: null, count: rows.length }).then(ok, bad);
      },
    };
    return b;
  };
  const rpc = (name: string, args: Record<string, unknown>) => {
    if (fail.includes(name)) return Promise.resolve({ data: null, error: { message: "x" } });
    if (name === "term_section_includes") {
      const term = args.p_term_id;
      return Promise.resolve({ data: term === 10 ? [{ section_id: 10, included_id: 1 }, { section_id: 10, included_id: 2 }] : [], error: null });
    }
    if (name === "homework_due_dates") {
      return Promise.resolve({ data: (args.p_dates as string[]).map((d) => ({ class_date: d, due_date: DUE[d] ?? null })), error: null });
    }
    throw new Error(`모르는 함수 ${name}`);
  };
  return { from, rpc } as unknown as DB;
}

describe("학생 관리의 숙제 제출률 — 가짜 DB", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-08T12:00:00+09:00"));
  });
  afterEach(() => vi.useRealTimers());

  it("달마다 — 최근 달부터, 배정일부터, 늦게 낸 숙제도 냄", async () => {
    const { months, ok } = await loadStudentHomeworkRates(fakeDb(), STUDENT);
    expect(ok).toBe(true);
    expect(months.map((m) => [m.year, m.month])).toEqual([
      [2026, 11],
      [2026, 10],
    ]);
    const [nov, oct] = months;
    // 10월: 배정일 10/9 부터 — 10/9 · 10/12 × RC · LC = 4개 다 기한 지남 (10/12 기한 = 11/4 오후 5시). 낸 것 RC 둘 + 10/12 LC
    expect(oct).toMatchObject({ past: 4, done: 3, rate: 75, upcoming: 0 });
    expect(oct.missing).toEqual([{ date: "2026-10-09", subject: "lc", due: "2026-10-12", level: 650 }]);
    expect(oct.classes?.join(" ")).toContain("650+");
    // 11월: 11/4 은 기한(11/6) 지남 · 냄, 11/6 은 다음 수업일이 달력에 없어 기한 전
    expect(nov).toMatchObject({ past: 1, done: 1, rate: 100, upcoming: 1, upcomingDone: 0 });
  });

  it("다른 학생의 숙제 · 배정은 섞이지 않는다", async () => {
    const { months } = await loadStudentHomeworkRates(fakeDb(), OTHER);
    expect(months).toHaveLength(1);
    expect(months[0]).toMatchObject({ past: 3, done: 1 });
  });

  it("하나라도 못 읽으면 숫자를 그리지 않는다 (낸 숙제를 못 읽었는데 0% 로 보이면 안 된다)", async () => {
    for (const name of ["enrollments", "session_dates", "homework_submissions", "lc_levels", "term_section_includes", "homework_due_dates"]) {
      expect(await loadStudentHomeworkRates(fakeDb({ fail: [name] }), STUDENT), name).toEqual({ months: [], ok: false });
    }
  });
});

describe("학생 화면의 이번 달 숙제 제출률 — 화면이 이미 읽은 것으로", () => {
  const session = (id: number, date: string, sec: typeof S1) => ({ id, seq: 1, date, start_time: null, end_time: null, section: { ...sec, status: "open", book_set: null, recorded: false, live_to_replay: true, end_time: null, course: { ...sec.course, course_type: "full", includes_levels: [] } } });
  const sessions = [S10, S1, S2].flatMap((s, i) => OCT.map((d, j) => session(i * 10 + j, d, s))) as unknown as MySession[];
  const orders = [
    {
      id: 1,
      status: "active",
      activates_on: "2026-10-06",
      access_until: "2026-10-31",
      created_at: "2026-10-01T00:00:00Z",
      enrollments: [{ id: 1, status: "active", mode: "onsite", created_at: "2026-10-08T16:00:00Z", section: sessions[0].section }],
    },
  ] as unknown as MyOrder[];
  const due = new Map(Object.entries(DUE));
  const includes = new Map([[10, new Set([1, 2])]]);
  const submissions = [
    { class_date: "2026-10-09", level: 650, subject: "rc" },
    { class_date: "2026-10-12", level: 650, subject: "lc" },
  ];

  it("지금 수강 중인 달만 · 배정일(KST)부터", () => {
    const rows = myHomeworkRates({ sessions, orders, includes, submissions, due, levels: [650, 750, 850], terms: new Set([10]), now: Date.parse("2026-10-20T12:00:00+09:00") });
    expect(rows).toHaveLength(1);
    // 10/9 · 10/12 × RC · LC — 10/9 둘은 기한(10/12 오후 5시) 지남, 10/12 둘은 기한(11/4) 전
    expect(rows[0]).toMatchObject({ year: 2026, month: 10, total: 4, past: 2, done: 1, upcoming: 2, upcomingDone: 1, rate: 50, fill: 50 });
    expect(rows[0].missing.map((m) => `${m.date} ${m.subject}`)).toEqual(["2026-10-09 lc"]);
  });

  it("수강 중인 달이 아니면 없다", () => {
    expect(myHomeworkRates({ sessions, orders, includes, submissions, due, levels: [650], terms: new Set([11]) })).toEqual([]);
  });
});
