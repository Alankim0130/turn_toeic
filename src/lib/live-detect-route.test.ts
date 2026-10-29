import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 유튜브 송출 감지 크론 (2026-10-29 점검) — 가짜 DB · 가짜 구글로 라우트를 실제로 부른다.
 *  1. 한 강사 채널이 던져도(토큰 요청 시간 초과) 다른 강사 채널은 그 회차에 그대로 본다 — 예전에는 라우트가 통째로 500 이었다.
 *  2. 강사에게 "연결을 확인해 주세요" 를 보내는 것은 연결이 정말 끊겼을 때(invalid_grant) 처음 한 번뿐 — 구글이 잠깐 500 을 줄 때는 보내지 않는다.
 */

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  updates: [] as { user_id: string; row: Record<string, unknown> }[],
  registered: [] as number[][],
  pushes: [] as { user: string; title: string }[],
  token: {} as Record<string, () => Promise<Response>>,
  channels: [] as Record<string, unknown>[],
}));

const START = new Date(Date.now() - 2 * 60_000).toISOString();
const candidates = [
  { session_date_id: 11, section_id: 1, instructor_id: "A", starts_at: START, label: "650 10:00", live_to_replay: true },
  { session_date_id: 22, section_id: 2, instructor_id: "B", starts_at: START, label: "750 10:00", live_to_replay: true },
];

vi.mock("@/lib/cron-auth", () => ({ authorizedAppCall: async () => true }));
vi.mock("@/lib/push", () => ({ notifyUser: async (user: string, _k: string, m: { title: string }) => void h.pushes.push({ user, title: m.title }) }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: async (name: string, args: { p_session_date_ids?: number[] }) => {
      if (name === "live_detect_candidates") return { data: candidates, error: null };
      if (name === "register_detected_stream") {
        h.registered.push(args.p_session_date_ids ?? []);
        return { data: (args.p_session_date_ids ?? []).map((id) => ({ session_date_id: id, live_linked: true })), error: null };
      }
      return { data: null, error: { message: name } };
    },
    from: () => ({
      select: () => ({ in: async () => ({ data: h.channels, error: null }) }),
      update: (row: Record<string, unknown>) => ({ eq: async (_c: string, user_id: string) => void h.updates.push({ user_id, row }) }),
    }),
  }),
}));

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => {
  process.env.YOUTUBE_CLIENT_ID = "id";
  process.env.YOUTUBE_CLIENT_SECRET = "secret";
  h.updates = [];
  h.registered = [];
  h.pushes = [];
  // A 가 먼저 — 예전에는 A 가 던지면 B 를 보지도 못했다
  h.channels = [
    { user_id: "A", channel_title: "A", refresh_token: "rA", access_token: null, access_token_expires_at: null, last_error: null },
    { user_id: "B", channel_title: "B", refresh_token: "rB", access_token: null, access_token_expires_at: null, last_error: null },
  ];
  h.token = {
    rA: async () => {
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    },
    rB: async () => json({ access_token: "tB", expires_in: 3600 }),
  };
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    if (url.startsWith("https://oauth2.googleapis.com/token")) {
      const refresh = new URLSearchParams(String(init?.body)).get("refresh_token") ?? "";
      return h.token[refresh]();
    }
    if (url.startsWith("https://www.googleapis.com/youtube/v3/liveBroadcasts")) {
      return json({ items: [{ id: "AbCdEfGhIj0", snippet: { actualStartTime: START, title: "수업" }, status: { lifeCycleStatus: "live", privacyStatus: "unlisted" } }] });
    }
    throw new Error(`unexpected ${url}`);
  });
});

const { POST } = await import("@/app/api/cron/live-detect/route");
const call = () => POST(new Request("http://x/api/cron/live-detect", { method: "POST" }) as never);

describe("live-detect — 강사마다 따로", () => {
  it("A 의 토큰 요청이 시간 초과로 던져도 B 의 송출은 그 회차에 걸린다", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, registered: 1 });
    expect(h.registered).toEqual([[22]]);
    expect(h.pushes).toEqual([{ user: "B", title: "유튜브 송출을 찾았어요" }]);
    // A 는 까닭만 남는다 — "연결을 확인해 주세요" 를 보내지 않는다
    expect(h.updates.find((u) => u.user_id === "A")?.row.last_error).toContain("토큰을 받지 못했어요");
  });

  it("구글이 잠깐 500 을 주면 강사에게 알리지 않는다", async () => {
    h.token.rA = async () => json({ error: "internal_failure" }, 500);
    await call();
    expect(h.pushes.filter((p) => p.user === "A")).toEqual([]);
  });

  it("연결이 정말 끊겼으면(invalid_grant) 처음 한 번 알린다 — 이미 끊겼다고 남겼으면 다시 알리지 않는다", async () => {
    h.token.rA = async () => json({ error: "invalid_grant" }, 400);
    await call();
    expect(h.pushes.filter((p) => p.user === "A")).toEqual([{ user: "A", title: "유튜브 연결을 확인해 주세요" }]);

    const { LINK_BROKEN } = await import("@/lib/youtube");
    h.pushes = [];
    h.channels[0].last_error = LINK_BROKEN;
    await call();
    expect(h.pushes.filter((p) => p.user === "A")).toEqual([]);

    // 그 사이 다른 오류(조회 실패)가 남아 있었어도 끊긴 것은 처음 한 번 알린다
    h.channels[0].last_error = "유튜브 조회 실패 (HTTP 503)";
    await call();
    expect(h.pushes.filter((p) => p.user === "A")).toEqual([{ user: "A", title: "유튜브 연결을 확인해 주세요" }]);
  });

  it("방송 조회가 닿지 않아도 던지지 않고 까닭을 남긴다", async () => {
    vi.stubGlobal("fetch", async (url: string) => {
      if (url.startsWith("https://oauth2.googleapis.com/token")) return json({ access_token: "t", expires_in: 3600 });
      throw new TypeError("fetch failed");
    });
    const res = await call();
    expect(res.status).toBe(200);
    expect(h.updates.filter((u) => "last_error" in u.row).map((u) => u.row.last_error)).toEqual(["유튜브 조회 실패 (응답 없음)", "유튜브 조회 실패 (응답 없음)"]);
  });
});
