"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isAudioType, isSafeObjectPath, MB, type UploadedFile } from "@/lib/upload";
import { DAY_COUNT, isAudioKind, isDay } from "@/lib/lc-audio";
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

/* ─── 음원: 교재 × 종류(수업·숙제) × 강 1~9 ─────────────────────────────── */

/**
 * 브라우저가 lc-audio/{교재 id}/ 에 올린 음원을 강 칸에 **더한다**.
 * 한 강에 파일이 여러 개일 수 있으므로(650A 3강 = 교과서 현재진행형 + 영국발음) 덮어쓰지 않는다.
 * 파일을 바꾸려면 기존 음원을 지우고 다시 올린다.
 */
export async function setAudioTracks(input: {
  bookId: number;
  kind?: string;
  tracks: { day: number; label?: string | null; file: UploadedFile }[];
}): Promise<AudioResult> {
  const { user } = await requireStaff();
  const bookId = Number(input.bookId);
  if (!Number.isInteger(bookId)) return { ok: false, error: "교재를 확인해 주세요." };
  const kind = isAudioKind(input.kind) ? input.kind : "lesson";
  const tracks = Array.isArray(input.tracks) ? input.tracks : [];
  if (tracks.length === 0 || tracks.length > 30) return { ok: false, error: "한 번에 1~30개까지 올릴 수 있어요." };

  const parsed: { day: number; label: string | null; file: UploadedFile }[] = [];
  for (const t of tracks) {
    const day = Number(t.day);
    if (!isDay(day)) return { ok: false, error: `강 칸은 1~${DAY_COUNT} 까지예요.` };
    if (!t.file || !isSafeObjectPath(t.file.path, `${bookId}/`) || !isAudioType(t.file.type)) return { ok: false, error: "음원 파일 정보가 올바르지 않아요." };
    const label = String(t.label ?? "").trim().slice(0, 40);
    parsed.push({ day, label: label || null, file: t.file });
  }

  const supabase = await createClient();
  // 같은 강에 이미 있는 파일 뒤에 붙인다
  const { data: existing } = await supabase
    .from("lc_audio_tracks")
    .select("day, sort_order")
    .eq("book_id", bookId)
    .eq("kind", kind)
    .in("day", [...new Set(parsed.map((p) => p.day))]);

  const nextOrder = new Map<number, number>();
  for (const row of existing ?? []) nextOrder.set(row.day, Math.max(nextOrder.get(row.day) ?? -1, row.sort_order));

  const rows = parsed.map((p) => {
    const order = (nextOrder.get(p.day) ?? -1) + 1;
    nextOrder.set(p.day, order);
    return {
      book_id: bookId,
      kind,
      day: p.day,
      label: p.label,
      sort_order: order,
      file_path: p.file.path,
      file_name: String(p.file.name).slice(0, 200),
      file_size: p.file.size,
      content_type: p.file.type,
      uploaded_by: user.id,
      updated_at: new Date().toISOString(),
    };
  });

  const { error } = await supabase.from("lc_audio_tracks").insert(rows);
  if (error) return { ok: false, error: error.code === "23503" ? "교재를 확인해 주세요." : studyErrorMessage(error, "음원을 등록하지 못했어요.") };

  revalidateAudio();
  return { ok: true, count: rows.length };
}

/** 같은 강에 여러 파일이 있을 때 구분하는 이름 (예: 영국발음, 팟3) */
export async function setTrackLabel(id: number, label: string): Promise<AudioResult> {
  await requireStaff();
  if (!Number.isInteger(id)) return { ok: false, error: "잘못된 요청이에요." };
  const value = String(label ?? "").trim().slice(0, 40);

  const supabase = await createClient();
  const { data, error } = await supabase.from("lc_audio_tracks").update({ label: value || null }).eq("id", id).select("id");
  if (error) return { ok: false, error: studyErrorMessage(error, "이름을 저장하지 못했어요.") };
  if (!data?.length) return { ok: false, error: "음원을 찾을 수 없어요." };

  revalidateAudio();
  return { ok: true };
}

/** 교재의 시작 강 번호 (650B 는 11강부터라 10) */
export async function setLessonOffset(bookId: number, offset: number): Promise<AudioResult> {
  const { user } = await requireStaff();
  const value = Number(offset);
  if (!Number.isInteger(bookId) || !Number.isInteger(value) || value < 0 || value > 200) return { ok: false, error: "시작 강 번호를 확인해 주세요." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lc_books")
    .update({ lesson_offset: value, updated_by: user.id, updated_at: new Date().toISOString() })
    .eq("id", bookId)
    .select("id");
  if (error) return { ok: false, error: studyErrorMessage(error, "저장하지 못했어요.") };
  if (!data?.length) return { ok: false, error: "교재를 찾을 수 없어요." };

  revalidateAudio();
  return { ok: true };
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
