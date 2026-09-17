import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { COMPLETE_PROFILE_PATH, isProfileIncomplete } from "@/lib/auth";

/** 이메일 인증 링크 · 간편 로그인(구글·카카오, PKCE) → 세션 교환 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next") ?? "/my";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/my";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // 간편 로그인으로 처음 들어온 계정은 실명·휴대폰이 없다 → 가입 정보부터 받는다 (requireUser 와 같은 판정)
      const { data: profile } = await supabase.from("profiles").select("name, phone").eq("id", data.user.id).maybeSingle();
      if (isProfileIncomplete(profile)) {
        return NextResponse.redirect(`${origin}${COMPLETE_PROFILE_PATH}?next=${encodeURIComponent(next)}`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Supabase 가 실패 사유를 error_description 으로 돌려준다. 카카오에서 이메일 제공을 거부하면
  // "Error getting user email from external provider" — 다시 시도하면 되는 일이라 따로 안내한다
  const reason = /email/i.test(searchParams.get("error_description") ?? "") ? "email" : "auth";
  return NextResponse.redirect(`${origin}/login?error=${reason}`);
}
