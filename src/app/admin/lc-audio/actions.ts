"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isAudioType, isSafeObjectPath, MB, type UploadedFile } from "@/lib/upload";
import { studyErrorMessage } from "@/lib/study";

export type AudioResult = { ok: boolean; error?: string; count?: number };
export type AudioEditState = { ok?: boolean; error?: string };

const AUDIO_BUCKET = "lc-audio";
const TEXTBOOK_BUCKET = "lc-textbooks";

function revalidateAudio() {
  revalidatePath("/admin/lc-audio");
  revalidatePath("/my/lc-audio");
}

const levelError = (code?: string) => (code === "23503" ? "레벨을 확인해 주세요." : undefined);

/** 브라우저가 lc-audio/{레벨}/ 에 올린 음원들을 목록에 등록 */
export async function registerAudioTracks(input: { level: number; tracks: { title: string; file: UploadedFile }[] }): Promise<AudioResult> {
  const { user } = await requireStaff();
  const level = Number(input.level);
  if (!Number.isInteger(level)) return { ok: false, error: "레벨을 확인해 주세요." };
  const tracks = Array.isArray(input.tracks) ? input.tracks : [];
  if (tracks.length === 0 || tracks.length > 30) return { ok: false, error: "한 번에 1~30개까지 올릴 수 있어요." };

  const rows = [];
  for (const t of tracks) {
    const title = String(t.title ?? "").trim();
    if (title.length < 1 || title.length > 100) return { ok: false, error: "음원 제목은 1~100자로 적어 주세요." };
    if (!t.file || !isSafeObjectPath(t.file.path, `${level}/`) || !isAudioType(t.file.type)) return { ok: false, error: "음원 파일 정보가 올바르지 않아요." };
    rows.push({
      level,
      title,
      file_path: t.file.path,
      file_name: String(t.file.name).slice(0, 200),
      file_size: t.file.size,
      content_type: t.file.type,
      uploaded_by: user.id,
    });
  }

  const supabase = await createClient();
  const { error } = await supabase.from("lc_audio_tracks").insert(rows);
  if (error) return { ok: false, error: levelError(error.code) ?? studyErrorMessage(error, "음원을 등록하지 못했어요.") };

  revalidateAudio();
  return { ok: true, count: rows.length };
}

/** 제목·레벨 수정 */
export async function updateAudioTrack(_prev: AudioEditState, formData: FormData): Promise<AudioEditState> {
  await requireStaff();
  const id = Number(formData.get("id"));
  const title = String(formData.get("title") ?? "").trim();
  const level = Number(formData.get("level"));
  if (!Number.isInteger(id)) return { error: "잘못된 요청이에요." };
  if (title.length < 1 || title.length > 100) return { error: "제목은 1~100자로 적어 주세요." };
  if (!Number.isInteger(level)) return { error: "레벨을 확인해 주세요." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lc_audio_tracks")
    .update({ title, level, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id");
  if (error) return { error: levelError(error.code) ?? studyErrorMessage(error) };
  if (!data?.length) return { error: "음원을 찾을 수 없어요." };

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

/* ─── 교재 이미지 ────────────────────────────────────────────────────────── */

/** 브라우저가 lc-textbooks/{레벨}/ 에 올린 교재 이미지를 등록 */
export async function registerTextbookImages(level: number, files: UploadedFile[]): Promise<AudioResult> {
  const { user } = await requireStaff();
  if (!Number.isInteger(level)) return { ok: false, error: "레벨을 확인해 주세요." };
  if (!Array.isArray(files) || files.length === 0 || files.length > 10) return { ok: false, error: "한 번에 1~10장까지 올릴 수 있어요." };
  for (const f of files) {
    if (!isSafeObjectPath(f.path, `${level}/`) || !f.type?.startsWith("image/")) return { ok: false, error: "이미지 파일 정보가 올바르지 않아요." };
    if (!(f.size > 0 && f.size <= 10 * MB)) return { ok: false, error: "이미지는 10MB 이하만 올릴 수 있어요." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("lc_textbook_images").insert(
    files.map((f) => ({ level, file_path: f.path, file_name: String(f.name).slice(0, 200), file_size: f.size, content_type: f.type, uploaded_by: user.id })),
  );
  if (error) return { ok: false, error: levelError(error.code) ?? studyErrorMessage(error, "교재 이미지를 등록하지 못했어요.") };

  revalidateAudio();
  return { ok: true, count: files.length };
}

export async function deleteTextbookImage(id: number): Promise<AudioResult> {
  await requireStaff();
  if (!Number.isInteger(id)) return { ok: false, error: "잘못된 요청이에요." };

  const supabase = await createClient();
  const { data, error } = await supabase.from("lc_textbook_images").delete().eq("id", id).select("file_path");
  if (error) return { ok: false, error: studyErrorMessage(error, "삭제하지 못했어요.") };
  if (!data?.length) return { ok: false, error: "이미지를 찾을 수 없어요." };

  await supabase.storage.from(TEXTBOOK_BUCKET).remove(data.map((d) => d.file_path));
  revalidateAudio();
  return { ok: true };
}
