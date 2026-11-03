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
import { ROUND_MAX, isRoundSet } from "@/lib/class-rounds";
import { TEACHER_BOARD_BUCKET, TEACHER_BOARD_FOLDER, folderNameError } from "@/lib/teacher-board";
import { readAll } from "@/lib/read-all";

/**
 * 강사 자료 게시판 (2026-11-03 Alan) — 폴더 · 폴더 안 자료 · "몇월 수업자료로 쓰기". 강사 · 관리자만 (조교 화면이 아니다).
 * 전부 로그인한 사람의 세션으로 쓴다 — RLS(`teacher_*: 스태프 …`)가 한 번 더 막는다. 서비스 롤 없음.
 * 자료 저장은 특강 자료실 · 수업자료실과 같은 흐름이다 (`saveLectureMaterial`): 파일은 브라우저가 먼저 저장소(`class-materials/teacher/…`)에 올리고
 * 여기서는 행만 만든다. 새 파일 행까지 저장한 뒤 실패하면 `filesSaved` — 화면이 올린 파일을 지우면 안 된다 (2026-10-29).
 */
export type TeacherBoardResult = { ok: boolean; error?: string; filesSaved?: boolean };

const TESTING = "테스트 등급을 켠 동안에는 강사 자료 게시판을 고칠 수 없어요. 위 띠에서 테스트를 끝낸 뒤 해 주세요.";

function revalidateBoard() {
  revalidatePath("/admin/teacher-board");
  revalidatePath("/admin/class-materials");
  revalidatePath("/my/materials");
}

/** DB 오류를 강사에게 보일 말로 */
function errorMessage(error: { code?: string; message?: string } | null, fallback = "저장하지 못했어요. 잠시 후 다시 시도해 주세요.") {
  if (!error) return fallback;
  if (error.code === "42501") return "권한이 없어요. 강사·관리자 계정으로 다시 로그인해 주세요.";
  if (error.code === "23503") return "폴더를 찾을 수 없어요. 새로고침해 주세요.";
  if (error.code === "23505") return "같은 파일이 이미 올라가 있어요. 새로고침해 주세요.";
  if (error.code === "23514") return "입력값이 규칙에 맞지 않아요 (폴더 이름 60자 · 제목 100자 · 안내 5만 자 · 링크 20개 · 회차 1~30).";
  return fallback;
}

const validId = (n: unknown): n is number => Number.isInteger(n) && (n as number) > 0;

// ─── 폴더 ───────────────────────────────────────────────────────────────────

/** 폴더 더하기 — 그 게시판(RC · LC)의 맨 끝에 */
export async function addTeacherFolder(subject: string, name: string): Promise<TeacherBoardResult> {
  const { profile } = await requireStaff();
  if (profile.test_role) return { ok: false, error: TESTING };
  if (subject !== "rc" && subject !== "lc") return { ok: false, error: "잘못된 요청이에요." };
  const nameError = folderNameError(String(name ?? ""));
  if (nameError) return { ok: false, error: nameError };

  const supabase = await createClient();
  const { data: last, error: readError } = await supabase
    .from("teacher_folders")
    .select("sort_order")
    .eq("subject", subject)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (readError) return { ok: false, error: errorMessage(readError) };
  const { error } = await supabase.from("teacher_folders").insert({ subject, name: name.trim(), sort_order: (last?.sort_order ?? -1) + 1 });
  if (error) return { ok: false, error: errorMessage(error) };
  revalidateBoard();
  return { ok: true };
}

