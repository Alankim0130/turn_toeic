import "server-only";

import { COMPLETE_PROFILE_PATH, isProfileIncomplete } from "@/lib/auth";
import type { createClient } from "@/lib/supabase/server";

/**
 * 로그인을 마친 뒤 갈 곳 — 간편 로그인(카카오 · 구글 · Apple)으로 처음 들어온 계정은 실명 · 휴대폰이 없어 가입 정보 입력부터 (requireUser 와 같은 판정).
 * 프로필을 못 읽었으면(잠깐의 DB 오류) 가던 곳으로 — 그 화면의 requireUser 가 다시 보고, 정말 미완성이면 그때 입력 화면으로 보낸다 (2026-10-29 점검).
 * `/auth/callback`(이메일 인증 · 카카오 · 구글) · `/auth/apple/callback`(웹 Apple) · 앱 Apple 로그인이 함께 쓴다.
 */
export async function afterLoginPath(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, next: string): Promise<string> {
  const { data: profile, error } = await supabase.from("profiles").select("name, phone").eq("id", userId).maybeSingle();
  if (!error && isProfileIncomplete(profile)) return `${COMPLETE_PROFILE_PATH}?next=${encodeURIComponent(next)}`;
  return next;
}
