import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 숙제 제출 서버 액션(`submitHomework`)을 가짜 DB 로 돌려 본다 — **아직 오지 않은 수업 날짜로는 받지 않는다** (2026-10-30 문라경 학생 —
 * 수업이 없는 날 열면 달력이 다음 수업일을 골라 두어 지난 수업 숙제가 그 날짜로 저장됐고, 원래 수업은 '안 냄' 이 되어 미제출 알림이 갔다).
 * 예전 서버는 그 날짜가 내 수업일인지만 봐서 다음 수업일로도 받았다. 화면이 막아도 열어 둔 옛 화면 · 손으로 만든 요청은 서버가 막는다.
 */

const h = vi.hoisted(() => ({
  rpcs: [] as string[],
  inserted: [] as unknown[],
  revalidated: [] as string[],
}));

vi.mock("next/cache", () => ({ revalidatePath: (p: string) => void h.revalidated.push(p) }));
vi.mock("@/lib/supabase/server", () => {
  const table = (name: string) => {
    const b = {
      select: () => b,
      eq: () => b,
      in: () => b,
      insert: (row: unknown) => {
        h.inserted.push({ name, row });
        return b;
      },
      single: () => Promise.resolve({ data: { id: 77 }, error: null }),
      then: (ok: (r: unknown) => unknown, bad?: (e: unknown) => unknown) => {
        if (name === "session_dates") return Promise.resolve({ data: [{ section: { course: { target_score: 650, includes_levels: [] } } }], error: null }).then(ok, bad);
        return Promise.resolve({ data: null, error: null }).then(ok, bad);
      },
    };
    return b;
  };
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    rpc: (name: string) => {
      h.rpcs.push(name);
      return Promise.resolve({ data: [11], error: null });
    },
    from: table,
    storage: { from: () => ({ list: async (_folder: string, opts: { search: string }) => ({ data: [{ name: opts.search }] }) }) },
  };
  return { createClient: async () => client };
});

const { submitHomework } = await import("@/app/my/homework/actions");

const photo = { path: "u1/650-rc/a1.jpg", name: "a.jpg", size: 1000, type: "image/jpeg" };
const submit = (classDate: string) => submitHomework({ level: 650, subject: "rc", classDate, files: [photo] });

beforeEach(() => {
  h.rpcs.length = 0;
  h.inserted.length = 0;
  h.revalidated.length = 0;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-31T03:00:00Z")); // 한국 10/31(토) 12:00
});
afterEach(() => vi.useRealTimers());

describe("submitHomework — 수업 날짜", () => {
  it("아직 오지 않은 수업 날짜(토요일에 다음 주 월요일)는 받지 않는다 — DB 를 부르기 전에", async () => {
    const r = await submit("2026-11-02");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("아직 수업 전인 날짜예요");
    expect(h.rpcs).toEqual([]);
    expect(h.inserted).toEqual([]);
  });

  it("한국 날짜로 가른다 — UTC 로는 10/31 인 한국 11/1 새벽 1시에 11/1 은 오늘이다", async () => {
    vi.setSystemTime(new Date("2026-10-31T16:00:00Z"));
    expect((await submit("2026-11-02")).ok).toBe(false);
    expect((await submit("2026-11-01")).ok).toBe(true);
  });

  it("지난 수업(금요일) · 오늘 수업은 받는다", async () => {
    const fri = await submit("2026-10-30");
    expect(fri).toEqual({ ok: true, id: 77 });
    expect(h.rpcs).toContain("my_section_ids");
    vi.setSystemTime(new Date("2026-11-02T08:00:00Z")); // 한국 11/2(월) 17:00
    expect((await submit("2026-11-02")).ok).toBe(true);
    expect(h.inserted.filter((x) => (x as { name: string }).name === "homework_submissions")).toHaveLength(2);
  });
});

describe("submitHomework — 질문(코멘트)은 받지 않는다", () => {
  it("옛 화면이 질문을 보내도 저장하지 않는다 (2026-10-30 — 질문이나 문의사항은 개인톡으로)", async () => {
    const r = await submitHomework({ level: 650, subject: "rc", classDate: "2026-10-30", files: [photo], question: "이 문제 왜 B예요?" } as Parameters<typeof submitHomework>[0]);
    expect(r.ok).toBe(true);
    const row = (h.inserted.find((x) => (x as { name: string }).name === "homework_submissions") as { row: Record<string, unknown> }).row;
    expect(row).not.toHaveProperty("question");
  });
});
