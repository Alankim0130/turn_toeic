"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isAudioType, isSafeObjectPath, MB, type UploadedFile } from "@/lib/upload";
import { DAY_COUNT, isDay } from "@/lib/lc-audio";
import { studyErrorMessage } from "@/lib/study";

export type AudioResult = { ok: boolean; error?: string; count?: number };
export type BookEditState = { ok?: boolean; error?: string; message?: string };

const AUDIO_BUCKET = "lc-audio";
const TEXTBOOK_BUCKET = "lc-textbooks";

function revalidateAudio() {
  revalidatePath("/admin/lc-audio");
  revalidatePath("/my/lc-audio");
}

/* ─── 교재: 교재명 · 설명 ───────────────────────────────────────────────── */
export async function updateBook(_prev: BookEditState, formData: FormData): Promise<BookEditState> {
  const { user } = await requireStaff();
  const id = Number(formData.get("id"));
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  if (!Number.isInteger(id)) return { error: "잘못된 요청이에요." };
  if (title.length > 60) return { error: "교재명은 60자 이내로 적어 주세요." };
  if (description.length > 200) return { error: "설명은 200자 이내로 적어 주세요." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lc_books")
    .update({ title: title || null, description: description || null, updated_by: user.id, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id");
  if (error) return { error: studyErrorMessage(error) };
  if (!data?.length) return { error: "교재를 찾을 수 없어요." };

  revalidateAudio();
  return { ok: true, message: "저장했어요." };
}

/* ─── 교재: 표지 ─────────────────────────────────────────────────────────── */

/** 브라우저가 lc-textbooks/{레벨}/ 에 올린 이미지를 표지로 지정하고, 이전 표지 파일은 지운다 */
export async function setBookCover(bookId: number, file: UploadedFile): Promise<AudioResult> {
  const { user } = await requireStaff();
  if (!Number.isInteger(bookId)) return { ok: false, error: "잘못된 요청이에요." };

  const supabase = await createClient();
  const { data: book } = await supabase.from("lc_books").select("id, level, cover_path").eq("id", bookId).maybeSingle();
  if (!book) return { ok: false, error: "교재를 찾을 수 없어요." };
  if (!file || !isSafeObjectPath(file.path, `${book.level}/`) || !file.type?.startsWith("image/")) return { ok: false, error: "이미지 파일 정보가 올바르지 않아요." };
  if (!(file.size > 0 && file.size <= 10 * MB)) return { ok: false, error: "표지 이미지는 10MB 이하만 올릴 수 있어요." };

  const { data, error } = await supabase
    .from("lc_books")
    .update({
      cover_path: file.path,
      cover_name: String(file.name).slice(0, 200),
      cover_size: file.size,
      cover_type: file.type,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", bookId)
    .select("id");
  if (error) return { ok: false, error: studyErrorMessage(error, "표지를 저장하지 못했어요.") };
  if (!data?.length) return { ok: false, error: "교재를 찾을 수 없어요." };

  if (book.cover_path && book.cover_path !== file.path) await supabase.storage.from(TEXTBOOK_BUCKET).remove([book.cover_path]);
  revalidateAudio();
  return { ok: true };
}

export async function removeBookCover(bookId: number): Promise<AudioResult> {
  const { user } = await requireStaff();
  if (!Number.isInteger(bookId)) return { ok: false, error: "잘못된 요청이에요." };

  const supabase = await createClient();
  const { data: book } = await supabase.from("lc_books").select("cover_path").eq("id", bookId).maybeSingle();
  if (!book?.cover_path) return { ok: false, error: "지울 표지가 없어요." };

  const { error } = await supabase
    .from("lc_books")
    .update({ cover_path: null, cover_name: null, cover_size: null, cover_type: null, updated_by: user.id, updated_at: new Date().toISOString() })
    .eq("id", bookId);
  if (error) return { ok: false, error: studyErrorMessage(error, "표지를 지우지 못했어요.") };

  await supabase.storage.from(TEXTBOOK_BUCKET).remove([book.cover_path]);
  revalidateAudio();
  return { ok: true };
}

/* ─── 음원: 교재마다 Day 1~9 ────────────────────────────────────────────── */

/**
 * 브라우저가 lc-audio/{교재 id}/ 에 올린 음원을 Day 칸에 넣는다.
 * 이미 그 Day 에 음원이 있으면 파일을 바꾸고, 밀려난 예전 파일은 저장소에서 지운다.
 */
export async function setAudioTracks(input: { bookId: number; tracks: { day: number; file: UploadedFile }[] }): Promise<AudioResult> {
  const { user } = await requireStaff();
  const bookId = Number(input.bookId);
  if (!Number.isInteger(bookId)) return { ok: false, error: "교재를 확인해 주세요." };
  const tracks = Array.isArray(input.tracks) ? input.tracks : [];
  if (tracks.length === 0 || tracks.length > DAY_COUNT) return { ok: false, error: `한 번에 1~${DAY_COUNT}개까지 올릴 수 있어요.` };

  const rows = [];
  const days = new Set<number>();
  for (const t of tracks) {
    const day = Number(t.day);
    if (!isDay(day)) return { ok: false, error: `Day 는 1~${DAY_COUNT} 까지예요.` };
    if (days.has(day)) return { ok: false, error: "같은 Day 를 두 번 골랐어요." };
    days.add(day);
    if (!t.file || !isSafeObjectPath(t.file.path, `${bookId}/`) || !isAudioType(t.file.type)) return { ok: false, error: "음원 파일 정보가 올바르지 않아요." };
    rows.push({
      book_id: bookId,
      day,
      file_path: t.file.path,
      file_name: String(t.file.name).slice(0, 200),
      file_size: t.file.size,
      content_type: t.file.type,
      uploaded_by: user.id,
      updated_at: new Date().toISOString(),
    });
  }

  const supabase = await createClient();
  // 바꿔 끼우기 전의 파일 경로를 먼저 챙겨 둔다 (덮어쓰면 주소를 알 수 없어 저장소에 남는다)
  const { data: before } = await supabase.from("lc_audio_tracks").select("day, file_path").eq("book_id", bookId).in("day", [...days]);

  const { error } = await supabase.from("lc_audio_tracks").upsert(rows, { onConflict: "book_id,day" });
  if (error) return { ok: false, error: error.code === "23503" ? "교재를 확인해 주세요." : studyErrorMessage(error, "음원을 등록하지 못했어요.") };

  const kept = new Set(rows.map((r) => r.file_path));
  const stale = (before ?? []).map((b) => b.file_path).filter((path) => path && !kept.has(path));
  if (stale.length) await supabase.storage.from(AUDIO_BUCKET).remove(stale);

  revalidateAudio();
  return { ok: true, count: rows.length };
}

export async function deleteAudioTrack(id: number): Promise<AudioResult> {
  await requireStaff();
  if (!Number.isInteger(id)) return { ok: false, error: "잘못된 요청이에요." };

  const supabase = await createClient();
  const { data, error } = await supabase.from("lc_audio_tracks").delete().eq("id", id).select("file_path");
  if (error) return { ok: false, error: studyErrorMessage(error, "삭제하지 못했어요.") };
  if (!data?.length) return { ok: false, error: "음원을 찾을 수 없어요." };

  await supabase.storage.from(AUDIO_BUCKET).remove(data.map((d) => d.file_path));
  revalidateAudio();
  return { ok: true };
}
