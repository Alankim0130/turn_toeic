import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { noteImagePaths } from "./note-format";

/**
 * 글에 든 그림의 서명 주소 (2026-10-05 수업자료실 공지). **보는 사람의 세션으로** 만든다 — 저장소 정책이
 * "그 그림을 품은 공지를 볼 수 있는 사람" 만 열어 주므로, 남의 범위 공지 그림은 주소가 안 나온다(그 자리는 `NoteBody` 가 비운다).
 * 주소는 1시간이면 만료된다 — 화면 하나 보는 동안이면 충분하고, 새어 나가도 곧 쓸모가 없다.
 */
/** 글에 적을 수 있는 그림 경로 — 그 버킷의 그림 폴더(공지 images/ · 비대면 안내 notes/) 바로 아래 파일 하나만. 다른 폴더의 파일을 글로 끌어와 서명하거나 지우지 못하게 (2026-10-09 보안 검토) */
export const isNoteImagePath = (p: string) => /^(images|notes)\/[A-Za-z0-9._-]+$/.test(p);

export async function signNoteImages(supabase: SupabaseClient, bucket: string, body: string): Promise<Record<string, string>> {
  const paths = noteImagePaths(body).filter(isNoteImagePath);
  if (paths.length === 0) return {};
  const { data } = await supabase.storage.from(bucket).createSignedUrls(paths, 60 * 60);
  const out: Record<string, string> = {};
  for (const d of data ?? []) if (d.path && d.signedUrl && !d.error) out[d.path] = d.signedUrl;
  return out;
}
