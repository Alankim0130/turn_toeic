"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { CHECKIN_BUCKET, CHECKIN_MAX_NOTE, CHECKIN_MAX_PHOTO_MB, CHECKIN_MAX_PHOTOS, checkinFolder } from "@/lib/study-checkin";
import { isSafeObjectPath, MB, type UploadedFile } from "@/lib/upload";

export type CheckinResult = { ok: boolean; error?: string; id?: number };

function revalidate() {
  revalidatePath("/my/study");
  revalidatePath("/admin/study");
  revalidatePath("/admin");
}

/**
 * 비대면 스터디 인증 — 브라우저가 study-checkins/{내 id}/{자료 id}/ 에 올린 사진을 인증 1건으로 등록한다 (2026-09-18 Alan).
 * 자격(신청한 스터디 · 자료 날짜 도래 · 수강 중)은 RLS 가 본다 — 여기서는 파일이 진짜 올라갔는지와 한도만 본다.
 */
export async function submitStudyCheckin(input: { materialId: number; note: string; files: UploadedFile[] }): Promise<CheckinResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요해요." };

  const materialId = Number(input.materialId);
  const note = String(input.note ?? "").trim();
  const files = Array.isArray(input.files) ? input.files : [];
  if (!Number.isInteger(materialId) || materialId <= 0) return { ok: false, error: "자료를 다시 골라 주세요." };
  if (files.length === 0 || files.length > CHECKIN_MAX_PHOTOS) return { ok: false, error: `사진은 1~${CHECKIN_MAX_PHOTOS}장 올릴 수 있어요.` };
  if (note.length > CHECKIN_MAX_NOTE) return { ok: false, error: `메모는 ${CHECKIN_MAX_NOTE}자 이내로 적어 주세요.` };

  const folder = checkinFolder(user.id, materialId);
  const prefix = `${folder}/`;
  for (const f of files) {
    if (!isSafeObjectPath(f.path, prefix) || f.path.slice(prefix.length).includes("/")) return { ok: false, error: "파일 경로가 올바르지 않아요." };
    if (!f.type?.startsWith("image/")) return { ok: false, error: "사진 파일만 올릴 수 있어요." };
    if (!(f.size > 0 && f.size <= CHECKIN_MAX_PHOTO_MB * MB)) return { ok: false, error: `사진은 ${CHECKIN_MAX_PHOTO_MB}MB 이하만 올릴 수 있어요.` };
  }

  const found = await Promise.all(
    files.map(async (f) => {
      const name = f.path.slice(prefix.length);
      const { data } = await supabase.storage.from(CHECKIN_BUCKET).list(folder, { search: name, limit: 5 });
      return (data ?? []).some((o) => o.name === name);
    }),
  );
  if (found.some((ok) => !ok)) return { ok: false, error: "올린 사진을 찾을 수 없어요. 다시 시도해 주세요." };

  const { data: created, error } = await supabase
    .from("study_checkins")
    .insert({ material_id: materialId, user_id: user.id, note: note || null })
    .select("id")
    .single();
  if (error || !created) {
    return {
      ok: false,
      error:
        error?.code === "23505"
          ? "이 날짜는 이미 인증했어요. 다시 하려면 먼저 인증을 지워 주세요."
          : error?.code === "42501"
            ? "지금은 인증할 수 없어요. 신청한 비대면 스터디의 자료이고 수강 기간인지 확인해 주세요."
            : "인증하지 못했어요. 잠시 후 다시 시도해 주세요.",
    };
  }

  const { error: filesError } = await supabase.from("study_checkin_files").insert(
    files.map((f) => ({ checkin_id: created.id, file_path: f.path, file_name: String(f.name).slice(0, 200), file_size: f.size, content_type: f.type })),
  );
  if (filesError) {
    await supabase.from("study_checkins").delete().eq("id", created.id);
    return { ok: false, error: "인증하지 못했어요. 잠시 후 다시 시도해 주세요." };
  }

  revalidate();
  return { ok: true, id: created.id };
}

/** 인증 지우기 (다시 올리려고). 사진 파일도 함께 지운다 */
export async function deleteStudyCheckin(id: number): Promise<CheckinResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요해요." };

  const { data: files } = await supabase.from("study_checkin_files").select("file_path").eq("checkin_id", id);
  const { error, count } = await supabase.from("study_checkins").delete({ count: "exact" }).eq("id", id).eq("user_id", user.id);
  if (error || !count) return { ok: false, error: "인증을 지우지 못했어요." };
  const paths = (files ?? []).map((f) => f.file_path);
  if (paths.length) await supabase.storage.from(CHECKIN_BUCKET).remove(paths);

  revalidate();
  return { ok: true };
}
