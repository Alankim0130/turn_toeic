import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/safe-next";
import { createClient } from "@/lib/supabase/server";
import { afterLoginPath } from "@/lib/after-login";

/**
 * 이메일 인증 링크 · 간편 로그인(구글·카카오, PKCE) → 세션 교환.
 * 아이폰 앱의 카카오 · 구글 로그인도 여기서 끝난다 — 앱 안 로그인 창이 `/auth/app-callback` 으로 앱에 넘긴 code 를 앱 화면이 이리로 가져온다
 * (PKCE 검증값 쿠키는 앱 화면에 있다 — `startAppSocialLogin`).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next") ?? "/my";
  const next = safeNextPath(nextParam);

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // 간편 로그인으로 처음 들어온 계정은 실명·휴대폰이 없다 → 가입 정보부터 받는다 (after-login.ts)
      return NextResponse.redirect(`${origin}${await afterLoginPath(supabase, data.user.id, next)}`);
    }
  }

  // Supabase 가 실패 사유를 error_description 으로 돌려준다. 카카오에서 이메일 제공을 거부하면
  // "Error getting user email from external provider" — 다시 시도하면 되는 일이라 따로 안내한다
  const reason = /email/i.test(searchParams.get("error_description") ?? "") ? "email" : "auth";
  return NextResponse.redirect(`${origin}/login?error=${reason}`);
}
