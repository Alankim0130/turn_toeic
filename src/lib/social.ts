/**
 * 간편 로그인(외부 로그인) 목록 (2026-09-17 Alan 요청 — 구글, 이어서 카카오).
 * 순서가 곧 버튼 순서다 — 카카오를 먼저 둔다 (수강생 대부분이 카카오를 쓴다).
 * 여기에 값을 더하면 서버 액션이 받아 주는 provider 가 늘어난다. Supabase 의 provider 이름과 같아야 한다.
 */
export const SOCIAL_PROVIDERS = ["kakao", "google"] as const;
export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];
export type SocialLogins = Record<SocialProvider, boolean>;

/** 폼에서 넘어온 provider 값 검사 — 목록에 없는 값으로 Supabase 를 부르지 않는다 */
export const isSocialProvider = (v: unknown): v is SocialProvider =>
  typeof v === "string" && (SOCIAL_PROVIDERS as readonly string[]).includes(v);

export const NO_SOCIAL_LOGINS: SocialLogins = { kakao: false, google: false };

/**
 * 로그인 화면이 그릴 간편 로그인 — 카카오 · 구글에 **Apple** 을 더한 것 (2026-10-30 아이폰 앱 — App Store 심사 4.8).
 * Apple 은 Supabase OAuth 가 아니라 애플이 준 신분 토큰으로 들어가서(`src/lib/apple-auth.ts`) `SOCIAL_PROVIDERS` 에 넣지 않는다 —
 * 넣으면 `signInWithSocial` 이 Apple 을 OAuth 로 보내 Supabase 의 Secret Key(6개월마다 바꿔야 한다)를 요구한다.
 */
export type LoginOptions = SocialLogins & { apple: boolean };
