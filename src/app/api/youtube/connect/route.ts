import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getSessionProfile, isStaff } from "@/lib/auth";
import { youtubeAuthUrl, youtubeConfigured } from "@/lib/youtube";

/**
 * 강사 유튜브 채널 연결 시작 (2026-09-21). 강사·관리자만. 구글 동의 화면으로 보낸다.
 * 돌아올 주소는 **지금 연 주소의 origin** 이다 — 구글 클라우드에 `https://winnertoeic.com/api/youtube/callback`
 * (로컬은 `http://localhost:3000/api/youtube/callback`) 이 승인된 리디렉션 URI 로 들어 있어야 한다.
 */
export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const { user, profile } = await getSessionProfile();
  if (!user) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent("/admin/live-channels")}`, origin));
  // 진짜 등급으로 본다 (테스트 등급을 켠 스태프도 연결할 수 있다 — 관리자 화면 출입과 같다)
  if (!isStaff(profile?.role)) return NextResponse.redirect(new URL("/my?denied=admin", origin));
  if (!youtubeConfigured()) return NextResponse.redirect(new URL("/admin/live-channels?error=config", origin));

  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(youtubeAuthUrl(`${origin}/api/youtube/callback`, state));
  // 돌아왔을 때 같은 사람·같은 요청인지 대조한다 (10분)
  res.cookies.set("yt_oauth_state", `${state}.${user.id}`, {
    httpOnly: true,
    secure: origin.startsWith("https://"),
    sameSite: "lax",
    maxAge: 600,
    path: "/api/youtube",
  });
  return res;
}
