import "server-only";

/**
 * Supabase Auth 에 켜 둔 외부 로그인 (2026-09-17 구글 로그인).
 *
 * 구글은 Google Cloud 의 클라이언트 ID·시크릿을 Supabase 대시보드(Authentication → Providers → Google)에
 * 넣어야 켜진다. 켜기 전에는 버튼을 아예 보이지 않게 한다 — 눌러 봐야 Supabase 의 오류 화면으로 떨어진다.
 * 공개 설정 엔드포인트라 anon 키로 읽고 5분 캐시한다. 못 읽으면 꺼진 것으로 본다.
 */
export async function isGoogleLoginEnabled(): Promise<boolean> {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
      next: { revalidate: 300 },
    });
    if (!res.ok) return false;
    const json = (await res.json()) as { external?: Record<string, boolean> };
    return json.external?.google === true;
  } catch {
    return false;
  }
}
