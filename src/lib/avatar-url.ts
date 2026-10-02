import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { AVATAR_BUCKET } from "./avatar";

type Client = Awaited<ReturnType<typeof createClient>>;

/**
 * 올린 프로필 사진의 서명 URL (2026-10-02). 버킷이 private 이라 보는 사람의 세션으로 서명한다 —
 * storage 정책(본인·크루)이 못 보는 사람에게는 주소를 내주지 않는다. 한 시간 유효 (화면을 다시 그리면 새로 받는다).
 * 여러 장은 한 번에 (명단).
 */
export async function signedAvatarUrls(supabase: Client, paths: readonly (string | null | undefined)[]): Promise<Map<string, string>> {
  const list = [...new Set(paths.filter((p): p is string => !!p))];
  const out = new Map<string, string>();
  if (list.length === 0) return out;
  const { data } = await supabase.storage.from(AVATAR_BUCKET).createSignedUrls(list, 60 * 60);
  for (const row of data ?? []) if (row.path && row.signedUrl && !row.error) out.set(row.path, row.signedUrl);
  return out;
}

export async function signedAvatarUrl(supabase: Client, path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const map = await signedAvatarUrls(supabase, [path]);
  return map.get(path) ?? null;
}
