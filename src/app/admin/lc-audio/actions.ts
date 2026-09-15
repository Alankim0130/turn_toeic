"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isAudioType, isSafeObjectPath, type UploadedFile } from "@/lib/upload";
import { studyErrorMessage } from "@/lib/study";
import { isYmd } from "@/components/admin/sections/dates";

export type AudioResult = { ok: boolean; error?: string; count?: number };
export type AudioEditState = { ok?: boolean; error?: string };

const BUCKET = "lc-audio";

function revalidateAudio() {
  revalidatePath("/admin/lc-audio");
  revalidatePath("/my/lc-audio");
}

/** 브라우저가 올린 음원들을 목록에 등록. 저장소 폴더는 기수 id 또는 상시(always) */
export async function registerAudioTracks(input: {
  termId: number | null;
  tracks: { title: string; date: string | null; file: UploadedFile }[];
}): Promise<AudioResult> {
  const { user } = await requireStaff();
  const termId = input.termId === null ? null : Number(input.termId);
  if (termId !== null && !Number.isInteger(termId)) return { ok: false, error: "기수를 확인해 주세요." };
  const tracks = Array.isArray(input.tracks) ? input.tracks : [];
  if (tracks.length === 0 || tracks.length > 30) return { ok: false, error: "한 번에 1~30개까지 올릴 수 있어요." };

  const prefix = `${termId ?? "always"}/`;
  const rows = [];
  for (const t of tracks) {
    const title = String(t.title ?? "").trim();
    if (title.length < 1 || title.length > 100) return { ok: false, error: "음원 제목은 1~100자로 적어 주세요." };
    if (t.date && !isYmd(t.date)) return { ok: false, error: "날짜 형식이 올바르지 않아요." };
    if (!t.file || !isSafeObjectPath(t.file.path, prefix) || !isAudioType(t.file.type)) return { ok: false, error: "음원 파일 정보가 올바르지 않아요." };
    rows.push({
      term_id: termId,
      title,
      date: t.date || null,
      file_path: t.file.path,
      file_name: String(t.file.name).slice(0, 200),
      file_size: t.file.size,
      content_type: t.file.type,
      uploaded_by: user.id,
    });
  }

  const supabase = await createClient();
  const { error } = await supabase.from("lc_audio_tracks").insert(rows);
  if (error) return { ok: false, error: studyErrorMessage(error, "음원을 등록하지 못했어요.") };

  revalidateAudio();
  return { ok: true, count: rows.length };
}

/** 제목·날짜·보관 기수 수정 */
export async function updateAudioTrack(_prev: AudioEditState, formData: FormData): Promise<AudioEditState> {
  await requireStaff();
  const id = Number(formData.get("id"));
  const title = String(formData.get("title") ?? "").trim();
  const date = String(formData.get("date") ?? "").trim();
  const termRaw = String(formData.get("term_id") ?? "").trim();
  if (!Number.isInteger(id)) return { error: "잘못된 요청이에요." };
  if (title.length < 1 || title.length > 100) return { error: "제목은 1~100자로 적어 주세요." };
  if (date && !isYmd(date)) return { error: "날짜 형식이 올바르지 않아요." };
  const termId = termRaw === "" ? null : Number(termRaw);
  if (termId !== null && !Number.isInteger(termId)) return { error: "기수를 확인해 주세요." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lc_audio_tracks")
    .update({ title, date: date || null, term_id: termId, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id");
  if (error) return { error: studyErrorMessage(error) };
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

  await supabase.storage.from(BUCKET).remove(data.map((d) => d.file_path));
  revalidateAudio();
  return { ok: true };
}
