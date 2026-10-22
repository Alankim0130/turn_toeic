import { describe, expect, it, vi, beforeEach } from "vitest";
import type { OpenCourse } from "./month-open";

/**
 * 평달 자동 세팅(`autoOpenMonth`)을 가짜 DB 로 실제로 돌려 본다 (2026-10-22 오류 점검).
 * - 같은 레벨 · 과정의 '사용 중' 강좌가 둘이면 어느 쪽으로 열지 몰라 열지 않는다 (둘 다 열면 그 레벨 반이 두 벌)
 * - 시간표 · 강좌를 읽다 실패하면 짐작으로 만들지 않는다 (만든 달 목록이 비어 보이면 기본 줄에서 시간만 가져와 과정 A/B 가 빈 시간표가 생겼다)
 * - 10분 확인은 받아 둔 수강증 다시 맞추기를 끝에 한 번만 (`rematch: false`)
 */

const h = vi.hoisted(() => ({ after: [] as unknown[] }));
vi.mock("next/server", () => ({ after: (fn: unknown) => void h.after.push(fn) }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/rematch-held", () => ({ rematchHeldVerifications: async () => ({ waiting: 0, approved: 0, review: 0 }) }));

const { autoOpenMonth } = await import("@/app/admin/sections/_lib/open-month");

type Q = { table: string; op: "select" | "insert"; columns: string; head: boolean; filters: string[]; rows?: unknown[] };
type R = { data?: unknown; error?: { code?: string; message?: string } | null; count?: number | null };

function fake(answer: (q: Q) => R) {
  const log: Q[] = [];
  const rpcs: { name: string; rows: unknown[] }[] = [];
  const query = (table: string) => {
    const q: Q = { table, op: "select", columns: "", head: false, filters: [] };
    const run = (): Promise<R> => {
      log.push(q);
      return Promise.resolve({ data: null, error: null, count: null, ...answer(q) });
    };
    const b = {
      select: (columns: string, opts?: { head?: boolean }) => ((q.columns = columns), (q.head = !!opts?.head), b),
      insert: (rows: unknown[]) => ((q.op = "insert"), (q.rows = rows), b),
      eq: (c: string, v: unknown) => (q.filters.push(`${c}=${String(v)}`), b),
      is: (c: string, v: unknown) => (q.filters.push(`${c} is ${String(v)}`), b),
      not: (c: string, o: string, v: unknown) => (q.filters.push(`${c} not ${o} ${String(v)}`), b),
      order: () => b,
      limit: () => b,
      maybeSingle: run,
      then: (ok: (r: R) => unknown, bad?: (e: unknown) => unknown) => run().then(ok, bad),
    };
    return b;
  };
  const client = {
    from: query,
    rpc: (name: string, args: { p_rows?: unknown[] }) => {
      rpcs.push({ name, rows: args.p_rows ?? [] });
      return Promise.resolve({ data: (args.p_rows ?? []).length, error: null });
    },
  };
  return { client: client as unknown as Parameters<typeof autoOpenMonth>[0], log, rpcs };
}

// 11월(평달) — 10월 시간표 모양 19줄 (시간 단위 · 한달완성 · 속성반 · 2주완성)
let nextId = 1;
const SLOT = (level: number, label: string, program = "score", plan: [string | null, string | null, string | null] = [null, null, null], month = 11) => {
  const [start, end] = label.split("~");
  return { id: nextId++, year: 2026, month, level, program, start_time: `${start}:00`, end_time: `${end}:00`, ttf_recorded: start >= "18:00", book_set: plan[0], subject_mwf: plan[1], subject_ttf: plan[2] };
};
const rowsFor = (month: number) => [
  SLOT(650, "10:00~11:00", "score", ["A", "rc", "lc"], month),
  SLOT(650, "11:10~12:10", "score", ["B", "lc", "rc"], month),
  SLOT(650, "10:00~12:10", "score", [null, null, null], month),
  SLOT(750, "10:00~11:00", "score", ["A", "lc", "rc"], month),
  SLOT(750, "11:10~12:10", "score", ["B", "rc", "lc"], month),
  SLOT(850, "12:30~13:40", "score", ["A", "rc", "lc"], month),
  SLOT(650, "10:00~13:40", "sparta", [null, null, null], month),
];
const COURSES: OpenCourse[] = [
  { id: 1, program: "score", target_score: 650 },
  { id: 2, program: "score", target_score: 750 },
  { id: 3, program: "score", target_score: 850 },
  { id: 4, program: "sparta", target_score: 650 },
];
const NOV = { y: 2026, m: 11 };
const TODAY = "2026-10-22";

function world(o: { slots?: unknown[] | "error"; dated?: "error"; courses?: OpenCourse[] | "error" } = {}) {
  return (q: Q): R => {
    if (q.table === "terms") return { data: { id: 77, enrollment_opens_at: "2026-11-04", closes_at: "2026-12-01" } };
    if (q.table === "class_sections") return { count: 0 };
    if (q.table === "timetable_slots") {
      if (q.op === "insert") return {};
      if (q.columns === "year, month") return o.dated === "error" ? { error: { message: "boom" } } : { data: [{ year: 2026, month: 10 }] };
      if (q.columns === "season") return { data: [] };
      if (q.head) return { count: 0 };
      if (q.filters.includes("month=11")) return o.slots === "error" ? { error: { message: "boom" } } : { data: o.slots ?? rowsFor(11) };
      return { data: rowsFor(10) };
    }
    if (q.table === "courses") return o.courses === "error" ? { error: { message: "boom" } } : { data: o.courses ?? COURSES };
    if (q.table === "term_class_dates") return { data: [{ track: "mwf" }, { track: "ttf" }] };
    if (q.table === "enrollment_verifications") return { count: 0 };
    return {};
  };
}

beforeEach(() => {
  h.after.length = 0;
});

describe("autoOpenMonth — 가짜 DB 로 돌려 보기", () => {
  it("시간표가 있으면 강좌마다 연다 (7줄 × 월수금 · 화목금 = 14) · 받아 둔 수강증 다시 맞추기를 한 번 맡긴다", async () => {
    const { client, rpcs } = fake(world());
    const r = await autoOpenMonth(client, NOV, TODAY);
    expect(r).toMatchObject({ kind: "opened", sections: 14, timetableMade: false });
    expect(rpcs).toHaveLength(1);
    expect(rpcs[0].name).toBe("open_month_sections");
    expect(h.after).toHaveLength(1);
  });

  it("10분 확인(rematch: false)은 다시 맞추기를 부른 쪽에 맡긴다 — 여러 달을 돌고 끝에 한 번", async () => {
    const { client } = fake(world());
    expect(await autoOpenMonth(client, NOV, TODAY, { rematch: false })).toMatchObject({ kind: "opened", sections: 14 });
    expect(h.after).toHaveLength(0);
  });

  it("같은 레벨 · 과정의 '사용 중' 강좌가 둘이면 열지 않는다 — 반을 하나도 넣지 않고 까닭(duplicate_course)", async () => {
    const { client, rpcs } = fake(world({ courses: [...COURSES, { id: 9, program: "score", target_score: 650 }] }));
    expect(await autoOpenMonth(client, NOV, TODAY)).toEqual({ kind: "failed", month: 11, reason: "duplicate_course" });
    expect(rpcs).toHaveLength(0);
    expect(h.after).toHaveLength(0);
  });

  it("시간표 줄이 없는 레벨의 강좌는 둘이어도 상관없다 (어차피 열지 않는다)", async () => {
    const extra: OpenCourse[] = [
      { id: 8, program: "score", target_score: 900 },
      { id: 9, program: "score", target_score: 900 },
    ];
    const { client, rpcs } = fake(world({ courses: [...COURSES, ...extra] }));
    expect(await autoOpenMonth(client, NOV, TODAY)).toMatchObject({ kind: "opened", sections: 14 });
    expect(rpcs[0].rows).toHaveLength(14);
  });

  it("그 달 시간표를 읽다 실패하면 새로 만들지 않는다 (빈 시간표로 보지 않는다)", async () => {
    const { client, log, rpcs } = fake(world({ slots: "error" }));
    expect(await autoOpenMonth(client, NOV, TODAY)).toEqual({ kind: "failed", month: 11, reason: "timetable_error" });
    expect(log.some((q) => q.table === "timetable_slots" && q.op === "insert")).toBe(false);
    expect(rpcs).toHaveLength(0);
  });

  it("시간표가 없는데 만든 달 목록을 읽다 실패하면 짐작으로 만들지 않는다 (기본 줄에서 시간만 가져오지 않게)", async () => {
    const { client, log, rpcs } = fake(world({ slots: [], dated: "error" }));
    expect(await autoOpenMonth(client, NOV, TODAY)).toEqual({ kind: "failed", month: 11, reason: "timetable_error" });
    expect(log.some((q) => q.table === "timetable_slots" && q.op === "insert")).toBe(false);
    expect(rpcs).toHaveLength(0);
  });

  it("강좌를 못 읽으면 '열 반이 없다' 고 하지 않고 못 연 것으로", async () => {
    const { client, rpcs } = fake(world({ courses: "error" }));
    expect(await autoOpenMonth(client, NOV, TODAY)).toEqual({ kind: "failed", month: 11, reason: "sections_error" });
    expect(rpcs).toHaveLength(0);
  });
});
