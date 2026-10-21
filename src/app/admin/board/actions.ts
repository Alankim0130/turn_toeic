"use server";

import { revalidatePath } from "next/cache";
import { isStaff, requireCrew } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fileOrderOf, parseMaterialLinks, sortMaterialFiles, type FileOrderItem, type LinkInput } from "@/lib/class-materials";
import { noteImagePaths } from "@/lib/note-format";
import { isNoteImagePath } from "@/lib/note-images";
import {
  canDeleteStaffPost,
  canEditStaffPost,
  normalizeLevels,
  normalizeSet,
  normalizeSubject,
  STAFF_BOARD_BUCKET,
  STAFF_POST_FILE_FOLDER,
  STAFF_POST_FILE_MAX_BYTES,
  STAFF_POST_FILES_MAX,
  staffPostError,
} from "@/lib/staff-board";
import { isSafeObjectPath, type UploadedFile } from "@/lib/upload";

export type StaffPostResult = { ok: boolean; error?: string; id?: number };

function revalidateBoard(id?: number) {
  revalidatePath("/admin/board");
  if (id) revalidatePath(`/admin/board/${id}`);
}

/** 파일 행으로 — 순서는 `orderOf`(경로 → 번호)가 있으면 그것, 없으면 고른 순서 그대로 */
const fileRows = (postId: number, files: UploadedFile[], orderOf?: ReadonlyMap<string, number>) =>
  files.map((f, k) => ({
    post_id: postId,
    file_path: f.path,
    file_name: f.name.trim().slice(0, 200),
    file_size: f.size,
    content_type: f.type || null,
    sort_order: orderOf?.get(f.path) ?? k,
  }));

const denied = (error: { code?: string } | null) =>
  error?.code === "42501" ? "권한이 없어요. 다시 로그인해 주세요." : "저장하지 못했어요. 잠시 후 다시 시도해 주세요.";

const TESTING = "테스트 등급을 켠 동안에는 게시판을 쓸 수 없어요. 위 띠에서 테스트를 끝낸 뒤 해 주세요.";

/**
 * 직원 게시판 글 저장 (2026-10-21 Alan — "게시물 올리는건 우리가 기존에 작업했던 워드처럼 쓸 수 있는 기능을 그대로").
 * 강사 · 관리자 · 조교 — **로그인한 사람의 세션으로** 써서 RLS(`staff_posts: 직원 글쓰기` · `글쓴이 고치기`)가 한 번 더 막는다. 서비스 롤을 쓰지 않는다.
 * 글쓴이 id · 이름은 DB 트리거가 넣는다 — 여기서 보내지 않는다(그 칸은 grant 도 없다). 고치기는 글쓴이만이라 먼저 확인해 알아듣게 말한다.
 * 수업자료실 공지(`saveClassNotice`)와 같은 흐름이다 — 사진은 브라우저가 먼저 `staff-board/images/` 에 올렸고 여기서는 글만 저장한다.
 * 첨부 파일은 브라우저가 `staff-board/files/` 에 올리고 여기서는 파일 행만 만든다/고친다 (경로가 그 폴더인지 · 50MB · 20개를 다시 본다),
 * 링크는 `parseMaterialLinks` 로 다시 읽는다 (화면이 보낸 값을 믿지 않는다).
 *  - `fileOrder`(남긴 파일은 id, 새 파일은 경로 — 보이는 순서) · 고칠 때 `removeFileIds`(그 글의 파일만 — 저장소에서도 지운다) · `links`(안 보내면 그대로)
 *  - `levels`(2026-10-21 — 비우면 모든 레벨. 레벨 목록 lc_levels 에 있는 값만 받는다 · 안 보내면 새 글은 모든 레벨, 고칠 때는 그대로)
 *  - `subject` · `bookSet`(같은 날 — rc | lc · A | B, null = 모든 과목 · 모든 과정. 모르는 값은 받지 않는다 · 안 보내면(옛 화면) 새 글은 비우고, 고칠 때는 그대로)
 * 실패하면 이 액션이 만든 행은 되돌린다. 브라우저가 올린 파일은 브라우저가 지운다(`removeUploaded`).
 */
