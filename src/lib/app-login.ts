import { APP_AUTH_CALLBACK } from "@/lib/native-app";
import { isSocialProvider } from "@/lib/social";

/**
 * 아이폰 앱의 카카오 · 구글 로그인 길 (2026-10-30 — `startAppSocialLogin`). 앱 화면(WKWebView)에서는 구글이 로그인을 막아서
 * 앱 안 브라우저 창(ASWebAuthenticationSession)으로 연다. 그 창은 앱 화면과 쿠키를 나누지 않으므로 세션은 앱 화면에서 만든다:
 *
 *   1. 앱 화면 → 서버 액션 `startAppSocialLogin` — PKCE 검증값 쿠키를 **앱 화면에** 두고 로그인 주소를 받는다
 *   2. 로그인 창 → `/auth/app-start?to=…` → Supabase → 카카오 · 구글 → Supabase → `/auth/app-callback?code=…`
 *   3. `/auth/app-callback` 이 `winnertoeic://auth-callback?code=…` 로 넘긴다 → 로그인 창이 닫히고 앱이 그 주소를 받는다
 *   4. 앱 화면 → `/auth/callback?code=…` — 검증값 쿠키가 있는 곳에서 세션으로 바꾼다 (웹 간편 로그인과 같은 끝)
 *
 * code 가 앱 주소로 지나가도 검증값이 없으면 쓸 수 없다 (그 주소를 가로챈 다른 앱이 있어도).
 */

/** 로그인 창을 여는 우리 주소 — 아이폰이 "…로그인을 위해 'winnertoeic.com' 을 사용하려고 합니다" 로 묻게 (Supabase 주소로 열면 그 주소가 뜬다) */
export const APP_LOGIN_START = "/auth/app-start";

/** `/auth/app-callback` 이 앱으로 넘기는 값 — 이 밖의 것은 넘기지 않는다 */
export const APP_CALLBACK_PARAMS = ["code", "next", "error", "error_code", "error_description"] as const;

/**
 * `/auth/app-start` 가 보내도 되는 곳 — **우리 Supabase 의 로그인 주소 · 카카오 · 구글만**. 그 밖은 null (아무 곳으로나 보내는 길이 되지 않게).
 */
export function appLoginTarget(to: string | null | undefined, supabaseUrl: string | null | undefined): string | null {
  if (!to || !supabaseUrl || to.length > 4000) return null;
  try {
    const target = new URL(to);
    const expected = `${supabaseUrl.replace(/\/+$/, "")}/auth/v1/authorize`;
    if (`${target.origin}${target.pathname}` !== expected) return null;
    if (!isSocialProvider(target.searchParams.get("provider"))) return null;
    return target.toString();
  } catch {
    return null;
  }
}

/** `/auth/app-callback` 의 물음표 뒤 → 앱으로 넘길 주소 (`winnertoeic://auth-callback?…`) */
export function appCallbackUrl(search: URLSearchParams): string {
  const out = new URLSearchParams();
  for (const key of APP_CALLBACK_PARAMS) {
    const v = search.get(key);
    if (v) out.set(key, v.slice(0, 2000));
  }
  const q = out.toString();
  return q ? `${APP_AUTH_CALLBACK}?${q}` : APP_AUTH_CALLBACK;
}

/**
 * 로그인 창이 돌려준 앱 주소 → 앱 화면이 열 `/auth/callback?…` (세션 교환 · 실패 안내는 그 라우트가 웹과 똑같이 한다).
 * 우리 앱 주소가 아니면 null.
 */
export function appCallbackPath(url: string | null | undefined): string | null {
  if (!url || !(url === APP_AUTH_CALLBACK || url.startsWith(`${APP_AUTH_CALLBACK}?`))) return null;
  let search: URLSearchParams;
  try {
    search = new URL(url).searchParams;
  } catch {
    return null;
  }
  const out = new URLSearchParams();
  for (const key of APP_CALLBACK_PARAMS) {
    const v = search.get(key);
    if (v) out.set(key, v);
  }
  const q = out.toString();
  return q ? `/auth/callback?${q}` : "/auth/callback";
}
