"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isSafeObjectPath, type UploadedFile } from "@/lib/upload";
import { studyErrorMessage } from "@/lib/study";
import { isYmd } from "@/components/admin/sections/dates";

export type MaterialResult = { ok: boolean; error?: string };

const BUCKET = "study-materials";

function revalidateMaterials() {
  revalidatePath("/admin/study-materials");
  revalidatePath("/admin/sections");
  revalidatePath("/admin/homework");
  revalidatePath("/my/study");
  revalidatePath("/my/homework");
}

/**
 * 비대면 자료 저장. 파일은 브라우저가 먼저 저장소에 올리고, 여기서는 행만 만든다/고친다.
 *  - materialId 없음: 새 자료 (파일 필수)
 *  - materialId 있음: 제목·날짜 수정, file 이 있으면 파일 교체 후 이전 파일 삭제
 */
export async function saveMaterial(input: {
  studyId: number;
  date: string;
  title: string;
  materialId?: number | null;
  file?: UploadedFile | null;
}): Promise<MaterialResult> {
  const { user } = await requireStaff();
  const studyId = Number(input.studyId);
  const date = String(input.date ?? "");
  const title = String(input.title ?? "").trim();
  const file = input.file ?? null;

  if (!Number.isInteger(studyId) || !isYmd(date)) return { ok: false, error: "날짜를 확인해 주세요." };
  if (title.length > 100) return { ok: false, error: "제목은 100자 이내로 적어 주세요." };
  if (file && (!isSafeObjectPath(file.path, `${studyId}/`) || !file.name || file.size < 0)) return { ok: false, error: "파일 정보가 올바르지 않아요." };

  const supabase = await createClient();
  const fileFields = file
    ? { file_path: file.path, file_name: file.name.slice(0, 200), file_size: file.size, content_type: file.type || null, uploaded_by: user.id }
    : {};

  if (!input.materialId) {
    if (!file) return { ok: false, error: "올릴 파일을 선택해 주세요." };
    const { error } = await supabase.from("study_materials").insert({
      study_id: studyId,
      date,
      title: title || null,
      file_path: file.path,
      file_name: file.name.slice(0, 200),
      file_size: file.size,
      content_type: file.type || null,
      uploaded_by: user.id,
    });
    if (error) {
      return { ok: false, error: error.code === "23505" ? "이 날짜에는 이미 자료가 있어요. 새로고침한 뒤 '수정'에서 파일을 교체해 주세요." : studyErrorMessage(error) };
    }
    revalidateMaterials();
    return { ok: true };
  }

  const materialId = Number(input.materialId);
  const { data: old } = await supabase.from("study_materials").select("file_path").eq("id", materialId).maybeSingle();
  if (!old) return { ok: false, error: "자료를 찾을 수 없어요." };

  const { data, error } = await supabase
    .from("study_materials")
    .update({ date, title: title || null, updated_at: new Date().toISOString(), ...fileFields })
    .eq("id", materialId)
    .select("id");
  if (error) return { ok: false, error: error.code === "23505" ? "옮기려는 날짜에 이미 다른 자료가 있어요." : studyErrorMessage(error) };
  if (!data?.length) return { ok: false, error: "자료를 찾을 수 없어요." };

  if (file && old.file_path !== file.path) await supabase.storage.from(BUCKET).remove([old.file_path]);

  revalidateMaterials();
  return { ok: true };
}

/** 자료 삭제 (숙제는 자료와 별개라 막지 않는다) */
export async function deleteMaterial(id: number): Promise<MaterialResult> {
  await requireStaff();
  if (!Number.isInteger(id)) return { ok: false, error: "잘못된 요청이에요." };

  const supabase = await createClient();

  const { data, error } = await supabase.from("study_materials").delete().eq("id", id).select("file_path");
  if (error) return { ok: false, error: studyErrorMessage(error, "삭제하지 못했어요.") };
  if (!data?.length) return { ok: false, error: "자료를 찾을 수 없어요." };

  await supabase.storage.from(BUCKET).remove(data.map((d) => d.file_path));
  revalidateMaterials();
  return { ok: true };
}
