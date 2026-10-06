"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isSafeObjectPath, type UploadedFile } from "@/lib/upload";
import {
  CLASS_MATERIAL_BUCKET,
  CLASS_MATERIAL_FILES_MAX,
  CLASS_MATERIAL_MAX_BYTES,
  CLASS_MATERIAL_TITLE_MAX,
  defaultMaterialTitle,
  isMaterialSubject,
  materialFolder,
  materialLinks,
  noteHasText,
  noteTooLong,
  parseMaterialLinks,
  sortMaterialFiles,
  type LinkInput,
} from "@/lib/class-materials";
import { isRoundSet, ROUND_MAX } from "@/lib/class-rounds";

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
  if (error.code === "23514") return "입력값이 규칙에 맞지 않아요 (제목 100자 · 안내 5만 자 · 과정 A/B · 회차 1~30 · 링크 20개).";
  return fallback;
}

/** 파일 행으로 — 순서는 고른 순서 그대로 (`start` 다음부터) */
const fileRows = (materialId: number, files: UploadedFile[], start = 0) =>
  files.map((f, k) => ({
    material_id: materialId,
    file_path: f.path,
    file_name: f.name.trim().slice(0, 200),
    file_size: f.size,
    content_type: f.type || null,
    sort_order: start + k,
  }));

/**
 * 수업자료실 자료 저장 (2026-10-05 Alan — "레벨별 구분과 RC, LC가 구분되어야해" → 같은 날 "A/B 과정 전부다 나눠서" · 회차마다 수업일에 열기 →
 * 2026-10-06 "파일업로드를 안하고 글만 적어서 올릴수도 있도록 … 파일을 한번에 여러개 올릴 수 있도록").
 * 강사·관리자만 — 조교 화면이 아니다.
 * **자료 하나 = 제목 + 안내 + 파일 0 ~ 20개 + 링크 0 ~ 20개** (게시판 글 하나). 파일은 브라우저가 먼저 저장소(`class-materials/{레벨}-{과목}/…`)에 올리고,
 * 여기서는 자료 행과 파일 행(class_material_files)만 만든다/고친다. 링크는 자료 행의 `links` 칸이라 함께 저장된다 (2026-10-06 Alan — "유튜브 링크를 … 여러개").
 *  - id 없음: 새 자료 — 글 · 파일 · 링크 중 하나는 있어야 한다
 *  - id 있음: 레벨 · 과목 · 과정 · 회차 · 제목 · 안내 · 링크 수정 + 새 파일 더하기(`files`) + 파일 빼기(`removeFileIds` — 저장소에서도 지운다).
 *    `links` 를 안 보내면(undefined) 링크는 그대로 둔다 — 보내면 그 목록으로 갈아 끼운다(빈 배열이면 다 뺀다)
 * 링크는 폼과 같은 `parseMaterialLinks` 로 다시 읽는다 — 화면이 보낸 값을 믿지 않는다 (http · https 만, 20개, 이름 100자).
 * **과정(A/B)과 회차는 늘 받는다** — 없으면 학생에게 영영 열리지 않는다 (칸이 생기기 전에 올린 자료도 수정하면서 정한다).
 * 로그인한 사람의 세션으로 쓴다 — RLS(`class_materials` · `class_material_files: 스태프 …`)가 한 번 더 막는다.
 * 제목을 비우면 `defaultMaterialTitle` — 첫 파일 이름(여럿이면 "… 외 N개"), 글만이면 안내 첫 줄.
 * 실패하면 이 액션이 만든 행은 되돌린다. 브라우저가 올린 파일은 브라우저가 지운다(`removeUploaded`).
 */
