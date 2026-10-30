"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isSafeObjectPath, type UploadedFile } from "@/lib/upload";
import {
  CLASS_MATERIAL_FILES_MAX,
  CLASS_MATERIAL_MAX_BYTES,
  CLASS_MATERIAL_TITLE_MAX,
  defaultMaterialTitle,
  fileOrderOf,
  materialLinks,
  noteHasText,
  noteTooLong,
  parseMaterialLinks,
  sortMaterialFiles,
  type FileOrderItem,
  type LinkInput,
} from "@/lib/class-materials";
import { LECTURE_MATERIAL_BUCKET, LECTURE_MATERIAL_FOLDER } from "@/lib/lecture-materials";

/** filesSaved — 새 파일 행까지 저장한 뒤 그다음 단계(파일 빼기 · 순서)에서 멈췄다. 올린 파일은 이미 첨부라 화면이 지우면 안 된다 (2026-10-29) */
export type LectureMaterialResult = { ok: boolean; error?: string; filesSaved?: boolean };

function revalidateLectureMaterials() {
  revalidatePath("/admin/lectures/settings");
  revalidatePath("/admin/lectures");
  revalidatePath("/my/lecture");
}

/** DB 오류를 강사에게 보일 말로 */
function errorMessage(error: { code?: string; message?: string } | null, fallback = "저장하지 못했어요. 잠시 후 다시 시도해 주세요.") {
  if (!error) return fallback;
  if (error.code === "42501") return "권한이 없어요. 강사·관리자 계정으로 다시 로그인해 주세요.";
  if (error.code === "23503") return "특강을 찾을 수 없어요. 새로고침해 주세요.";
  if (error.code === "23505") return "같은 파일이 이미 올라가 있어요. 새로고침해 주세요.";
  if (error.code === "23514") return "입력값이 규칙에 맞지 않아요 (제목 100자 · 안내 5만 자 · 링크 20개).";
  return fallback;
}

/** 파일 행으로 — 순서는 `orderOf`(경로 → 번호)가 있으면 그것, 없으면 고른 순서 그대로 */
const fileRows = (materialId: number, files: UploadedFile[], orderOf?: ReadonlyMap<string, number>) =>
  files.map((f, k) => ({
    material_id: materialId,
    file_path: f.path,
    file_name: f.name.trim().slice(0, 200),
    file_size: f.size,
    content_type: f.type || null,
    sort_order: orderOf?.get(f.path) ?? k,
  }));

/**
 * 특강 자료 저장 (2026-10-30 Alan — "특강신청한 사람들이 특강 신청한 곳에 들어가면 볼 수 있는 자료실 … 신청한 사람들만 보이는 자료실").
 * 강사·관리자만 — 특강 설정 화면(조교 화면이 아니다).
 * **자료 하나 = 제목 + 안내 + 파일 0 ~ 20개 + 링크 0 ~ 20개** — 수업자료실 자료와 같은 꼴 · 같은 규칙(`saveClassMaterial`)이다.
 * 파일은 브라우저가 먼저 저장소(`class-materials/lectures/…`)에 올리고, 여기서는 자료 행과 파일 행(special_lecture_material_files)만 만든다/고친다.
 *  - id 없음: 새 자료 — 글 · 파일 · 링크 중 하나는 있어야 한다
 *  - id 있음: 제목 · 안내 · 링크 수정 + 새 파일 더하기(`files`) + 파일 빼기(`removeFileIds` — 저장소에서도 지운다) + 파일 순서(`fileOrder`)
 *    `links` 를 안 보내면(undefined) 링크는 그대로 둔다 — 보내면 그 목록으로 갈아 끼운다(빈 배열이면 다 뺀다)
 * 링크는 폼과 같은 `parseMaterialLinks` 로 다시 읽는다 — 화면이 보낸 값을 믿지 않는다. 경로는 `lectures/` 폴더인지 다시 본다.
 * 로그인한 사람의 세션으로 쓴다 — RLS(`special_lecture_materials` · `special_lecture_material_files: 스태프 …`)가 한 번 더 막는다.
 * 실패하면 이 액션이 만든 행은 되돌린다. 브라우저가 올린 파일은 브라우저가 지운다(`removeUploaded`).
 */
