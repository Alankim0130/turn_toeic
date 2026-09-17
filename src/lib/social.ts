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