export async function saveStaffPost(input: {
  id?: number | null;
  title: string;
  body: string;
  levels?: number[] | null;
  subject?: string | null;
  bookSet?: string | null;
  files?: UploadedFile[] | null;
  removeFileIds?: number[] | null;
  fileOrder?: FileOrderItem[] | null;
  links?: LinkInput[] | null;
}): Promise<StaffPostResult> {
  const { user, profile } = await requireCrew();
  if (profile.test_role) return { ok: false, error: TESTING };

  const title = String(input.title ?? "").trim();
  const body = String(input.body ?? "").trim();
  const supabase = await createClient();
  // 레벨 — 안 보냈으면(옛 화면) 새 글은 모든 레벨, 고칠 때는 건드리지 않는다
  const levels = input.levels == null ? null : normalizeLevels(input.levels);
  // 과목 · 과정 — 안 보냈으면(undefined, 옛 화면) 고칠 때 그대로. 빈 값은 둘 다(null), 모르는 값은 아래 검사가 막는다
  const subject = input.subject === undefined ? undefined : input.subject || null;
  const bookSet = input.bookSet === undefined ? undefined : input.bookSet || null;
  const { data: levelRows } = levels?.length ? await supabase.from("lc_levels").select("level") : { data: null };
  const err = staffPostError({ title, body, levels: levels ?? [], subject, book_set: bookSet }, levelRows ? levelRows.map((l) => l.level) : undefined);
  if (err) return { ok: false, error: err };
  const cell = {
    ...(subject !== undefined ? { subject: normalizeSubject(subject) } : {}),
    ...(bookSet !== undefined ? { book_set: normalizeSet(bookSet) } : {}),
  };

  // 링크 — 안 보냈으면(undefined) null: 새 글은 링크 없음, 고칠 때는 그대로
  const parsedLinks = input.links === undefined ? null : parseMaterialLinks(input.links);
  if (parsedLinks && !parsedLinks.ok) return { ok: false, error: parsedLinks.error };
  const newLinks = parsedLinks?.links ?? null;

  // 새 첨부 파일 — 브라우저가 files/ 폴더에 올렸어야 한다 (경로 조작 · 사진 폴더 경로 방지). 같은 경로가 두 번 오면 한 번만
  const files = [...new Map((input.files ?? []).map((f) => [f?.path, f])).values()];
  for (const f of files) {
    if (!f || typeof f.path !== "string" || !isSafeObjectPath(f.path, STAFF_POST_FILE_FOLDER) || !String(f.name ?? "").trim() || !(f.size >= 0)) {
      return { ok: false, error: "파일 정보가 올바르지 않아요. 다시 올려 주세요." };
    }
    if (f.size > STAFF_POST_FILE_MAX_BYTES) return { ok: false, error: `${f.name}: 파일은 50MB 이하만 올릴 수 있어요.` };
  }

  if (!input.id) {
    if (files.length > STAFF_POST_FILES_MAX) return { ok: false, error: `파일은 한 글에 ${STAFF_POST_FILES_MAX}개까지 올릴 수 있어요.` };
    const { data, error } = await supabase.from("staff_posts").insert({ title, body, links: newLinks ?? [], levels: levels ?? [], ...cell }).select("id").single();
    if (error || !data) return { ok: false, error: denied(error) };
    if (files.length > 0) {
      // 새 글도 화면에서 옮긴 순서대로 (폼은 고른 순서로 올리고 순서는 fileOrder 로 따로 보낸다)
      const orderOf = fileOrderOf([], files, input.fileOrder);
      const orderByPath = new Map(files.map((f) => [f.path, orderOf.get(`path:${f.path}`) ?? 0]));
      const { error: filesError } = await supabase.from("staff_post_files").insert(fileRows(data.id, files, orderByPath));
      if (filesError) {
        // 파일이 빠진 글이 남지 않게 되돌린다 (올린 파일은 브라우저가 지운다)
        await supabase.from("staff_posts").delete().eq("id", data.id);
        return { ok: false, error: denied(filesError) };
      }
    }
    revalidateBoard(data.id);
    return { ok: true, id: data.id };
  }

  const id = Number(input.id);
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "잘못된 요청이에요." };
  const [{ data: old }, { data: oldFiles, error: oldFilesError }] = await Promise.all([
    supabase.from("staff_posts").select("body, author_id").eq("id", id).maybeSingle(),
    supabase.from("staff_post_files").select("id, file_path, file_name, sort_order").eq("post_id", id),
  ]);
  if (!old) return { ok: false, error: "글을 찾을 수 없어요. 새로고침해 주세요." };
  if (!canEditStaffPost(old, user.id)) return { ok: false, error: "내가 쓴 글만 고칠 수 있어요." };
  if (oldFilesError) return { ok: false, error: denied(oldFilesError) };

  const removeIds = new Set((input.removeFileIds ?? []).map(Number).filter((n) => Number.isInteger(n) && n > 0));
  const current = sortMaterialFiles(oldFiles ?? []);
  const removing = current.filter((f) => removeIds.has(f.id));
  const staying = current.filter((f) => !removeIds.has(f.id));
  if (staying.length + files.length > STAFF_POST_FILES_MAX) return { ok: false, error: `파일은 한 글에 ${STAFF_POST_FILES_MAX}개까지예요. 몇 개를 빼고 더해 주세요.` };

  // 파일 순서 — 화면이 보낸 순서로 0 부터 (남긴 파일 · 새 파일 함께). 새 파일은 그 번호로 넣고, 남긴 파일은 아래 4) 에서 번호가 달라진 것만 고친다
  const orderOf = fileOrderOf(staying, files, input.fileOrder);
  const orderByPath = new Map(files.map((f) => [f.path, orderOf.get(`path:${f.path}`) ?? 0]));

  // 1) 새 파일 행 — 실패하면 아무것도 바뀌지 않은 채 돌아간다
  let added: number[] = [];
  if (files.length > 0) {
    const { data, error } = await supabase.from("staff_post_files").insert(fileRows(id, files, orderByPath)).select("id");
    if (error) return { ok: false, error: denied(error) };
    added = (data ?? []).map((r) => r.id);
  }

  // 2) 글 행 — 실패하면 방금 넣은 파일 행을 되돌린다. 고친 시각은 트리거가 (제목 · 본문 · 링크 · 레벨 · 과목 · 과정이 바뀌었을 때만)
  const { data, error } = await supabase
    .from("staff_posts")
    .update({ title, body, ...(newLinks ? { links: newLinks } : {}), ...(levels ? { levels } : {}), ...cell })
    .eq("id", id)
    .select("id");
  if (error || !data?.length) {
    if (added.length) await supabase.from("staff_post_files").delete().in("id", added);
    return { ok: false, error: error ? denied(error) : "글을 찾을 수 없어요. 새로고침해 주세요." };
  }

  // 고치면서 본문에서 빠진 사진은 저장소에서 지운다 (사진 폴더 한 단계만 — 다른 경로를 글로 끌어와 지우지 못하게)
  const kept = new Set(noteImagePaths(body));
  const gone = noteImagePaths(old.body).filter((p) => !kept.has(p) && isNoteImagePath(p));
  if (gone.length) await supabase.storage.from(STAFF_BOARD_BUCKET).remove(gone);

  // 3) 뺀 첨부 파일 — 행을 지운 뒤 저장소에서도 지운다 (파일마다 경로가 달라 다른 글이 같은 파일을 쓰지 않는다)
  if (removing.length > 0) {
    const { data: dropped, error: removeError } = await supabase
      .from("staff_post_files")
      .delete()
      .eq("post_id", id)
      .in(
        "id",
        removing.map((f) => f.id),
      )
      .select("file_path");
    if (removeError) {
      revalidateBoard(id);
      return { ok: false, error: "제목 · 본문은 저장했지만 파일을 빼지 못했어요. 새로고침한 뒤 다시 빼 주세요." };
    }
    if (dropped?.length) await supabase.storage.from(STAFF_BOARD_BUCKET).remove(dropped.map((g) => g.file_path));
  }

  // 4) 남긴 파일의 순서 — 번호가 달라진 것만. 하나라도 못 적으면 알린다 — 제목 · 파일은 이미 저장됐다
  const reordered = staying.filter((f) => f.sort_order !== orderOf.get(`id:${f.id}`));
  if (reordered.length > 0) {
    const results = await Promise.all(
      reordered.map((f) => supabase.from("staff_post_files").update({ sort_order: orderOf.get(`id:${f.id}`) ?? f.sort_order }).eq("id", f.id).eq("post_id", id)),
    );
    if (results.some((r) => r.error)) {
      revalidateBoard(id);
      return { ok: false, error: "저장했지만 파일 순서를 다 적지 못했어요. 새로고침한 뒤 다시 옮겨 주세요." };
    }
  }

  revalidateBoard(id);
  return { ok: true, id };
}

