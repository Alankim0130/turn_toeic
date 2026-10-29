import { describe, expect, it } from "vitest";
import { earlySubmissionIds } from "@/app/admin/homework/_lib/early";
import type { DB } from "@/app/admin/_lib/queries";

/**
 * 숙제점검 이름 검색의 '수업 전에 냄' 표시 (2026-10-30 문라경 학생 — 지난 수업 숙제가 다음 수업일 날짜로 저장돼 미제출 알림이 갔다).
 * 가짜 DB 로 실제 함수를 돌린다 — 반의 시간대 · 그 날 회차 · 인강 반 · 반을 못 읽은 경우.
 */

type Row = Record<string, unknown>;
function fakeDb(tables: Record<string, Row[]>, fail: string[] = []): DB {
  const from = (name: string) => {
    const filters: [string, unknown[]][] = [];
    const b = {
      select: () => b,
      in: (col: string, vals: unknown[]) => {
        filters.push([col, vals]);
        return b;
      },
      order: () => b,
      range: () => b,
      then: (ok: (r: unknown) => unknown, bad?: (e: unknown) => unknown) => {
        if (fail.includes(name)) return Promise.resolve({ data: null, error: { message: "x" } }).then(ok, bad);
        const rows = (tables[name] ?? []).filter((r) => filters.every(([col, vals]) => vals.includes(r[col])));
        return Promise.resolve({ data: rows, error: null, count: rows.length }).then(ok, bad);
      },
    };
    return b;
  };
  return { from } as unknown as DB;
}

const A = "a0000000-0000-0000-0000-000000000001";
const B = "b0000000-0000-0000-0000-000000000002";
const tables = {
  enrollments: [
    { id: 1, student_id: A, section_id: 9101, section: { time_block: "10:00~11:00", recorded: false } },
    { id: 2, student_id: B, section_id: 9103, section: { time_block: "18:30~19:30", recorded: true } },
  ],
  session_dates: [
    { id: 1, section_id: 9101, date: "2026-10-26" },
    { id: 2, section_id: 9101, date: "2026-10-28" },
    { id: 3, section_id: 9101, date: "2026-10-30" },
    { id: 4, section_id: 9101, date: "2026-11-02" },
    { id: 5, section_id: 9103, date: "2026-10-27" },
  ],
};
const subs = [
  { id: 601, user_id: A, class_date: "2026-11-02", created_at: "2026-10-31T05:00:00Z" }, // 토요일에 다음 주 월요일 숙제로 — 잘못 낸 것
  { id: 602, user_id: A, class_date: "2026-10-28", created_at: "2026-10-27T23:30:00Z" }, // 수요일 08:30 (수업 10:00 전) — 잘못 낸 것
  { id: 603, user_id: A, class_date: "2026-10-26", created_at: "2026-10-26T11:00:00Z" }, // 월요일 20:00 — 제대로
  { id: 604, user_id: A, class_date: "2026-10-28", created_at: "2026-10-28T03:00:00Z" }, // 수요일 12:00 (수업 뒤) — 제대로
  { id: 605, user_id: B, class_date: "2026-10-27", created_at: "2026-10-27T05:00:00Z" }, // 인강 날 14:00 — 시작 시각을 모르니 날짜만 (같은 날 = 표시 없음)
  { id: 606, user_id: A, class_date: null, created_at: "2026-10-27T05:00:00Z" }, // 옛 제출 (날짜 없음)
];

describe("earlySubmissionIds — 수업 전에 낸 숙제", () => {
  it("아직 오지 않은 수업 날짜로 낸 것 · 그 날 첫 수업 전에 낸 것만", async () => {
    expect([...(await earlySubmissionIds(fakeDb(tables), subs))].sort()).toEqual([601, 602]);
  });

  it("반 · 회차를 못 읽으면 날짜만 본다 (같은 날 수업 전은 모른다)", async () => {
    expect([...(await earlySubmissionIds(fakeDb(tables, ["enrollments"]), subs))]).toEqual([601]);
    expect([...(await earlySubmissionIds(fakeDb(tables, ["session_dates"]), subs))]).toEqual([601]);
  });

  it("날짜가 있는 제출이 없으면 DB 를 부르지 않는다", async () => {
    const db = { from: () => { throw new Error("부르면 안 된다"); } } as unknown as DB;
    expect((await earlySubmissionIds(db, [subs[5]])).size).toBe(0);
  });
});