export async function saveClassMaterial(input: {
  id?: number | null;
  level: number;
  subject: string;
  bookSet: string;
  seq: number;
  title: string;
  note?: string | null;
  /** 이번에 새로 올린 파일 — 없으면 빈 배열 */
  files?: UploadedFile[] | null;
  /** 고칠 때 뺄 파일 id (그 자료의 파일만 받는다) */
  removeFileIds?: number[] | null;
  /** 링크 목록 (2026-10-06) — 고칠 때 안 보내면 그대로 둔다 */
  links?: LinkInput[] | null;
}): Promise<ClassMaterialResult> {
  const { user, profile } = await requireStaff();
  // 테스트 등급이면 RLS 가 학생으로 본다 — 저장이 "권한 없음" 으로 막히기 전에 까닭을 말한다
  if (profile.test_role) return { ok: false, error: "테스트 등급을 켠 동안에는 자료를 올리거나 고칠 수 없어요. 위 띠에서 테스트를 끝낸 뒤 해 주세요." };

  const level = Number(input.level);
  const subject = input.subject;
  const note = String(input.note ?? "").trim();
  if (!Number.isInteger(level) || level < 10 || level > 990) return { ok: false, error: "레벨을 다시 골라 주세요." };
  if (!isMaterialSubject(subject)) return { ok: false, error: "RC · LC 를 다시 골라 주세요." };
  const bookSet = input.bookSet;
  const seq = Number(input.seq);
  if (!isRoundSet(bookSet)) return { ok: false, error: "A과정 · B과정을 골라 주세요." };
  if (!Number.isInteger(seq) || seq < 1 || seq > ROUND_MAX) return { ok: false, error: `회차를 1~${ROUND_MAX} 사이로 골라 주세요.` };
  const noteError = noteTooLong(note);
  if (noteError) return { ok: false, error: noteError };
  // 링크 — 안 보냈으면(undefined) null: 새 자료는 링크 없음, 고칠 때는 그대로
  const parsedLinks = input.links === undefined ? null : parseMaterialLinks(input.links);
  if (parsedLinks && !parsedLinks.ok) return { ok: false, error: parsedLinks.error };
  const newLinks = parsedLinks?.links ?? null;

  // 새 파일 — 브라우저가 고른 레벨 · 과목 폴더에 올렸어야 한다 (경로 조작 · 다른 버킷 경로 방지). 같은 경로가 두 번 오면 한 번만
  const files = [...new Map((input.files ?? []).map((f) => [f?.path, f])).values()];
  for (const f of files) {
    if (!f || typeof f.path !== "string" || !isSafeObjectPath(f.path, materialFolder(level, subject)) || !String(f.name ?? "").trim() || !(f.size >= 0)) {
      return { ok: false, error: "파일 정보가 올바르지 않아요. 다시 올려 주세요." };
    }
    if (f.size > CLASS_MATERIAL_MAX_BYTES) return { ok: false, error: `${f.name}: 파일은 50MB 이하만 올릴 수 있어요.` };
  }

  const typed = String(input.title ?? "").trim();
  if (typed.length > CLASS_MATERIAL_TITLE_MAX) return { ok: false, error: `제목은 ${CLASS_MATERIAL_TITLE_MAX}자 이내로 적어 주세요.` };

  const supabase = await createClient();

  if (!input.id) {
    const links = newLinks ?? [];
    if (files.length === 0 && links.length === 0 && !noteHasText(note)) return { ok: false, error: "파일 · 링크를 넣거나 안내 · 스크립트를 적어 주세요." };
    if (files.length > CLASS_MATERIAL_FILES_MAX) return { ok: false, error: `파일은 한 자료에 ${CLASS_MATERIAL_FILES_MAX}개까지 올릴 수 있어요.` };
    const { data: created, error } = await supabase
      .from("class_materials")
      .insert({
        level,
        subject,
        book_set: bookSet,
        seq,
        title: typed || defaultMaterialTitle(files.map((f) => f.name), note, links),
        note: note || null,
        links,
        uploaded_by: user.id,
      })
      .select("id")
      .single();
    if (error || !created) return { ok: false, error: errorMessage(error) };
    if (files.length > 0) {
      const { error: filesError } = await supabase.from("class_material_files").insert(fileRows(created.id, files));
      if (filesError) {
        // 파일 없는 자료가 남지 않게 되돌린다 (파일은 브라우저가 지운다)
        await supabase.from("class_materials").delete().eq("id", created.id);
        return { ok: false, error: errorMessage(filesError) };
      }
    }
    revalidateMaterials();
    return { ok: true };
  }

  const id = Number(input.id);
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "잘못된 요청이에요." };
  const [{ data: old }, { data: oldFiles, error: oldFilesError }] = await Promise.all([
    supabase.from("class_materials").select("id, links").eq("id", id).maybeSingle(),
    supabase.from("class_material_files").select("id, file_path, file_name, sort_order").eq("material_id", id),
  ]);
  if (!old) return { ok: false, error: "자료를 찾을 수 없어요. 새로고침해 주세요." };
  if (oldFilesError) return { ok: false, error: errorMessage(oldFilesError) };

  const removeIds = new Set((input.removeFileIds ?? []).map(Number).filter((n) => Number.isInteger(n) && n > 0));
  const current = sortMaterialFiles(oldFiles ?? []);
  const removing = current.filter((f) => removeIds.has(f.id));
  const staying = current.filter((f) => !removeIds.has(f.id));
  const links = newLinks ?? materialLinks(old.links);
  if (staying.length + files.length + links.length === 0 && !noteHasText(note)) {
    return { ok: false, error: "파일 · 링크를 다 빼려면 안내 · 스크립트를 적어 주세요. 글 · 파일 · 링크 중 하나는 있어야 해요." };
  }
  if (staying.length + files.length > CLASS_MATERIAL_FILES_MAX) return { ok: false, error: `파일은 한 자료에 ${CLASS_MATERIAL_FILES_MAX}개까지예요. 몇 개를 빼고 더해 주세요.` };

  // 1) 새 파일 행 — 실패하면 아무것도 바뀌지 않은 채 돌아간다
  let added: number[] = [];
  if (files.length > 0) {
    const start = Math.max(-1, ...staying.map((f) => f.sort_order)) + 1;
    const { data, error } = await supabase.from("class_material_files").insert(fileRows(id, files, start)).select("id");
    if (error) return { ok: false, error: errorMessage(error) };
    added = (data ?? []).map((r) => r.id);
  }

  // 2) 자료 행 — 실패하면 방금 넣은 파일 행을 되돌린다
  const { data, error } = await supabase
    .from("class_materials")
    .update({
      level,
      subject,
      book_set: bookSet,
      seq,
      title: typed || defaultMaterialTitle([...staying.map((f) => f.file_name), ...files.map((f) => f.name)], note, links),
      note: note || null,
      // 링크를 보냈을 때만 갈아 끼운다 (안 보냈으면 칸을 건드리지 않는다)
      ...(newLinks ? { links: newLinks } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id");
  if (error || !data?.length) {
    if (added.length) await supabase.from("class_material_files").delete().in("id", added);
    return { ok: false, error: error ? errorMessage(error) : "자료를 찾을 수 없어요. 새로고침해 주세요." };
  }

  // 3) 뺀 파일 — 행을 지운 뒤 저장소에서도 지운다 (파일마다 경로가 달라 다른 자료가 같은 파일을 쓰지 않는다)
  if (removing.length > 0) {
    const { data: gone, error: removeError } = await supabase
      .from("class_material_files")
      .delete()
      .eq("material_id", id)
      .in(
        "id",
        removing.map((f) => f.id),
      )
      .select("file_path");
    if (removeError) {
      revalidateMaterials();
      return { ok: false, error: "제목 · 안내는 저장했지만 파일을 빼지 못했어요. 새로고침한 뒤 다시 빼 주세요." };
    }
    if (gone?.length) await supabase.storage.from(CLASS_MATERIAL_BUCKET).remove(gone.map((g) => g.file_path));
  }

  revalidateMaterials();
  return { ok: true };
}

/** 자료 삭제 — 자료 행(파일 행은 함께 지워진다)과 저장소 파일을 지운다. 학생 화면에서도 바로 빠진다 */
export async function deleteClassMaterial(id: number): Promise<ClassMaterialResult> {
  const { profile } = await requireStaff();
  if (profile.test_role) return { ok: false, error: "테스트 등급을 켠 동안에는 지울 수 없어요. 위 띠에서 테스트를 끝낸 뒤 해 주세요." };
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "잘못된 요청이에요." };

  const supabase = await createClient();
  // 파일 행은 자료를 지우면 함께 사라지므로(on delete cascade) 경로를 먼저 읽어 둔다
  const { data: files } = await supabase.from("class_material_files").select("file_path").eq("material_id", id);
  const { data, error } = await supabase.from("class_materials").delete().eq("id", id).select("id");
  if (error) return { ok: false, error: errorMessage(error, "삭제하지 못했어요.") };
  if (!data?.length) return { ok: false, error: "자료를 찾을 수 없어요. 새로고침해 주세요." };

  if (files?.length) await supabase.storage.from(CLASS_MATERIAL_BUCKET).remove(files.map((f) => f.file_path));
  revalidateMaterials();
  return { ok: true };
}
