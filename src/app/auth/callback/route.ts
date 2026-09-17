import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { COMPLETE_PROFILE_PATH, isProfileIncomplete } from "@/lib/auth";

/** 이메일 인증 링크 · 구글 로그인(PKCE) → 세션 교환 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next") ?? "/my";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/my";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // 구글로 처음 들어온 계정은 실명·휴대폰이 없다 → 가입 정보부터 받는다 (requireUser 와 같은 판정)
      const { data: profile } = await supabase.from("profiles").select("name, phone").eq("id", data.user.id).maybeSingle();
      if (isProfileIncomplete(profile)) {
        return NextResponse.redirect(`${origin}${COMPLETE_PROFILE_PATH}?next=${encodeURIComponent(next)}`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }
  return NextResponse.redirect(`${origin}/login?error=auth`);
}
