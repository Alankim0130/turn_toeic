import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { noteImagePaths } from "./note-format";

/**
 * 글에 든 그림의 서명 주소 (2026-10-05 수업자료실 공지). **보는 사람의 세션으로** 만든다 — 저장소 정책이
 * "그 그림을 품은 공지를 볼 수 있는 사람" 만 열어 주므로, 남의 범위 공지 그림은 주소가 안 나온다(그 자리는 `NoteBody` 가 비운다).
 * 주소는 1시간이면 만료된다 — 화면 하나 보는 동안이면 충분하고, 새어 나가도 곧 쓸모가 없다.
 */
export async function signNoteImages(supabase: SupabaseClient, bucket: string, body: string): Promise<Record<string, string>> {
  const paths = noteImagePaths(body);
  if (paths.length === 0) return {};
  const { data } = await supabase.storage.from(bucket).createSignedUrls(paths, 60 * 60);
  const out: Record<string, string> = {};
  for (const d of data ?? []) if (d.path && d.signedUrl && !d.error) out[d.path] = d.signedUrl;
  return out;
}
