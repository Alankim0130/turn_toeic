import { NextResponse, type NextRequest } from "next/server";
import { getSessionProfile, isStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { exchangeCode, myChannel } from "@/lib/youtube";

/**
 * 구글 동의를 마치고 돌아오는 곳 (2026-09-21). 상태 쿠키 · 같은 강사 세션을 확인하고,
 * 토큰을 받아 **그 계정의 유튜브 채널** 을 `youtube_channels` 에 저장한다 (service_role — 토큰 칸은 학생·강사 세션이 못 읽는다).
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const origin = url.origin;
  const back = (q: string) => {
    const res = NextResponse.redirect(new URL(`/admin/live-channels?${q}`, origin));
    res.cookies.set("yt_oauth_state", "", { path: "/api/youtube", maxAge: 0 });
    return res;
  };

  if (url.searchParams.get("error")) return back("error=denied");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookie = req.cookies.get("yt_oauth_state")?.value ?? "";
  const [cookieState, cookieUser] = cookie.split(".");
  if (!code || !state || !cookieState || cookieState !== state) return back("error=state");

  const { user, profile } = await getSessionProfile();
  if (!user || user.id !== cookieUser || !isStaff(profile?.role)) return back("error=session");

  const tokens = await exchangeCode(code, `${origin}/api/youtube/callback`);
  if (!tokens.access_token) return back("error=token");
  // 예전에 연결했던 계정은 refresh token 을 다시 안 줄 수 있다 — 구글 계정의 "타사 앱 액세스" 에서 권한을 지우고 다시 연결해야 한다
  if (!tokens.refresh_token) return back("error=no_refresh");

  const channel = await myChannel(tokens.access_token);
  if (!channel) return back("error=no_channel");

  const admin = createAdminClient();
  const { data: taken } = await admin.from("youtube_channels").select("user_id").eq("channel_id", channel.id).maybeSingle();
  if (taken && taken.user_id !== user.id) return back("error=taken");

  const now = new Date();
  const { error } = await admin.from("youtube_channels").upsert(
    {
      user_id: user.id,
      channel_id: channel.id,
      channel_title: channel.title,
      refresh_token: tokens.refresh_token,
      access_token: tokens.access_token,
      access_token_expires_at: new Date(now.getTime() + Math.max(60, (tokens.expires_in ?? 3600) - 60) * 1000).toISOString(),
      linked_at: now.toISOString(),
      last_error: null,
      last_error_at: null,
    },
    { onConflict: "user_id" },
  );
  if (error) {
    console.error("[youtube-callback]", error.message);
    return back("error=save");
  }
  return back("ok=linked");
}
