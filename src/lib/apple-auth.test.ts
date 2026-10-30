import { generateKeyPairSync, verify } from "node:crypto";
import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Apple 로 로그인 (2026-10-30 Alan — "애플로그인을 추가해줘. 그리고 홈페이지에도 애플로그인이 추가되어야해").
 * 웹(form_post → `/auth/apple/callback`)과 앱(아이폰의 Apple 로그인 창 → `signInWithAppleApp`) 두 길이 같은 끝(Supabase `signInWithIdToken`)으로 간다.
 * 여기서 본다: state · nonce 쿠키 꼴 · 애플 로그인 주소 · 이름 · .p8 키로 만든 JWT · 탈퇴할 때 애플 연결 끊기(App Store 심사 5.1.1(v)).
 */

const h = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[], upserts: [] as Record<string, unknown>[], readError: null as null | { message: string } }));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      expect(table).toBe("apple_tokens");
      return {
        upsert: (row: Record<string, unknown>) => (h.upserts.push(row), Promise.resolve({ error: null })),
        select: () => ({
          in: (_c: string, ids: string[]) =>
            Promise.resolve(h.readError ? { data: null, error: h.readError } : { data: h.rows.filter((r) => ids.includes(String(r.user_id))), error: null }),
        }),
      };
    },
  }),
}));

const apple = await import("@/lib/apple-auth");
const key = await import("@/lib/apple-key");

const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const PEM = privateKey.export({ format: "pem", type: "pkcs8" }).toString();

function setKey(pem = PEM) {
  process.env.APPLE_TEAM_ID = "TEAM123456";
  process.env.APPLE_KEY_ID = "KEY1234567";
  process.env.APPLE_PRIVATE_KEY = pem;
}

