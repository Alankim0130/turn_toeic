"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isSafeObjectPath, type UploadedFile } from "@/lib/upload";
import {
  CLASS_MATERIAL_BUCKET,
  CLASS_MATERIAL_MAX_BYTES,
  CLASS_MATERIAL_NOTE_MAX,
  CLASS_MATERIAL_TITLE_MAX,
  isMaterialSubject,
  materialFolder,
  titleFromFileName,
} from "@/lib/class-materials";

export type ClassMaterialResult = { ok: boolean; error?: string };

function revalidateMaterials() {
  revalidatePath("/admin/class-materials");
  revalidatePath("/my/materials");
}

/** DB 오류를 강사에게 보일 말로 */
function errorMessage(error: { code?: string; message?: string } | null, fallback = "저장하지 못했어요. 잠시 후 다시 시도해 주세요.") {
  if (!error) return fallback;
  if (error.code === "42501") return "권한이 없어요. 강사·관리자 계정으로 다시 로그인해 주세요.";
  if (error.code === "23503") return "그 레벨이 레벨 목록에 없어요. 새로고침한 뒤 다시 골라 주세요.";
  if (error.code === "23505") return "같은 파일이 이미 올라가 있어요. 새로고침해 주세요.";
  if (error.code === "23514") return "입력값이 규칙에 맞지 않아요 (제목 100자 · 안내 500자).";
  return fallback;
}

/**
 * 수업자료실 자료 저장 (2026-10-05 Alan — "레벨별 구분과 RC, LC가 구분되어야해"). 강사·관리자만 — 조교 화면이 아니다.
 * 파일은 브라우저가 먼저 저장소(`class-materials/{레벨}-{과목}/…`)에 올리고, 여기서는 표의 행만 만든다/고친다.
 *  - id 없음: 새 자료 (파일 필수)
 *  - id 있음: 레벨 · 과목 · 제목 · 안내 수정, file 이 있으면 파일 교체 후 옛 파일 삭제
 * 로그인한 사람의 세션으로 쓴다 — RLS(`class_materials: 스태프 …`)가 한 번 더 막는다.
 * 제목을 비우면 파일 이름(확장자 뺀 것)이 제목이 된다.
 */
export async function saveClassMaterial(input: {
  id?: number | null;
  level: number;
  subject: string;
  title: string;
  note?: string | null;
  file?: UploadedFile | null;
}): Promise<ClassMaterialResult> {
  const { user, profile } = await requireStaff();
  // 테스트 등급이면 RLS 가 학생으로 본다 — 저장이 "권한 없음" 으로 막히기 전에 까닭을 말한다
  if (profile.test_role) return { ok: false, error: "테스트 등급을 켠 동안에는 자료를 올리거나 고칠 수 없어요. 위 띠에서 테스트를 끝낸 뒤 해 주세요." };

  const level = Number(input.level);
  const subject = input.subject;
  const note = String(input.note ?? "").trim();
  const file = input.file ?? null;
  if (!Number.isInteger(level) || level < 10 || level > 990) return { ok: false, error: "레벨을 다시 골라 주세요." };
  if (!isMaterialSubject(subject)) return { ok: false, error: "RC · LC 를 다시 골라 주세요." };
  if (note.length > CLASS_MATERIAL_NOTE_MAX) return { ok: false, error: `안내는 ${CLASS_MATERIAL_NOTE_MAX}자 이내로 적어 주세요.` };
  if (file) {
    // 브라우저가 고른 레벨 · 과목 폴더에 올렸어야 한다 (경로 조작 · 다른 버킷 경로 방지)
    if (!isSafeObjectPath(file.path, materialFolder(level, subject)) || !file.name || !(file.size >= 0)) return { ok: false, error: "파일 정보가 올바르지 않아요. 다시 올려 주세요." };
    if (file.size > CLASS_MATERIAL_MAX_BYTES) return { ok: false, error: "파일은 50MB 이하만 올릴 수 있어요." };
  }

  const typed = String(input.title ?? "").trim();
  if (typed.length > CLASS_MATERIAL_TITLE_MAX) return { ok: false, error: `제목은 ${CLASS_MATERIAL_TITLE_MAX}자 이내로 적어 주세요.` };

  const supabase = await createClient();
  const fileFields = file
    ? { file_path: file.path, file_name: file.name.slice(0, 200), file_size: file.size, content_type: file.type || null, uploaded_by: user.id }
    : {};

  if (!input.id) {
    if (!file) return { ok: false, error: "올릴 파일을 골라 주세요." };
    const { error } = await supabase.from("class_materials").insert({
      level,
      subject,
      title: typed || titleFromFileName(file.name),
      note: note || null,
      file_path: file.path,
      file_name: file.name.slice(0, 200),
      file_size: file.size,
      content_type: file.type || null,
      uploaded_by: user.id,
    });
    if (error) return { ok: false, error: errorMessage(error) };
    revalidateMaterials();
    return { ok: true };
  }

  const id = Number(input.id);
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "잘못된 요청이에요." };
  const { data: old } = await supabase.from("class_materials").select("file_path, file_name").eq("id", id).maybeSingle();
  if (!old) return { ok: false, error: "자료를 찾을 수 없어요. 새로고침해 주세요." };

  const { data, error } = await supabase
    .from("class_materials")
    .update({
      level,
      subject,
      title: typed || titleFromFileName(file?.name ?? old.file_name),
      note: note || null,
      updated_at: new Date().toISOString(),
      ...fileFields,
    })
    .eq("id", id)
    .select("id");
  if (error) return { ok: false, error: errorMessage(error) };
  if (!data?.length) return { ok: false, error: "자료를 찾을 수 없어요. 새로고침해 주세요." };

  // 파일을 바꿨으면 옛 파일을 지운다 — 자료 하나에 파일 하나라(file_path unique) 다른 행이 같은 파일을 쓰지 않는다
  if (file && old.file_path !== file.path) await supabase.storage.from(CLASS_MATERIAL_BUCKET).remove([old.file_path]);

  revalidateMaterials();
  return { ok: true };
}

/** 자료 삭제 — 행과 파일을 함께 지운다. 학생 화면에서도 바로 빠진다 */
export async function deleteClassMaterial(id: number): Promise<ClassMaterialResult> {
  const { profile } = await requireStaff();
  if (profile.test_role) return { ok: false, error: "테스트 등급을 켠 동안에는 지울 수 없어요. 위 띠에서 테스트를 끝낸 뒤 해 주세요." };
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "잘못된 요청이에요." };

  const supabase = await createClient();
  const { data, error } = await supabase.from("class_materials").delete().eq("id", id).select("file_path");
  if (error) return { ok: false, error: errorMessage(error, "삭제하지 못했어요.") };
  if (!data?.length) return { ok: false, error: "자료를 찾을 수 없어요. 새로고침해 주세요." };

  await supabase.storage.from(CLASS_MATERIAL_BUCKET).remove(data.map((d) => d.file_path));
  revalidateMaterials();
  return { ok: true };
}
