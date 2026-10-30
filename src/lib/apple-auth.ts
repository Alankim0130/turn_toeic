import "server-only";

import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { appleBundleId, appleKey, signAppleJwt } from "@/lib/apple-key";
import { createAdminClient } from "@/lib/supabase/admin";
import { site } from "@/lib/site";

/**
 * Apple 로 로그인 (2026-10-30 Alan — "애플로그인을 추가해줘. 그리고 홈페이지에도 애플로그인이 추가되어야해. Pc로 불라방을 듣는학생들은
 * 홈페이지로 접속할 수 있어서"). 카카오 · 구글이 있는 앱은 App Store 심사 4.8 로 Apple 로그인이 꼭 있어야 한다.
 *
 * 두 길이 같은 곳에서 끝난다 — 애플이 준 신분 토큰(id_token)을 Supabase `signInWithIdToken` 에 넘긴다:
 * - **앱**: 아이폰의 Apple 로그인 창 (`WinnerToeicPlugin.signInWithApple`) → 서버 액션 `signInWithAppleApp`
 * - **웹**: 서버 액션 `signInWithAppleWeb` 이 애플 로그인 화면으로 보내고 → 애플이 `/auth/apple/callback` 으로 폼을 보낸다(form_post)
 * 그래서 Supabase 의 Apple 설정에는 **Client IDs**(웹 Services ID · 앱 번들 ID)만 넣는다 — 6개월마다 바꿔야 하는 Secret Key 칸은 비워 둔다.
 * nonce: 원래 값은 서버가 Supabase 에 넘기고, 애플에는 그 SHA-256 을 준다 (Supabase 가 대조한다).
 *
 * **탈퇴하면 애플 토큰을 끊는다** (App Store 심사 5.1.1(v)) — 그러려면 로그인할 때 애플의 refresh token 을 받아 둬야 해서
 * 로그인 직후 authorization code 를 바꿔 `apple_tokens` 에 둔다 (서비스 롤만 읽는 표). client_secret 은 .p8 키로 그때그때 만든다(`apple-key.ts`).
 */

const APPLE = "https://appleid.apple.com";

/** 웹 Apple 로그인의 client_id — 애플 개발자 사이트의 Services ID (예: com.winnertoeic.web). 없으면 웹 버튼을 그리지 않는다 */
export function appleServicesId(): string | null {
  return process.env.APPLE_SERVICES_ID?.trim() || null;
}

/** 웹 버튼을 그려도 되나 — Services ID 와 키가 다 있어야 애플 화면에서 돌아와 로그인을 마친다 */
export function appleWebReady(): boolean {
  return appleServicesId() !== null && appleKey() !== null;
}

/** 애플이 웹 로그인 뒤 폼을 보내는 주소 — 애플 개발자 사이트 Services ID 의 Return URLs 에 **이 주소 그대로** 넣는다 */
export function appleRedirectUri(): string {
  return `${site.url}/auth/apple/callback`;
}

/** 웹 로그인 사이 state · nonce · 돌아갈 곳을 두는 쿠키 — 애플이 다른 사이트에서 폼을 보내므로 SameSite=None 이어야 돌아온다 */
export const APPLE_STATE_COOKIE = "wt-apple-login";
export const APPLE_STATE_PATH = "/auth/apple";

export function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function packAppleState(v: { state: string; nonce: string; next: string }): string {
  return `${v.state}.${v.nonce}.${Buffer.from(v.next).toString("base64url")}`;
}

export function unpackAppleState(raw: string | undefined | null): { state: string; nonce: string; next: string } | null {
  const parts = (raw ?? "").split(".");
  if (parts.length !== 3 || parts.some((p) => !/^[A-Za-z0-9_-]+$/.test(p))) return null;
  return { state: parts[0], nonce: parts[1], next: Buffer.from(parts[2], "base64url").toString("utf8") };
}

export function appleAuthorizeUrl(v: { clientId: string; redirectUri: string; state: string; nonceHash: string }): string {
  const params = new URLSearchParams({
    client_id: v.clientId,
    redirect_uri: v.redirectUri,
    response_type: "code id_token",
    response_mode: "form_post",
    scope: "name email",
    state: v.state,
    nonce: v.nonceHash,
  });
  return `${APPLE}/auth/authorize?${params}`;
}

/**
 * 애플이 처음 한 번만 주는 이름 → 화면에 넣어 둘 이름. 한글이면 성 + 이름을 붙여(김민수), 아니면 이름 성(Minsu Kim).
 * **실명 칸에 넣어 두기만 한다** — 학생이 수강증의 이름과 같게 고친다 (가입 정보 입력 화면).
 */
export function appleDisplayName(given?: string | null, family?: string | null): string {
  const g = (given ?? "").trim();
  const f = (family ?? "").trim();
  if (!g && !f) return "";
  return /[가-힣]/.test(`${g}${f}`) ? `${f}${g}` : `${g} ${f}`.trim();
}