function decode(jwt: string) {
  const [head, body, sig] = jwt.split(".");
  return {
    header: JSON.parse(Buffer.from(head, "base64url").toString()),
    payload: JSON.parse(Buffer.from(body, "base64url").toString()),
    valid: verify("sha256", Buffer.from(`${head}.${body}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(sig, "base64url")),
  };
}

beforeEach(() => {
  h.rows = [];
  h.upserts = [];
  h.readError = null;
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.APPLE_TEAM_ID;
  delete process.env.APPLE_KEY_ID;
  delete process.env.APPLE_PRIVATE_KEY;
  delete process.env.APPLE_SERVICES_ID;
});

describe("웹 로그인의 state · nonce 쿠키", () => {
  it("쌓았다 풀면 그대로 — 돌아갈 곳은 물음표 뒤까지", () => {
    const v = { state: apple.randomToken(), nonce: apple.randomToken(), next: "/my/lecture?term=2026-11#a" };
    expect(apple.unpackAppleState(apple.packAppleState(v))).toEqual(v);
  });

  it("꼴이 틀리면 null — 남이 만든 값으로 로그인시키지 않는다", () => {
    expect(apple.unpackAppleState(undefined)).toBeNull();
    expect(apple.unpackAppleState("")).toBeNull();
    expect(apple.unpackAppleState("a.b")).toBeNull();
    expect(apple.unpackAppleState("a.b.c.d")).toBeNull();
    expect(apple.unpackAppleState("a b.c.d")).toBeNull();
  });

  it("무작위 값은 base64url 이고 매번 다르다", () => {
    const a = apple.randomToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(apple.randomToken()).not.toBe(a);
  });
});

describe("애플 로그인 주소", () => {
  it("form_post · code id_token · 이름 이메일 · 애플에는 nonce 의 SHA-256 을", () => {
    const u = new URL(
      apple.appleAuthorizeUrl({ clientId: "com.winnertoeic.web", redirectUri: "https://winnertoeic.com/auth/apple/callback", state: "S", nonceHash: apple.sha256Hex("raw") }),
    );
    expect(u.origin + u.pathname).toBe("https://appleid.apple.com/auth/authorize");
    expect(u.searchParams.get("response_mode")).toBe("form_post");
    expect(u.searchParams.get("response_type")).toBe("code id_token");
    expect(u.searchParams.get("scope")).toBe("name email");
    expect(u.searchParams.get("nonce")).toBe(apple.sha256Hex("raw"));
    expect(u.searchParams.get("nonce")).toMatch(/^[0-9a-f]{64}$/);
    expect(u.searchParams.get("redirect_uri")).toBe("https://winnertoeic.com/auth/apple/callback");
  });

  it("돌아올 주소는 정본 주소의 /auth/apple/callback — 애플 개발자 사이트에 이 주소를 그대로 넣는다", () => {
    expect(apple.appleRedirectUri()).toMatch(/\/auth\/apple\/callback$/);
  });

  it("웹 버튼은 Services ID 와 키가 다 있어야 그린다", () => {
    expect(apple.appleWebReady()).toBe(false);
    process.env.APPLE_SERVICES_ID = "com.winnertoeic.web";
    expect(apple.appleWebReady()).toBe(false);
    setKey();
    expect(apple.appleWebReady()).toBe(true);
  });
});

describe("애플이 처음 한 번 주는 이름", () => {
  it("한글이면 성 + 이름, 아니면 이름 성", () => {
    expect(apple.appleDisplayName("민수", "김")).toBe("김민수");
    expect(apple.appleDisplayName("Minsu", "Kim")).toBe("Minsu Kim");
    expect(apple.appleDisplayName(null, "김")).toBe("김");
    expect(apple.appleDisplayName(" ", undefined)).toBe("");
  });

  it("웹 폼의 user JSON 에서 이름만 꺼낸다 · 꼴이 틀리면 비운다", () => {
    expect(apple.appleUserName('{"name":{"firstName":"민수","lastName":"김"},"email":"a@privaterelay.appleid.com"}')).toEqual({ given: "민수", family: "김" });
    expect(apple.appleUserName("{bad")).toEqual({ given: null, family: null });
    expect(apple.appleUserName(null)).toEqual({ given: null, family: null });
    expect(apple.appleUserName('{"name":{"firstName":3}}')).toEqual({ given: null, family: null });
  });

  it("가입 정보 입력 화면은 Apple 이 준 이름 칸만 미리 넣는다 — 구글 · 카카오의 표시 이름(full_name)은 아니다", () => {
    expect(apple.APPLE_NAME_KEY).toBe("apple_name");
    const page = fs.readFileSync("src/app/(auth)/signup/complete/page.tsx", "utf8");
    expect(page).toContain("APPLE_NAME_KEY");
    expect(page).not.toContain("full_name");
  });
});

describe(".p8 키 — 로그인 client_secret 과 앱 푸시가 같이 쓴다", () => {
  it("줄바꿈을 \\n 으로 적은 값 · 머리줄 없는 본문도 읽는다", () => {
    const escaped = PEM.trim().replace(/\n/g, "\\n");
    expect(key.normalizePrivateKey(escaped)).toBe(PEM.trim());
    const body = PEM.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
    setKey(body);
    expect(key.appleKey()).not.toBeNull();
  });

  it("없거나 틀리면 null — 다른 로그인 · 웹 푸시는 그대로 돈다", () => {
    expect(key.appleKey()).toBeNull();
    setKey("not a key");
    expect(key.appleKey()).toBeNull();
  });

  it("ES256 JWT — 머리에 kid, 공개 키로 확인된다", () => {
    setKey();
    const k = key.appleKey()!;
    const t = decode(key.signAppleJwt(k, { iss: k.teamId, iat: 1 }));
    expect(t.header).toEqual({ alg: "ES256", kid: "KEY1234567" });
    expect(t.payload).toEqual({ iss: "TEAM123456", iat: 1 });
    expect(t.valid).toBe(true);
  });
});

describe("refresh token 받아 두기 · 탈퇴할 때 끊기", () => {
  it("authorization code → refresh token 을 apple_tokens 에 (client_secret 은 5분짜리 · aud 애플 · sub client_id)", async () => {
    setKey();
    const calls: { url: string; body: URLSearchParams }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, body: new URLSearchParams(String(init.body)) });
      return new Response(JSON.stringify({ refresh_token: "r-token", id_token: "x" }), { status: 200 });
    });
    await apple.keepAppleRefreshToken("u1", "code-1", "com.winnertoeic.web", "https://winnertoeic.com/auth/apple/callback");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://appleid.apple.com/auth/token");
    expect(calls[0].body.get("grant_type")).toBe("authorization_code");
    expect(calls[0].body.get("redirect_uri")).toBe("https://winnertoeic.com/auth/apple/callback");
    const secret = decode(calls[0].body.get("client_secret")!);
    expect(secret.valid).toBe(true);
    expect(secret.payload).toMatchObject({ iss: "TEAM123456", aud: "https://appleid.apple.com", sub: "com.winnertoeic.web" });
    expect(secret.payload.exp - secret.payload.iat).toBe(300);
    expect(h.upserts).toEqual([expect.objectContaining({ user_id: "u1", client_id: "com.winnertoeic.web", refresh_token: "r-token" })]);
  });

  it("키가 없거나 애플이 거절하면 저장하지 않고 조용히 — 로그인은 그대로 된다", async () => {
    const fetchSpy = vi.fn(async () => new Response("{}", { status: 400 }));
    vi.stubGlobal("fetch", fetchSpy);
    await apple.keepAppleRefreshToken("u1", "code-1", "com.winnertoeic.app");
    expect(fetchSpy).not.toHaveBeenCalled();
    setKey();
    await apple.keepAppleRefreshToken("u1", "code-1", "com.winnertoeic.app");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(h.upserts).toEqual([]);
  });

  it("탈퇴 — 계정들의 토큰을 받은 client_id 로 끊는다, 실패는 센다", async () => {
    setKey();
    h.rows = [
      { user_id: "me", client_id: "com.winnertoeic.app", refresh_token: "t-app" },
      { user_id: "old", client_id: "com.winnertoeic.web", refresh_token: "t-web" },
      { user_id: "other", client_id: "com.winnertoeic.app", refresh_token: "t-other" },
    ];
    const sent: URLSearchParams[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      expect(url).toBe("https://appleid.apple.com/auth/revoke");
      const body = new URLSearchParams(String(init.body));
      sent.push(body);
      return new Response("", { status: body.get("token") === "t-web" ? 400 : 200 });
    });
    expect(await apple.revokeAppleTokens(["me", "old"])).toEqual({ revoked: 1, failed: 1 });
    expect(sent.map((b) => [b.get("client_id"), b.get("token"), b.get("token_type_hint")])).toEqual([
      ["com.winnertoeic.app", "t-app", "refresh_token"],
      ["com.winnertoeic.web", "t-web", "refresh_token"],
    ]);
  });

  it("토큰을 못 읽으면 모두 실패로 센다 · 계정이 없으면 할 것이 없다", async () => {
    h.readError = { message: "down" };
    expect(await apple.revokeAppleTokens(["me"])).toEqual({ revoked: 0, failed: 1 });
    expect(await apple.revokeAppleTokens([])).toEqual({ revoked: 0, failed: 0 });
  });
});

describe("웹 콜백 · 화면", () => {
  const route = fs.readFileSync("src/app/auth/apple/callback/route.ts", "utf8");
  const actions = fs.readFileSync("src/app/(auth)/actions.ts", "utf8");

  it("쿠키의 state 와 폼의 state 가 같을 때만 신분 토큰으로 로그인한다 · nonce 는 쿠키의 원래 값", () => {
    expect(route.indexOf("state !== saved.state")).toBeGreaterThan(0);
    expect(route.indexOf("state !== saved.state")).toBeLessThan(route.indexOf("signInWithIdToken"));
    expect(route).toContain("nonce: saved.nonce");
    expect(route).toContain('"user_cancelled_authorize"');
  });

  it("state 쿠키는 SameSite=None · Secure · httpOnly — 애플이 다른 사이트에서 폼을 보낸다 · 콜백 경로 아래에만", () => {
    const set = actions.slice(actions.indexOf("(await cookies()).set(APPLE_STATE_COOKIE"));
    expect(set.slice(0, 300)).toMatch(/httpOnly: true,\s+secure: true,\s+sameSite: "none",\s+path: APPLE_STATE_PATH/);
    expect(apple.APPLE_STATE_PATH).toBe("/auth/apple");
    expect("/auth/apple/callback".startsWith(`${apple.APPLE_STATE_PATH}/`)).toBe(true);
  });

  it("웹은 Apple 을 맨 뒤에, 앱은 맨 앞에 (App Store 심사 4.8)", () => {
    const s = fs.readFileSync("src/app/(auth)/SocialLogin.tsx", "utf8");
    expect(s).toMatch(/inApp\s*\?\s*\[\.\.\.\(enabled\.apple \? \(\["apple"\] as const\) : \[\]\), \.\.\.social\]\s*:\s*\[\.\.\.social, \.\.\.\(enabled\.apple && appleWeb/);
    for (const page of ["src/app/(auth)/login/page.tsx", "src/app/(auth)/signup/page.tsx"]) {
      expect(fs.readFileSync(page, "utf8")).toMatch(/<SocialLogin enabled=\{social\} appleWeb=\{appleWebReady\(\)\} inApp=\{inApp\}/);
    }
  });
});
