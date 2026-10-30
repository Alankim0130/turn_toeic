import { NextResponse, type NextRequest } from "next/server";
import { appCallbackUrl } from "@/lib/app-login";

/**
 * 아이폰 앱의 카카오 · 구글 로그인이 끝나 Supabase 가 돌려보내는 곳 (2026-10-30 — `src/lib/app-login.ts`).
 * 이 요청은 앱 안 브라우저 창에서 오고 그 창에는 PKCE 검증값이 없다 — 그래서 여기서 세션으로 바꾸지 않고 code 를 앱으로 넘긴다
 * (`winnertoeic://auth-callback?code=…` — 로그인 창이 닫히고 앱 화면이 `/auth/callback` 으로 가져간다).
 */
export function GET(request: NextRequest) {
  return NextResponse.redirect(appCallbackUrl(request.nextUrl.searchParams), 302);
}
