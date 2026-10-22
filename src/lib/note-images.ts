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

/**
 * 글에서 빠진 그림을 저장소에서 지운다 — **같은 표의 다른 글이 아직 가리키는 그림은 남긴다** (2026-10-22 오류 점검).
 * 우리 편집기는 그림 경로를 옮겨 적지 않지만(붙여 넣기는 그림을 빼고 받는다), 서버 액션에 본문을 직접 보내면 다른 글의 그림 경로를 적을 수 있다 —
 * 그 글을 고치거나 지우거나 옮기면 다른 글의 그림이 사라졌다. 세지 못하면 지우지 않는다 (지운 그림은 되살릴 수 없고, 남은 그림은 아무에게도 안 보인다).
 * 경로는 `isNoteImagePath` 를 통과한 것뿐이라 LIKE 에 `%` 가 섞이지 않는다 (`_` 는 한 글자로 더 넓게 맞을 뿐 — 남기는 쪽이다).
 * 글자로 적은 `[img=` 는 보이지 않는 표시가 붙어 있어(`note-format.ts` 의 LITERAL_MARK) 이 꼴에 걸리지 않는다
 */
export async function removeNoteImagesIfUnused(
  supabase: SupabaseClient,
  where: { bucket: string; table: "staff_posts" | "class_notices" },
  paths: readonly string[],
) {
  const candidates = [...new Set(paths)].filter(isNoteImagePath);
  if (candidates.length === 0) return;
  const counts = await Promise.all(
    candidates.map((p) => supabase.from(where.table).select("id", { count: "exact", head: true }).like("body", `%[img=${p}%`)),
  );
  const unused = candidates.filter((_, i) => !counts[i].error && counts[i].count === 0);
  if (unused.length) await supabase.storage.from(where.bucket).remove(unused);
}

export async function signNoteImages(supabase: SupabaseClient, bucket: string, body: string): Promise<Record<string, string>> {
  const paths = noteImagePaths(body).filter(isNoteImagePath);
  if (paths.length === 0) return {};
  const { data } = await supabase.storage.from(bucket).createSignedUrls(paths, 60 * 60);
  const out: Record<string, string> = {};
  for (const d of data ?? []) if (d.path && d.signedUrl && !d.error) out[d.path] = d.signedUrl;
  return out;
}
