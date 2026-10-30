import { NextResponse, after, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { afterLoginPath } from "@/lib/after-login";
import {
  APPLE_STATE_COOKIE,
  APPLE_STATE_PATH,
  appleRedirectUri,
  appleServicesId,
  appleUserName,
  keepAppleRefreshToken,
  rememberAppleName,
  unpackAppleState,
} from "@/lib/apple-auth";
import { safeNextPath } from "@/lib/safe-next";
import { site } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";

/**
 * Apple 로 로그인 — 웹의 끝 (2026-10-30 — `src/lib/apple-auth.ts`). 애플이 로그인 화면에서 이 주소로 폼을 보낸다 (form_post · POST).
 * `signInWithAppleWeb` 이 둔 쿠키의 state 가 폼의 state 와 같을 때만 신분 토큰(id_token)으로 로그인한다 — 남이 만든 폼으로 로그인시키지 못하게.
 * 애플 개발자 사이트 Services ID 의 Return URLs 에 이 주소(`appleRedirectUri`)를 그대로 넣는다.
 * 실패하면 로그인 화면(`?error=apple`), 애플 화면에서 취소했으면 말없이 로그인 화면으로.
 */
export async function POST(request: NextRequest) {
  const jar = await cookies();
  const saved = unpackAppleState(jar.get(APPLE_STATE_COOKIE)?.value);
  jar.set(APPLE_STATE_COOKIE, "", { httpOnly: true, secure: true, sameSite: "none", path: APPLE_STATE_PATH, maxAge: 0 });

  const next = safeNextPath(saved?.next);
  const toLogin = (error?: "apple") =>
    NextResponse.redirect(new URL(`/login?${error ? `error=${error}&` : ""}next=${encodeURIComponent(next)}`, site.url), 303);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return toLogin("apple");
  }
  const failure = form.get("error");
  if (typeof failure === "string" && failure) return failure === "user_cancelled_authorize" ? toLogin() : toLogin("apple");

  const state = form.get("state");
  const idToken = form.get("id_token");
  if (!saved || typeof state !== "string" || state !== saved.state || typeof idToken !== "string" || !idToken || idToken.length > 8000) {
    return toLogin("apple");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithIdToken({ provider: "apple", token: idToken, nonce: saved.nonce });
  if (error || !data.user) {
    console.error("[apple] 웹 로그인 실패", error?.message ?? "user 없음");
    return toLogin("apple");
  }
  const name = appleUserName(form.get("user"));
  await rememberAppleName(supabase, data.user, name.given, name.family);

  const code = form.get("code");
  const clientId = appleServicesId();
  if (clientId && typeof code === "string" && code && code.length <= 4000) {
    const userId = data.user.id;
    after(() => keepAppleRefreshToken(userId, code, clientId, appleRedirectUri()));
  }
  return NextResponse.redirect(new URL(await afterLoginPath(supabase, data.user.id, next), site.url), 303);
}
