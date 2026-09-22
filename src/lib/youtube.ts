import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { notifyUser } from "@/lib/push";

/**
 * 강사 유튜브 채널 연결 · 진행 중 방송 조회 (2026-09-21 — 불라방 자동 연결, 마이그레이션 20260921120500).
 *
 * 구글 동의는 **읽기 권한(youtube.readonly) 하나만** 받는다. 토큰은 `youtube_channels` 에 두고 service_role 만 읽는다.
 * 키는 `YOUTUBE_CLIENT_ID` · `YOUTUBE_CLIENT_SECRET` (Vercel 환경변수). **없으면 연결 버튼 대신 설정 안내를 보여 주고 크론은 건너뛴다.**
 *
 * 첫토익에서 겪은 것 (문서 01): 구글 동의 화면이 "테스트" 상태면 연결이 **7일 뒤 끊긴다** — 게시(프로덕션) 상태로 둘 것.
 * 이미 연결했던 계정은 refresh token 을 다시 안 줄 수 있어 `access_type=offline` + `prompt=consent` 를 쓴다.
 * access token 은 만료 5분 전까지 기억해 두고, 유튜브가 401·403 을 주면 한 번만 새로 받는다 (토큰 엔드포인트를 두들기지 않게).
 */

export const YOUTUBE_SCOPE = "https://www.googleapis.com/auth/youtube.readonly";

export function youtubeConfigured() {
  return !!process.env.YOUTUBE_CLIENT_ID && !!process.env.YOUTUBE_CLIENT_SECRET;
}

export function youtubeAuthUrl(redirectUri: string, state: string) {
  const q = new URLSearchParams({
    client_id: process.env.YOUTUBE_CLIENT_ID ?? "",
    redirect_uri: redirectUri,
    response_type: "code",
    scope: YOUTUBE_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

type TokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number; error?: string; error_description?: string };

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.YOUTUBE_CLIENT_ID ?? "", client_secret: process.env.YOUTUBE_CLIENT_SECRET ?? "", ...body }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  return (await res.json().catch(() => ({ error: `HTTP ${res.status}` }))) as TokenResponse;
}

export function exchangeCode(code: string, redirectUri: string) {
  return tokenRequest({ code, redirect_uri: redirectUri, grant_type: "authorization_code" });
}

/** 연결한 계정의 채널 (브랜드 계정이면 동의할 때 고른 채널) */
export async function myChannel(accessToken: string): Promise<{ id: string; title: string } | null> {
  const res = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const json = (await res.json().catch(() => null)) as { items?: { id?: string; snippet?: { title?: string } }[] } | null;
  const ch = json?.items?.[0];
  return ch?.id ? { id: ch.id, title: ch.snippet?.title ?? "" } : null;
}

/** 지금 진행 중인 내 방송 (일부공개 포함 — 채널 주인의 토큰이라 보인다) */
export async function activeBroadcasts(accessToken: string): Promise<{ status: number; json: unknown }> {
  const res = await fetch(
    "https://www.googleapis.com/youtube/v3/liveBroadcasts?part=id,snippet,status&broadcastStatus=active&broadcastType=all&maxResults=10",
    { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store", signal: AbortSignal.timeout(10_000) },
  );
  return { status: res.status, json: await res.json().catch(() => null) };
}

/** 연결을 끊을 때 구글 쪽 권한도 거둔다 (실패해도 우리 쪽 연결은 지운다) */
export async function revokeToken(token: string) {
  try {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    // 구글이 이미 거뒀거나 닿지 않는다 — 우리 쪽 행을 지우는 것으로 충분하다
  }
}

export type ChannelRow = {
  user_id: string;
  channel_title: string | null;
  refresh_token: string;
  access_token: string | null;
  access_token_expires_at: string | null;
  last_error: string | null;
};

/**
 * 이 채널의 access token. 만료 5분 전이면 새로 받는다. 연결이 끊겼으면(invalid_grant) 오류를 남기고
 * **처음 끊겼을 때 한 번** 강사에게 알린 뒤 null.
 */
export async function channelAccessToken(row: ChannelRow, force = false): Promise<string | null> {
  const fresh = row.access_token && row.access_token_expires_at && new Date(row.access_token_expires_at).getTime() - Date.now() > 5 * 60_000;
  if (fresh && !force) return row.access_token;

  const admin = createAdminClient();
  const t = await tokenRequest({ refresh_token: row.refresh_token, grant_type: "refresh_token" });
  if (!t.access_token) {
    const reason =
      t.error === "invalid_grant" ? "유튜브 연결이 끊겼어요. 불라방 자동 연결 화면에서 다시 연결해 주세요." : `토큰을 받지 못했어요 (${t.error ?? "알 수 없음"})`;
    await admin.from("youtube_channels").update({ last_error: reason, last_error_at: new Date().toISOString() }).eq("user_id", row.user_id);
    if (!row.last_error) {
      await notifyUser(row.user_id, "live_detected", {
        title: "유튜브 연결을 확인해 주세요",
        body: `${reason} 그동안은 반 상세에서 링크를 직접 넣어 주세요.`,
        url: "/admin/live-channels",
        tag: "youtube-link-error",
      });
    }
    row.last_error = reason;
    return null;
  }
  const expires = new Date(Date.now() + Math.max(60, (t.expires_in ?? 3600) - 60) * 1000).toISOString();
  await admin.from("youtube_channels").update({ access_token: t.access_token, access_token_expires_at: expires }).eq("user_id", row.user_id);
  row.access_token = t.access_token;
  row.access_token_expires_at = expires;
  return t.access_token;
}