/** 폴더 이름 바꾸기 */
export async function renameTeacherFolder(id: number, name: string): Promise<TeacherBoardResult> {
  const { profile } = await requireStaff();
  if (profile.test_role) return { ok: false, error: TESTING };
  if (!validId(id)) return { ok: false, error: "잘못된 요청이에요." };
  const nameError = folderNameError(String(name ?? ""));
  if (nameError) return { ok: false, error: nameError };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("teacher_folders")
    .update({ name: name.trim(), updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id");
  if (error) return { ok: false, error: errorMessage(error) };
  if (!data?.length) return { ok: false, error: "폴더를 찾을 수 없어요. 새로고침해 주세요." };
  revalidateBoard();
  return { ok: true };
}

/** 폴더 위치 바꾸기 — 한 칸 위(-1) · 아래(1). 같은 게시판 폴더를 0 부터 다시 매기고 달라진 것만 고친다 */
export async function moveTeacherFolder(id: number, step: number): Promise<TeacherBoardResult> {
  const { profile } = await requireStaff();
  if (profile.test_role) return { ok: false, error: TESTING };
  if (!validId(id) || (step !== -1 && step !== 1)) return { ok: false, error: "잘못된 요청이에요." };

  const supabase = await createClient();
  const { data: me, error: meError } = await supabase.from("teacher_folders").select("id, subject").eq("id", id).maybeSingle();
  if (meError) return { ok: false, error: errorMessage(meError) };
  if (!me) return { ok: false, error: "폴더를 찾을 수 없어요. 새로고침해 주세요." };
  const { data: folders, error } = await supabase
    .from("teacher_folders")
    .select("id, sort_order")
    .eq("subject", me.subject)
    .order("sort_order")
    .order("id");
  if (error || !folders) return { ok: false, error: errorMessage(error) };

  const ids = folders.map((f) => f.id);
  const at = ids.indexOf(id);
  const to = at + step;
  if (at < 0 || to < 0 || to >= ids.length) return { ok: true };
  [ids[at], ids[to]] = [ids[to], ids[at]];
  const was = new Map(folders.map((f) => [f.id, f.sort_order]));
  const changed = ids.map((fid, i) => [fid, i] as const).filter(([fid, i]) => was.get(fid) !== i);
  const results = await Promise.all(changed.map(([fid, i]) => supabase.from("teacher_folders").update({ sort_order: i }).eq("id", fid).select("id")));
  revalidateBoard();
  if (results.some((r) => r.error || !r.data?.length)) return { ok: false, error: "순서를 다 적지 못했어요. 새로고침한 뒤 다시 옮겨 주세요." };
  return { ok: true };
}

/** 폴더 지우기 — 안의 자료 · 파일 · 몇월에 쓰기도 함께. 저장소 파일 경로를 먼저 읽고, 못 읽으면 지우지 않는다 (2026-10-29 규칙) */
export async function deleteTeacherFolder(id: number): Promise<TeacherBoardResult> {
  const { profile } = await requireStaff();
  if (profile.test_role) return { ok: false, error: TESTING };
  if (!validId(id)) return { ok: false, error: "잘못된 요청이에요." };

  const supabase = await createClient();
  // 폴더의 모든 파일 경로 — 1,000줄이 넘을 수 있어(자료 60 × 파일 20) 나눠 다 읽는다. 다 못 읽으면 지우지 않는다 (저장소에 주인 없는 파일이 남는다)
  const files = await readAll<{ file_path: string }>((from, to, count) =>
    supabase
      .from("teacher_folder_files")
      .select("file_path, item:teacher_folder_items!inner(folder_id)", count ? { count: "exact" } : undefined)
      .eq("item.folder_id", id)
      .order("id")
      .range(from, to),
  );
  if (!files.ok) return { ok: false, error: "파일 목록을 읽지 못했어요. 잠시 후 다시 시도해 주세요." };
  const paths = files.rows.map((f) => f.file_path);
  const { data, error } = await supabase.from("teacher_folders").delete().eq("id", id).select("id");
  if (error) return { ok: false, error: errorMessage(error, "지우지 못했어요.") };
  if (!data?.length) return { ok: false, error: "폴더를 찾을 수 없어요. 새로고침해 주세요." };
  for (let i = 0; i < paths.length; i += 100) await supabase.storage.from(TEACHER_BOARD_BUCKET).remove(paths.slice(i, i + 100));
  revalidateBoard();
  return { ok: true };
}

// ─── 몇월 수업자료로 쓰기 ─────────────────────────────────────────────────────

/**
 * 폴더를 그 달 · 레벨 · 과정 자료로 쓴다 — 그 칸을 쓰는 반 학생에게 회차 수업일마다 열리고, **그 달 그 칸의 수업자료실 자료는 닫힌다**.
 * 한 칸에는 폴더 하나 — 이미 다른 폴더가 있으면 그 이름을 말해 준다 (바꾸려면 그 폴더에서 먼저 뺀다).
 */
export async function addFolderUse(input: { folderId: number; termId: number; level: number; set: string }): Promise<TeacherBoardResult> {
  const { user, profile } = await requireStaff();
  if (profile.test_role) return { ok: false, error: TESTING };
  const folderId = Number(input.folderId);
  const termId = Number(input.termId);
  const level = Number(input.level);
  if (!validId(folderId) || !validId(termId) || !validId(level) || !isRoundSet(input.set)) return { ok: false, error: "달 · 레벨 · 과정을 골라 주세요." };

  const supabase = await createClient();
  const [{ data: folder, error: folderError }, { data: term }, { data: lv }] = await Promise.all([
    supabase.from("teacher_folders").select("id, subject").eq("id", folderId).maybeSingle(),
    supabase.from("terms").select("id").eq("id", termId).maybeSingle(),
    supabase.from("lc_levels").select("level").eq("level", level).maybeSingle(),
  ]);
  if (folderError) return { ok: false, error: errorMessage(folderError) };
  if (!folder) return { ok: false, error: "폴더를 찾을 수 없어요. 새로고침해 주세요." };
  if (!term) return { ok: false, error: "그 달을 찾을 수 없어요. 새로고침해 주세요." };
  if (!lv) return { ok: false, error: "그 레벨을 찾을 수 없어요. 새로고침해 주세요." };

  const { error } = await supabase
    .from("teacher_folder_uses")
    .insert({ folder_id: folderId, subject: folder.subject, term_id: termId, level, book_set: input.set, created_by: user.id });
  if (error?.code === "23505") {
    const { data: taken } = await supabase
      .from("teacher_folder_uses")
      .select("folder:teacher_folders(name)")
      .eq("term_id", termId)
      .eq("level", level)
      .eq("subject", folder.subject)
      .eq("book_set", input.set)
      .maybeSingle();
    const name = (taken?.folder as { name?: string } | null)?.name;
    return { ok: false, error: `그 달 ${level} ${folder.subject.toUpperCase()} ${input.set}과정에는 이미 ${name ? `'${name}'` : "다른"} 폴더를 쓰고 있어요. 그 폴더에서 먼저 빼 주세요.` };
  }
  if (error) return { ok: false, error: errorMessage(error) };
  revalidateBoard();
  return { ok: true };
}

/** 그 달 자료로 쓰기를 뺀다 — 학생 화면에서 그 폴더 자료가 빠지고, 그 칸의 수업자료실 자료가 다시 열린다 */
export async function removeFolderUse(id: number): Promise<TeacherBoardResult> {
  const { profile } = await requireStaff();
  if (profile.test_role) return { ok: false, error: TESTING };
  if (!validId(id)) return { ok: false, error: "잘못된 요청이에요." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("teacher_folder_uses").delete().eq("id", id).select("id");
  if (error) return { ok: false, error: errorMessage(error, "빼지 못했어요.") };
  if (!data?.length) return { ok: false, error: "이미 빠졌어요. 새로고침해 주세요." };
  revalidateBoard();
  return { ok: true };
}

// ─── 폴더 안 자료 ─────────────────────────────────────────────────────────────

/** 파일 행으로 — 순서는 `orderOf`(경로 → 번호)가 있으면 그것, 없으면 고른 순서 그대로 */
const fileRows = (itemId: number, files: UploadedFile[], orderOf?: ReadonlyMap<string, number>) =>
  files.map((f, k) => ({
    item_id: itemId,
    file_path: f.path,
    file_name: f.name.trim().slice(0, 200),
    file_size: f.size,
    content_type: f.type || null,
    sort_order: orderOf?.get(f.path) ?? k,
  }));

/**
 * 자료 저장 — 특강 자료실(`saveLectureMaterial`)과 같은 흐름에 **회차**가 더해졌다.
 *  - id 없음: 새 자료 — 글 · 파일 · 링크 중 하나는 있어야 한다
 *  - id 있음: 회차 · 제목 · 안내 · 링크 수정 + 새 파일 더하기 + 파일 빼기(`removeFileIds` — 저장소에서도) + 파일 순서(`fileOrder`)
 */
export async function saveTeacherItem(input: {
  id?: number | null;
  folderId: number;
  seq: number;
  title: string;
  note?: string | null;
  files?: UploadedFile[] | null;
  removeFileIds?: number[] | null;
  links?: LinkInput[] | null;
  fileOrder?: FileOrderItem[] | null;
}): Promise<TeacherBoardResult> {
  const { user, profile } = await requireStaff();
  if (profile.test_role) return { ok: false, error: TESTING };

  const folderId = Number(input.folderId);
  const seq = Number(input.seq);
  if (!validId(folderId)) return { ok: false, error: "잘못된 요청이에요." };
  if (!Number.isInteger(seq) || seq < 1 || seq > ROUND_MAX) return { ok: false, error: `회차를 골라 주세요 (1 ~ ${ROUND_MAX}회차).` };
  const note = String(input.note ?? "").trim();
  const noteError = noteTooLong(note);
  if (noteError) return { ok: false, error: noteError };
  const parsedLinks = input.links === undefined ? null : parseMaterialLinks(input.links);
  if (parsedLinks && !parsedLinks.ok) return { ok: false, error: parsedLinks.error };
  const newLinks = parsedLinks?.links ?? null;

  // 새 파일 — 브라우저가 강사 게시판 폴더(teacher/)에 올렸어야 한다 (경로 조작 · 다른 폴더 경로 방지). 같은 경로가 두 번 오면 한 번만
  const files = [...new Map((input.files ?? []).map((f) => [f?.path, f])).values()];
  for (const f of files) {
    if (!f || typeof f.path !== "string" || !isSafeObjectPath(f.path, TEACHER_BOARD_FOLDER) || !String(f.name ?? "").trim() || !(f.size >= 0)) {
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
    // 그 회차의 끝에 선다 (수업자료실 새 자료와 같다)
    const { data: last, error: lastError } = await supabase
      .from("teacher_folder_items")
      .select("sort_order")
      .eq("folder_id", folderId)
      .eq("seq", seq)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastError) return { ok: false, error: errorMessage(lastError) };
    const { data: created, error } = await supabase
      .from("teacher_folder_items")
      .insert({
        folder_id: folderId,
        seq,
        title: typed || defaultMaterialTitle(files.map((f) => f.name), note, links),
        note: note || null,
        links,
        sort_order: (last?.sort_order ?? -1) + 1,
        uploaded_by: user.id,
      })
      .select("id")
      .single();
    if (error || !created) return { ok: false, error: errorMessage(error) };
    if (files.length > 0) {
      const orderOf = fileOrderOf([], files, input.fileOrder);
      const orderByPath = new Map(files.map((f) => [f.path, orderOf.get(`path:${f.path}`) ?? 0]));
      const { error: filesError } = await supabase.from("teacher_folder_files").insert(fileRows(created.id, files, orderByPath));
      if (filesError) {
        // 파일 없는 자료가 남지 않게 되돌린다 (파일은 브라우저가 지운다)
        await supabase.from("teacher_folder_items").delete().eq("id", created.id);
        return { ok: false, error: errorMessage(filesError) };
      }
    }
    revalidateBoard();
    return { ok: true };
  }

  const id = Number(input.id);
  if (!validId(id)) return { ok: false, error: "잘못된 요청이에요." };
  const [{ data: old }, { data: oldFiles, error: oldFilesError }] = await Promise.all([
    supabase.from("teacher_folder_items").select("id, folder_id, seq, sort_order, links").eq("id", id).maybeSingle(),
    supabase.from("teacher_folder_files").select("id, file_path, file_name, sort_order").eq("item_id", id),
  ]);
  if (!old) return { ok: false, error: "자료를 찾을 수 없어요. 새로고침해 주세요." };
  if (old.folder_id !== folderId) return { ok: false, error: "다른 폴더의 자료예요. 새로고침해 주세요." };
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

  // 회차를 옮기면 그 회차의 끝에 선다
  let sortOrder = old.sort_order;
  if (old.seq !== seq) {
    const { data: last, error: lastError } = await supabase
      .from("teacher_folder_items")
      .select("sort_order")
      .eq("folder_id", folderId)
      .eq("seq", seq)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastError) return { ok: false, error: errorMessage(lastError) };
    sortOrder = (last?.sort_order ?? -1) + 1;
  }

  const orderOf = fileOrderOf(staying, files, input.fileOrder);
  const orderByPath = new Map(files.map((f) => [f.path, orderOf.get(`path:${f.path}`) ?? 0]));

  // 1) 새 파일 행 — 실패하면 아무것도 바뀌지 않은 채 돌아간다
  let added: number[] = [];
  if (files.length > 0) {
    const { data, error } = await supabase.from("teacher_folder_files").insert(fileRows(id, files, orderByPath)).select("id");
    if (error) return { ok: false, error: errorMessage(error) };
    added = (data ?? []).map((r) => r.id);
  }

  // 2) 자료 행 — 실패하면 방금 넣은 파일 행을 되돌린다
  const { data, error } = await supabase
    .from("teacher_folder_items")
    .update({
      seq,
      sort_order: sortOrder,
      title: typed || defaultMaterialTitle([...staying.map((f) => f.file_name), ...files.map((f) => f.name)], note, links),
      note: note || null,
      ...(newLinks ? { links: newLinks } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id");
  if (error || !data?.length) {
    // 방금 넣은 파일 행을 되돌린다 — 되돌리지 못했으면 그 행이 파일을 가리키므로 화면이 올린 파일을 지우면 안 된다 (filesSaved)
    const undone = added.length ? await supabase.from("teacher_folder_files").delete().in("id", added).select("id") : null;
    const kept = !!undone && (!!undone.error || (undone.data?.length ?? 0) < added.length);
    return { ok: false, filesSaved: kept || undefined, error: error ? errorMessage(error) : "자료를 찾을 수 없어요. 새로고침해 주세요." };
  }

  // 3) 뺀 파일 — 행을 지운 뒤 저장소에서도 지운다
  if (removing.length > 0) {
    const { data: gone, error: removeError } = await supabase
      .from("teacher_folder_files")
      .delete()
      .eq("item_id", id)
      .in(
        "id",
        removing.map((f) => f.id),
      )
      .select("file_path");
    if (removeError) {
      revalidateBoard();
      return { ok: false, filesSaved: true, error: "회차 · 제목 · 안내는 저장했지만 파일을 빼지 못했어요. 새로고침한 뒤 다시 빼 주세요." };
    }
    if (gone?.length) await supabase.storage.from(TEACHER_BOARD_BUCKET).remove(gone.map((g) => g.file_path));
  }

  // 4) 남긴 파일의 순서 — 번호가 달라진 것만
  const reordered = staying.filter((f) => f.sort_order !== orderOf.get(`id:${f.id}`));
  if (reordered.length > 0) {
    const results = await Promise.all(
      reordered.map((f) => supabase.from("teacher_folder_files").update({ sort_order: orderOf.get(`id:${f.id}`) ?? f.sort_order }).eq("id", f.id).eq("item_id", id)),
    );
    if (results.some((r) => r.error)) {
      revalidateBoard();
      return { ok: false, filesSaved: true, error: "저장했지만 파일 순서를 다 적지 못했어요. 새로고침한 뒤 다시 옮겨 주세요." };
    }
  }

  revalidateBoard();
  return { ok: true };
}

/** 자료 삭제 — 자료 행(파일 행은 함께 지워진다)과 저장소 파일을 지운다. 학생 화면에서도 바로 빠진다 */
export async function deleteTeacherItem(id: number): Promise<TeacherBoardResult> {
  const { profile } = await requireStaff();
  if (profile.test_role) return { ok: false, error: TESTING };
  if (!validId(id)) return { ok: false, error: "잘못된 요청이에요." };

  const supabase = await createClient();
  // 파일 행은 자료를 지우면 함께 사라지므로(on delete cascade) 경로를 먼저 읽어 둔다. 못 세면 지우지 않는다 (2026-10-29 규칙)
  const { data: files, error: filesError } = await supabase.from("teacher_folder_files").select("file_path").eq("item_id", id);
  if (filesError) return { ok: false, error: errorMessage(filesError, "파일 목록을 읽지 못했어요. 잠시 후 다시 시도해 주세요.") };
  const { data, error } = await supabase.from("teacher_folder_items").delete().eq("id", id).select("id");
  if (error) return { ok: false, error: errorMessage(error, "삭제하지 못했어요.") };
  if (!data?.length) return { ok: false, error: "자료를 찾을 수 없어요. 새로고침해 주세요." };

  if (files?.length) await supabase.storage.from(TEACHER_BOARD_BUCKET).remove(files.map((f) => f.file_path));
  revalidateBoard();
  return { ok: true };
}
