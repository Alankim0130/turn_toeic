"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isSafeObjectPath, type UploadedFile } from "@/lib/upload";
import { studyErrorMessage } from "@/lib/study";
import { MATERIAL_ROUND_MAX } from "@/lib/study-rounds";

export type MaterialResult = { ok: boolean; error?: string };

const BUCKET = "study-materials";

function revalidateMaterials() {
  revalidatePath("/admin/study-materials");
  revalidatePath("/admin/study");
  revalidatePath("/admin/sections");
  revalidatePath("/my/study");
}

/**
 * 옛 파일을 지워도 되나 — 그 달에 적용된 회차(study_materials)가 아직 그 파일을 가리키면 남긴다.
 * (인증이 붙은 회차는 수업일이 줄어도 남겨 두므로 옛 파일을 계속 가리킬 수 있다 — 20260922124700)
 */
async function removeIfUnused(supabase: Awaited<ReturnType<typeof createClient>>, path: string) {
  const { count } = await supabase.from("study_materials").select("id", { count: "exact", head: true }).eq("file_path", path);
  if (!count) await supabase.storage.from(BUCKET).remove([path]);
}

/**
 * 비대면 자료 회차 저장 (2026-09-22 Alan — "1회차, 2회차... 이렇게 설정하고 매달 강사들이 설정한 일정표에 따라 적용").
 * 파일은 브라우저가 먼저 저장소(`items/…`)에 올리고, 여기서는 자료실 행만 만든다/고친다.
 * 그 달 날짜에 붙이는 일은 DB 가 한다 (자료실 트리거 → `private.sync_online_materials`).
 *  - itemId 없음: 새 회차 (파일 필수)
 *  - itemId 있음: 제목 수정, file 이 있으면 파일 교체 후 옛 파일 삭제
 */
export async function saveMaterialItem(input: { seq: number; title: string; itemId?: number | null; file?: UploadedFile | null }): Promise<MaterialResult> {
  const { user } = await requireStaff();
  const seq = Number(input.seq);
  const title = String(input.title ?? "").trim();
  const file = input.file ?? null;

  if (!Number.isInteger(seq) || seq < 1 || seq > MATERIAL_ROUND_MAX) return { ok: false, error: "회차를 확인해 주세요." };
  if (title.length > 100) return { ok: false, error: "제목은 100자 이내로 적어 주세요." };
  if (file && (!isSafeObjectPath(file.path, "items/") || !file.name || file.size < 0)) return { ok: false, error: "파일 정보가 올바르지 않아요." };

  const supabase = await createClient();
  const fileFields = file
    ? { file_path: file.path, file_name: file.name.slice(0, 200), file_size: file.size, content_type: file.type || null, uploaded_by: user.id }
    : {};

  if (!input.itemId) {
    if (!file) return { ok: false, error: "올릴 파일을 선택해 주세요." };
    const { error } = await supabase.from("study_material_items").insert({
      seq,
      title: title || null,
      file_path: file.path,
      file_name: file.name.slice(0, 200),
      file_size: file.size,
      content_type: file.type || null,
      uploaded_by: user.id,
    });
    if (error) {
      return { ok: false, error: error.code === "23505" ? "이 회차에는 이미 자료가 있어요. 새로고침한 뒤 '수정'에서 파일을 교체해 주세요." : studyErrorMessage(error) };
    }
    revalidateMaterials();
    return { ok: true };
  }

  const itemId = Number(input.itemId);
  const { data: old } = await supabase.from("study_material_items").select("file_path").eq("id", itemId).maybeSingle();
  if (!old) return { ok: false, error: "자료를 찾을 수 없어요." };

  const { data, error } = await supabase
    .from("study_material_items")
    .update({ title: title || null, updated_at: new Date().toISOString(), ...fileFields })
    .eq("id", itemId)
    .select("id");
  if (error) return { ok: false, error: studyErrorMessage(error) };
  if (!data?.length) return { ok: false, error: "자료를 찾을 수 없어요." };

  if (file && old.file_path !== file.path) await removeIfUnused(supabase, old.file_path);

  revalidateMaterials();
  return { ok: true };
}

/** 회차 자료 삭제 — 그 달 적용분도 빠진다 (학생 인증이 붙은 회차는 DB 가 남긴다) */
export async function deleteMaterialItem(id: number): Promise<MaterialResult> {
  await requireStaff();
  if (!Number.isInteger(id)) return { ok: false, error: "잘못된 요청이에요." };

  const supabase = await createClient();
  const { data, error } = await supabase.from("study_material_items").delete().eq("id", id).select("file_path");
  if (error) return { ok: false, error: studyErrorMessage(error, "삭제하지 못했어요.") };
  if (!data?.length) return { ok: false, error: "자료를 찾을 수 없어요." };

  for (const d of data) await removeIfUnused(supabase, d.file_path);
  revalidateMaterials();
  return { ok: true };
}
