import { describe, expect, it, vi } from "vitest";

/**
 * 수강증 원본 지우기 크론 (`/api/cron/purge-receipts`) 을 작은 가짜 DB 로 돌린다 (2026-10-29 전체 점검).
 * 대상이 많은 날(방학처럼 하루에 수강증이 수백 장 오른 날의 60일 뒤) 500개 경로를 한 번에 `.in()` 에 넣어 요청 주소가 33KB 를 넘었고,
 * 실패하면 다음 날도 같은 500건을 다시 집어 영영 막혔다 — 이제 100개씩 나눠 묻고, 하나라도 못 확인하면 아무것도 지우지 않는다.
 */

type Row = Record<string, unknown>;

const h = vi.hoisted(() => ({ admin: null as unknown, inSizes: [] as number[], failChunk: -1, removed: [] as string[], marked: [] as unknown[] }));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => h.admin }));
vi.mock("@/lib/cron-auth", () => ({ authorizedCron: () => true }));

const { GET } = await import("@/app/api/cron/purge-receipts/route");

/** 이 라우트가 쓰는 것만 흉내 낸다 — select · not · is · lt · order · limit · in · or · update */
function fakeAdmin(rows: Row[]) {
  let chunk = 0;
  const from = () => {
    const filters: ((r: Row) => boolean)[] = [];
    let limit = Infinity;
    let patch: Row | null = null;
    let inCall = false;
    const builder = {
      select: () => builder,
      not: (c: string, _op: string, v: unknown) => (filters.push((r) => (r[c] ?? null) !== v), builder),
      is: (c: string, v: unknown) => (filters.push((r) => (r[c] ?? null) === v), builder),
      lt: (c: string, v: string) => (filters.push((r) => String(r[c]) < v), builder),
      order: () => builder,
      limit: (n: number) => ((limit = n), builder),
      in: (c: string, vs: unknown[]) => {
        inCall = true;
        if (c === "file_path") h.inSizes.push(vs.length);
        filters.push((r) => vs.includes(r[c]));
        return builder;
      },
      // `result.is.null,created_at.gte.<cutoff>` — 아직 판정 전이거나 보관 기간 안
      or: (expr: string) => {
        const cutoff = expr.split("created_at.gte.")[1];
        filters.push((r) => r.result == null || String(r.created_at) >= cutoff);
        return builder;
      },
      update: (p: Row) => ((patch = p), builder),
      then: (resolve: (v: { data: Row[] | null; error: { message: string } | null }) => unknown) => {
        if (inCall && !patch) {
          const mine = chunk++;
          if (mine === h.failChunk) return Promise.resolve({ data: null, error: { message: "URI too long" } }).then(resolve);
        }
        const hit = rows.filter((r) => filters.every((f) => f(r))).slice(0, limit);
        if (patch) {
          for (const r of hit) Object.assign(r, patch);
          h.marked.push(...hit.map((r) => r.id));
        }
        return Promise.resolve({ data: hit, error: null }).then(resolve);
      },
    };
    return builder;
  };
  return { from, storage: { from: () => ({ remove: async (paths: string[]) => (h.removed.push(...paths), { data: null, error: null }) }) } };
}

const OLD = "2026-01-01T00:00:00Z";
const decided = (i: number): Row => ({ id: i, file_path: `u${i}/receipt-${String(i).padStart(4, "0")}-abcdefghijklmnopqrstuvwxyz0123456789.png`, result: "rejected", file_deleted_at: null, created_at: OLD });

async function run(rows: Row[], failChunk = -1) {
  h.inSizes = [];
  h.removed = [];
  h.marked = [];
  h.failChunk = failChunk;
  h.admin = fakeAdmin(rows);
  const res = await GET(new Request("https://example.com/api/cron/purge-receipts") as never);
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

describe("수강증 원본 지우기 크론 — 쓰는 중인 파일 확인을 100개씩 (2026-10-29)", () => {
  it("대상이 250개면 100 · 100 · 50 으로 나눠 묻고 전부 지운다", async () => {
    const rows = Array.from({ length: 250 }, (_, i) => decided(i + 1));
    const { status, body } = await run(rows);
    expect(status).toBe(200);
    expect(h.inSizes).toEqual([100, 100, 50]);
    expect(Math.max(...h.inSizes)).toBeLessThanOrEqual(100);
    expect(body.purged).toBe(250);
    expect(h.removed).toHaveLength(250);
  });

  it("검토 중인 새 신청이 같은 파일을 쓰면 그 파일만 남긴다 (거절 뒤 수동 신청이 그림을 다시 쓴다)", async () => {
    const rows = Array.from({ length: 120 }, (_, i) => decided(i + 1));
    rows.push({ id: 999, file_path: rows[110].file_path, result: null, file_deleted_at: null, created_at: OLD });
    const { body } = await run(rows);
    expect(h.removed).not.toContain(rows[110].file_path);
    expect(h.removed).toHaveLength(119);
    expect(body.kept).toBe(1);
  });

  it("한 묶음이라도 못 확인하면 아무것도 지우지 않는다 — 확인 못 한 파일이 검토 중인 신청의 그림일 수 있다", async () => {
    const rows = Array.from({ length: 250 }, (_, i) => decided(i + 1));
    const { status } = await run(rows, 1);
    expect(status).toBe(500);
    expect(h.removed).toEqual([]);
    expect(h.marked).toEqual([]);
  });
});