export async function saveLectureMaterial(input: {
  id?: number | null;
  lectureId: number;
  title: string;
  note?: string | null;
  /** 이번에 새로 올린 파일 — 없으면 빈 배열 */
  files?: UploadedFile[] | null;
  /** 고칠 때 뺄 파일 id (그 자료의 파일만 받는다) */
  removeFileIds?: number[] | null;
  /** 링크 목록 — 고칠 때 안 보내면 그대로 둔다 */
  links?: LinkInput[] | null;
  /** 파일 순서 — 남긴 파일은 id, 새 파일은 경로. 안 보내면 남긴 파일 → 새 파일 순서 그대로 */
  fileOrder?: FileOrderItem[] | null;
}): Promise<LectureMaterialResult> {
  const { user, profile } = await requireStaff();
  // 테스트 등급이면 RLS 가 학생으로 본다 — 저장이 "권한 없음" 으로 막히기 전에 까닭을 말한다
  if (profile.test_role) return { ok: false, error: "테스트 등급을 켠 동안에는 자료를 올리거나 고칠 수 없어요. 위 띠에서 테스트를 끝낸 뒤 해 주세요." };

  const lectureId = Number(input.lectureId);
  if (!Number.isInteger(lectureId) || lectureId <= 0) return { ok: false, error: "잘못된 요청이에요." };
  const note = String(input.note ?? "").trim();
  const noteError = noteTooLong(note);
  if (noteError) return { ok: false, error: noteError };
  const parsedLinks = input.links === undefined ? null : parseMaterialLinks(input.links);
  if (parsedLinks && !parsedLinks.ok) return { ok: false, error: parsedLinks.error };
  const newLinks = parsedLinks?.links ?? null;

  // 새 파일 — 브라우저가 특강 폴더(lectures/)에 올렸어야 한다 (경로 조작 · 수업자료 폴더 경로 방지). 같은 경로가 두 번 오면 한 번만
  const files = [...new Map((input.files ?? []).map((f) => [f?.path, f])).values()];
  for (const f of files) {
    if (!f || typeof f.path !== "string" || !isSafeObjectPath(f.path, LECTURE_MATERIAL_FOLDER) || !String(f.name ?? "").trim() || !(f.size >= 0)) {
      return { ok: false, error: "파일 정보가 올바르지 않아요. 다시 올려 주세요." };
    }
    if (f.size > CLASS_MATERIAL_MAX_BYTES) return { ok: false, error: `${f.name}: 파일은 50MB 이하만 올릴 수 있어요.` };
  }

  const typed = String(input.title ?? "").trim();
  if (typed.length > CLASS_MATERIAL_TITLE_MAX) return { ok: false, error: `제목은 ${CLASS_MATERIAL_TITLE_MAX}자 이내로 적어 주세요.` };

  const supabase = await createClient();

  if (!input.id) {
    const links = newLinks ?? [];
    if (files.length === 0 && links.length === 0 && !noteHasText(note)) return { ok: false, error: "파일 · 링크를 넣거나 안내를 적어 주세요." };
    if (files.length > CLASS_MATERIAL_FILES_MAX) return { ok: false, error: `파일은 한 자료에 ${CLASS_MATERIAL_FILES_MAX}개까지 올릴 수 있어요.` };
    const { data: created, error } = await supabase
      .from("special_lecture_materials")
      .insert({
        lecture_id: lectureId,
        title: typed || defaultMaterialTitle(files.map((f) => f.name), note, links),
        note: note || null,
        links,
        uploaded_by: user.id,
      })
      .select("id")
      .single();
    if (error || !created) return { ok: false, error: errorMessage(error) };
    if (files.length > 0) {
      const orderOf = fileOrderOf([], files, input.fileOrder);
      const orderByPath = new Map(files.map((f) => [f.path, orderOf.get(`path:${f.path}`) ?? 0]));
      const { error: filesError } = await supabase.from("special_lecture_material_files").insert(fileRows(created.id, files, orderByPath));
      if (filesError) {
        // 파일 없는 자료가 남지 않게 되돌린다 (파일은 브라우저가 지운다)
        await supabase.from("special_lecture_materials").delete().eq("id", created.id);
        return { ok: false, error: errorMessage(filesError) };
      }
    }
    revalidateLectureMaterials();
    return { ok: true };
  }

  const id = Number(input.id);
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "잘못된 요청이에요." };
  const [{ data: old }, { data: oldFiles, error: oldFilesError }] = await Promise.all([
    supabase.from("special_lecture_materials").select("id, lecture_id, links").eq("id", id).maybeSingle(),
    supabase.from("special_lecture_material_files").select("id, file_path, file_name, sort_order").eq("material_id", id),
  ]);
  if (!old) return { ok: false, error: "자료를 찾을 수 없어요. 새로고침해 주세요." };
  if (old.lecture_id !== lectureId) return { ok: false, error: "다른 특강의 자료예요. 새로고침해 주세요." };
  if (oldFilesError) return { ok: false, error: errorMessage(oldFilesError) };

  const removeIds = new Set((input.removeFileIds ?? []).map(Number).filter((n) => Number.isInteger(n) && n > 0));
  const current = sortMaterialFiles(oldFiles ?? []);
  const removing = current.filter((f) => removeIds.has(f.id));
  const staying = current.filter((f) => !removeIds.has(f.id));
  const links = newLinks ?? materialLinks(old.links);
  if (staying.length + files.length + links.length === 0 && !noteHasText(note)) {
    return { ok: false, error: "파일 · 링크를 다 빼려면 안내를 적어 주세요. 글 · 파일 · 링크 중 하나는 있어야 해요." };
  }
  if (staying.length + files.length > CLASS_MATERIAL_FILES_MAX) return { ok: false, error: `파일은 한 자료에 ${CLASS_MATERIAL_FILES_MAX}개까지예요. 몇 개를 빼고 더해 주세요.` };

  const orderOf = fileOrderOf(staying, files, input.fileOrder);
  const orderByPath = new Map(files.map((f) => [f.path, orderOf.get(`path:${f.path}`) ?? 0]));

  // 1) 새 파일 행 — 실패하면 아무것도 바뀌지 않은 채 돌아간다
  let added: number[] = [];
  if (files.length > 0) {
    const { data, error } = await supabase.from("special_lecture_material_files").insert(fileRows(id, files, orderByPath)).select("id");
    if (error) return { ok: false, error: errorMessage(error) };
    added = (data ?? []).map((r) => r.id);
  }

  // 2) 자료 행 — 실패하면 방금 넣은 파일 행을 되돌린다
  const { data, error } = await supabase
    .from("special_lecture_materials")
    .update({
      title: typed || defaultMaterialTitle([...staying.map((f) => f.file_name), ...files.map((f) => f.name)], note, links),
      note: note || null,
      ...(newLinks ? { links: newLinks } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id");
  if (error || !data?.length) {
    if (added.length) await supabase.from("special_lecture_material_files").delete().in("id", added);
    return { ok: false, error: error ? errorMessage(error) : "자료를 찾을 수 없어요. 새로고침해 주세요." };
  }

  // 3) 뺀 파일 — 행을 지운 뒤 저장소에서도 지운다
  if (removing.length > 0) {
    const { data: gone, error: removeError } = await supabase
      .from("special_lecture_material_files")
      .delete()
      .eq("material_id", id)
      .in(
        "id",
        removing.map((f) => f.id),
      )
      .select("file_path");
    if (removeError) {
      revalidateLectureMaterials();
      return { ok: false, filesSaved: true, error: "제목 · 안내는 저장했지만 파일을 빼지 못했어요. 새로고침한 뒤 다시 빼 주세요." };
    }
    if (gone?.length) await supabase.storage.from(LECTURE_MATERIAL_BUCKET).remove(gone.map((g) => g.file_path));
  }

  // 4) 남긴 파일의 순서 — 번호가 달라진 것만
  const reordered = staying.filter((f) => f.sort_order !== orderOf.get(`id:${f.id}`));
  if (reordered.length > 0) {
    const results = await Promise.all(
      reordered.map((f) =>
        supabase.from("special_lecture_material_files").update({ sort_order: orderOf.get(`id:${f.id}`) ?? f.sort_order }).eq("id", f.id).eq("material_id", id),
      ),
    );
    if (results.some((r) => r.error)) {
      revalidateLectureMaterials();
      return { ok: false, filesSaved: true, error: "저장했지만 파일 순서를 다 적지 못했어요. 새로고침한 뒤 다시 옮겨 주세요." };
    }
  }

  revalidateLectureMaterials();
  return { ok: true };
}

/** 특강 자료 삭제 — 자료 행(파일 행은 함께 지워진다)과 저장소 파일을 지운다. 신청한 학생 화면에서도 바로 빠진다 */
export async function deleteLectureMaterial(id: number): Promise<LectureMaterialResult> {
  const { profile } = await requireStaff();
  if (profile.test_role) return { ok: false, error: "테스트 등급을 켠 동안에는 지울 수 없어요. 위 띠에서 테스트를 끝낸 뒤 해 주세요." };
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "잘못된 요청이에요." };

  const supabase = await createClient();
  // 파일 행은 자료를 지우면 함께 사라지므로(on delete cascade) 경로를 먼저 읽어 둔다. 못 세면 지우지 않는다 (2026-10-29 규칙)
  const { data: files, error: filesError } = await supabase.from("special_lecture_material_files").select("file_path").eq("material_id", id);
  if (filesError) return { ok: false, error: errorMessage(filesError, "파일 목록을 읽지 못했어요. 잠시 후 다시 시도해 주세요.") };
  const { data, error } = await supabase.from("special_lecture_materials").delete().eq("id", id).select("id");
  if (error) return { ok: false, error: errorMessage(error, "삭제하지 못했어요.") };
  if (!data?.length) return { ok: false, error: "자료를 찾을 수 없어요. 새로고침해 주세요." };

  if (files?.length) await supabase.storage.from(LECTURE_MATERIAL_BUCKET).remove(files.map((f) => f.file_path));
  revalidateLectureMaterials();
  return { ok: true };
}
