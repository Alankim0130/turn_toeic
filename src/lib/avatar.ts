/**
 * 간편 로그인(카카오·구글)이 준 프로필 사진 주소 (2026-09-22 Alan — "카카오톡 로그인을 한 친구들은
 * 프로필이 자동으로 들어오도록").
 *
 * 우리 DB 에 사진을 따로 저장하지 않는다 — 카카오·구글이 `auth.users.user_metadata` 에 넣어 준 주소를
 * 그대로 읽는다 (본인 세션이라 조회가 따로 필요 없고, 학생이 카카오에서 사진을 바꾸면 저절로 따라온다).
 * 명단·학생 관리는 `student_auth_info` 가 같은 값을 `avatar_url` 로 준다 (2026-10-02).
 *
 * **`https://` 로만 내보낸다.** `user_metadata` 는 본인이 `auth.updateUser({ data })` 로 바꿀 수 있는 칸이라
 * 아무 문자열이나 들어올 수 있다 — `javascript:`·`data:` 같은 것을 그대로 `<img src>` 에 넣지 않는다.
 * **카카오는 `http://` 주소를 준다** (k.kakaocdn.net · img1.kakaocdn.net). 2026-10-02 까지 `https://` 만 받아서
 * 카카오로 들어온 사람의 사진이 **한 장도 안 보였다** (Alan "프사를 가지고 온 프로필이 하나도 없어") —
 * 카카오 CDN 은 https 로도 같은 그림을 주므로 `http://` 는 `https://` 로 바꿔 쓴다.
 *
 * 키가 provider 마다 다르다: Supabase 가 맞춰 주는 `avatar_url` 이 1순위,
 * 구글 원본 `picture` · 카카오 원본 `profile_image_url` 이 그 다음이다.
 */
const KEYS = ["avatar_url", "picture", "profile_image_url"] as const;

/** 외부 사진 주소 한 개를 믿을 수 있는 https 주소로. 아니면 null */
export function safePhotoUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const url = value.trim();
  if (/^https:\/\/\S+$/i.test(url)) return url;
  if (/^http:\/\/\S+$/i.test(url)) return `https://${url.slice("http://".length)}`;
  return null;
}

export function profilePhotoUrl(meta: Record<string, unknown> | null | undefined): string | null {
  for (const key of KEYS) {
    const url = safePhotoUrl(meta?.[key]);
    if (url) return url;
  }
  return null;
}

/** 학생이 직접 올린 사진이 있으면 그것, 없으면 카카오·구글 사진 (2026-10-02 — 올린 사진이 앞선다) */
export function pickPhoto(uploaded: string | null | undefined, social: string | null | undefined): string | null {
  return uploaded || social || null;
}

/** 프로필 사진 버킷 (private). 경로는 `{uid}/{파일}` — 본인 폴더에만 올린다 */
export const AVATAR_BUCKET = "avatars";
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

/** 올라온 경로가 그 사람 폴더인지 (화면 값을 믿지 않는다) */
export function isOwnAvatarPath(path: unknown, uid: string): path is string {
  return typeof path === "string" && path.startsWith(`${uid}/`) && !path.includes("..") && path.length > uid.length + 1;
}