/**
 * 글 지우기 — 글 · 사진 · 첨부 파일을 함께 지운다. 글쓴이와 강사 · 관리자만 (DB 정책 `staff_posts: 글쓴이·강사·관리자 지우기` 가 한 번 더 본다).
 * 저장소는 올린 사람 · 강사 · 관리자만 지울 수 있다 (`staff-board: 올린 사람·강사·관리자 지우기`) — 글쓴이가 올린 사진 · 파일이라 둘 다 지워진다.
 */
export async function deleteStaffPost(id: number): Promise<StaffPostResult> {
  const { user, profile } = await requireCrew();
  if (profile.test_role) return { ok: false, error: TESTING };
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "잘못된 요청이에요." };
  const supabase = await createClient();
  const { data: post } = await supabase.from("staff_posts").select("author_id").eq("id", id).maybeSingle();
  if (!post) return { ok: false, error: "글을 찾을 수 없어요. 새로고침해 주세요." };
  if (!canDeleteStaffPost(post, user.id, isStaff(profile.role))) return { ok: false, error: "내가 쓴 글만 지울 수 있어요. 강사 · 관리자는 모든 글을 지울 수 있어요." };
  // 첨부 파일 행은 글을 지우면 함께 사라지므로(on delete cascade) 경로를 먼저 읽어 둔다
  const { data: files } = await supabase.from("staff_post_files").select("file_path").eq("post_id", id);
  const { data, error } = await supabase.from("staff_posts").delete().eq("id", id).select("body");
  if (error) return { ok: false, error: "지우지 못했어요. 잠시 후 다시 시도해 주세요." };
  if (!data?.length) return { ok: false, error: "글을 찾을 수 없어요. 새로고침해 주세요." };
  const paths = data.flatMap((d) => noteImagePaths(d.body)).filter(isNoteImagePath);
  const filePaths = (files ?? []).map((f) => f.file_path);
  if (paths.length + filePaths.length) await supabase.storage.from(STAFF_BOARD_BUCKET).remove([...paths, ...filePaths]);
  revalidateBoard(id);
  return { ok: true };
}
