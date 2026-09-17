import "server-only";
import { NO_SOCIAL_LOGINS, SOCIAL_PROVIDERS, type SocialLogins } from "@/lib/social";

/**
 * Supabase Auth 에 켜 둔 간편 로그인 (2026-09-17 구글 · 카카오).
 *
 * 구글은 Google Cloud, 카카오는 Kakao Developers 에서 받은 키를 Supabase 대시보드
 * (Authentication → Sign In / Providers)에 넣어야 켜진다. 켜기 전에는 버튼을 아예 보이지 않게 한다 —
 * 눌러 봐야 Supabase 의 오류 화면으로 떨어진다.
 * 공개 설정 엔드포인트라 anon 키로 읽고 5분 캐시한다. 못 읽으면 전부 꺼진 것으로 본다.
 */
export async function getSocialLogins(): Promise<SocialLogins> {
  try {
    // 주소·키가 없으면(로컬에서 env 없이 빌드할 때) 물어볼 곳이 없다
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return NO_SOCIAL_LOGINS;

    const res = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: key },
      next: { revalidate: 300 },
      // 인증 서버가 느려도 로그인 화면은 떠야 한다 — 3초 안에 답이 없으면 버튼 없이 이메일 폼만 보여 준다
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return NO_SOCIAL_LOGINS;
    const json = (await res.json()) as { external?: Record<string, boolean> };
    return Object.fromEntries(SOCIAL_PROVIDERS.map((p) => [p, json.external?.[p] === true])) as SocialLogins;
  } catch {
    return NO_SOCIAL_LOGINS;
  }
}
