/**
 * 간편 로그인(카카오·구글)이 준 프로필 사진 주소 (2026-09-22 Alan — "카카오톡 로그인을 한 친구들은
 * 프로필이 자동으로 들어오도록").
 *
 * 우리 DB 에 사진을 따로 저장하지 않는다 — 카카오·구글이 `auth.users.user_metadata` 에 넣어 준 주소를
 * 그대로 읽는다 (본인 세션이라 조회가 따로 필요 없고, 학생이 카카오에서 사진을 바꾸면 저절로 따라온다).
 *
 * **`https://` 만 받는다.** `user_metadata` 는 본인이 `auth.updateUser({ data })` 로 바꿀 수 있는 칸이라
 * 아무 문자열이나 들어올 수 있다 — `javascript:`·`data:` 같은 것을 그대로 `<img src>` 에 넣지 않는다.
 * (자기 화면에만 보이는 값이라 피해는 작지만, 값을 믿을 이유도 없다.)
 *
 * 키가 provider 마다 다르다: Supabase 가 맞춰 주는 `avatar_url` 이 1순위,
 * 구글 원본 `picture` · 카카오 원본 `profile_image_url` 이 그 다음이다.
 */
const KEYS = ["avatar_url", "picture", "profile_image_url"] as const;

export function profilePhotoUrl(meta: Record<string, unknown> | null | undefined): string | null {
  for (const key of KEYS) {
    const value = meta?.[key];
    if (typeof value !== "string") continue;
    const url = value.trim();
    if (/^https:\/\/\S+$/i.test(url)) return url;
  }
  return null;
}