/**
 * 애플이 준 이름을 둘 사용자 정보(user_metadata) 칸. 가입 정보 입력 화면이 **이 칸만** 실명 칸에 미리 넣는다 —
 * 구글 · 카카오가 넣는 `full_name` · `name` 은 표시 이름(닉네임 · 영문)이라 수강증 대조 실명이 아니어서 미리 넣지 않는다 (도메인 규칙 3 "로그인 방법").
 * 본인이 바꿀 수 있는 칸이라 미리 넣어 두기만 한다 — 저장은 학생이 확인하고 누른다.
 */
export const APPLE_NAME_KEY = "apple_name";

/** 애플이 이름을 줬고(처음 로그인 한 번만 준다) 아직 적어 둔 이름이 없으면 사용자 정보에 둔다 */
export async function rememberAppleName(supabase: SupabaseClient, user: User, given?: string | null, family?: string | null) {
  const name = appleDisplayName(given, family).slice(0, 40);
  if (!name || typeof user.user_metadata?.[APPLE_NAME_KEY] === "string") return;
  const { error } = await supabase.auth.updateUser({ data: { [APPLE_NAME_KEY]: name } });
  if (error) console.error("[apple] 이름을 적어 두지 못했어요", error.message);
}

/** 웹 로그인에서 애플이 처음 한 번 폼으로 주는 `user` (JSON — {"name":{"firstName","lastName"},"email"}) 의 이름 */
export function appleUserName(raw: unknown): { given: string | null; family: string | null } {
  const none = { given: null, family: null };
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 2000) return none;
  try {
    const name = (JSON.parse(raw) as { name?: { firstName?: unknown; lastName?: unknown } } | null)?.name;
    const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 40) : null);
    return { given: text(name?.firstName), family: text(name?.lastName) };
  } catch {
    return none;
  }
}

/** 애플 서버에 나를 밝히는 값(client_secret) — .p8 키로 만든 5분짜리 JWT */
function clientSecret(clientId: string): string | null {
  const key = appleKey();
  if (!key) return null;
  const now = Math.floor(Date.now() / 1000);
  return signAppleJwt(key, { iss: key.teamId, iat: now, exp: now + 300, aud: APPLE, sub: clientId });
}

/**
 * 로그인 직후 authorization code → 애플 refresh token 을 받아 둔다 (탈퇴할 때 끊으려고). 못 받아도 로그인은 그대로 된다 — 로그만 남긴다.
 * clientId: 웹은 Services ID(+ redirectUri 꼭), 앱은 번들 ID. 끊을 때도 같은 client_id 여야 한다.
 */
export async function keepAppleRefreshToken(userId: string, code: string, clientId: string, redirectUri?: string): Promise<void> {
  const secret = clientSecret(clientId);
  if (!secret || !code) return;
  try {
    const body = new URLSearchParams({ grant_type: "authorization_code", code, client_id: clientId, client_secret: secret });
    if (redirectUri) body.set("redirect_uri", redirectUri);
    const res = await fetch(`${APPLE}/auth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    const json = (await res.json().catch(() => ({}))) as { refresh_token?: string; error?: string };
    if (!res.ok || !json.refresh_token) {
      console.error("[apple] refresh token 을 받지 못했어요", res.status, json.error ?? "");
      return;
    }
    const { error } = await createAdminClient()
      .from("apple_tokens")
      .upsert({ user_id: userId, client_id: clientId, refresh_token: json.refresh_token, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (error) console.error("[apple] refresh token 을 저장하지 못했어요", error.message);
  } catch (error) {
    console.error("[apple] refresh token 요청 실패", (error as Error).message);
  }
}

/** 앱 Apple 로그인의 client_id — 앱의 번들 ID */
export const appleAppClientId = appleBundleId;

/**
 * 탈퇴하는 계정들의 애플 토큰을 끊는다 (App Store 심사 5.1.1(v)) — 끊으면 그 사람의 '애플 ID 를 사용하는 앱' 목록에서도 빠진다.
 * 토큰이 없으면(Apple 로그인을 안 씀 · 받아 두지 못함) 할 것이 없다. 끊지 못해도 탈퇴는 이어 간다 — 몇 개를 못 끊었는지 돌려준다.
 */
export async function revokeAppleTokens(userIds: readonly string[]): Promise<{ revoked: number; failed: number }> {
  if (userIds.length === 0) return { revoked: 0, failed: 0 };
  const { data, error } = await createAdminClient().from("apple_tokens").select("user_id, client_id, refresh_token").in("user_id", [...userIds]);
  if (error) {
    console.error("[apple] 끊을 토큰을 읽지 못했어요", error.message);
    return { revoked: 0, failed: userIds.length };
  }
  let revoked = 0;
  let failed = 0;
  for (const row of data ?? []) {
    const secret = clientSecret(row.client_id);
    if (!secret) {
      failed++;
      continue;
    }
    try {
      const res = await fetch(`${APPLE}/auth/revoke`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: row.client_id, client_secret: secret, token: row.refresh_token, token_type_hint: "refresh_token" }),
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) revoked++;
      else {
        failed++;
        console.error("[apple] 토큰을 끊지 못했어요", res.status);
      }
    } catch (error) {
      failed++;
      console.error("[apple] 토큰 끊기 요청 실패", (error as Error).message);
    }
  }
  return { revoked, failed };
}
