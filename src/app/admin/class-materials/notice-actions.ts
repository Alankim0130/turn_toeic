"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CLASS_NOTICE_BUCKET, CLASS_NOTICE_FILE_BUCKET, CLASS_NOTICE_FILE_FOLDER, noticeError } from "@/lib/class-notices";
import {
  CLASS_MATERIAL_FILES_MAX,
  CLASS_MATERIAL_MAX_BYTES,
  fileOrderOf,
  parseMaterialLinks,
  sortMaterialFiles,
  type FileOrderItem,
  type LinkInput,
} from "@/lib/class-materials";
import { noteImagePaths } from "@/lib/note-format";
import { isNoteImagePath, removeNoteImagesIfUnused } from "@/lib/note-images";
import { isSafeObjectPath, type UploadedFile } from "@/lib/upload";

export type NoticeResult = { ok: boolean; error?: string; id?: number };

function revalidateNotices(id?: number) {
  revalidatePath("/admin/class-materials");
  revalidatePath("/my/materials");
  if (id) revalidatePath(`/my/materials/notices/${id}`);
}

/** 파일 행으로 — 순서는 `orderOf`(경로 → 번호)가 있으면 그것, 없으면 고른 순서 그대로 */
const fileRows = (noticeId: number, files: UploadedFile[], orderOf?: ReadonlyMap<string, number>) =>
  files.map((f, k) => ({
    notice_id: noticeId,
    file_path: f.path,
    file_name: f.name.trim().slice(0, 200),
    file_size: f.size,
    content_type: f.type || null,
    sort_order: orderOf?.get(f.path) ?? k,
  }));

const denied = (error: { code?: string } | null) =>
  error?.code === "42501" ? "권한이 없어요. 강사·관리자 계정으로 다시 로그인해 주세요." : "저장하지 못했어요. 잠시 후 다시 시도해 주세요.";

/**
 * 수업자료실 공지 저장 (2026-10-05 Alan — "1회차 앞에 공지사항 … 여러개" · 범위 "전체공지인지, 레벨별이라면 레벨을 선택, RC LC도 선택" →
 * 2026-10-13 "공지사항에서도 파일올리기 등등 다 할 수 있도록").
 * 강사·관리자만 — 로그인한 사람의 세션으로 써서 RLS(`class_notices` · `class_notice_files: 스태프 …`)가 한 번 더 막는다.
 * 사진은 브라우저가 먼저 저장소(`class-notices/images/…`)에 올렸고, 여기서는 글만 저장한다. 고치면서 **빠진 사진은 저장소에서 지운다.**
 * **첨부 파일 · 링크는 수업자료실 자료와 같은 규칙이다** — 파일은 브라우저가 먼저 `class-materials/notices/…` 에 올리고 여기서는 파일 행만 만든다/고친다
 * (경로가 그 폴더인지 다시 본다 · 50MB · 20개), 링크는 `parseMaterialLinks` 로 다시 읽는다(화면이 보낸 값을 믿지 않는다).
 *  - `fileOrder`(남긴 파일은 id, 새 파일은 경로 — 학생이 보는 순서. 새 공지도 이것을 따른다) ·
 *    고칠 때 `removeFileIds`(그 공지의 파일만 — 저장소에서도 지운다) · `links`(안 보내면 그대로, 보내면 그 목록으로 갈아 끼운다)
 * 실패하면 이 액션이 만든 행은 되돌린다. 브라우저가 올린 파일은 브라우저가 지운다(`removeUploaded`).
 * 작성자 이름은 처음 올린 사람 그대로 둔다 (학생은 profiles 를 못 읽어 이름을 박아 둔다).
 */
export async function saveClassNotice(input: {
  id?: number | null;
  title: string;
  body: string;
  levels: number[];
  subjects: string[];
  /** 이번에 새로 올린 첨부 파일 (2026-10-13) — 없으면 빈 배열 */
  files?: UploadedFile[] | null;
  /** 고칠 때 뺄 첨부 파일 id (그 공지의 파일만 받는다) */
  removeFileIds?: number[] | null;
  /** 파일 순서 — 남긴 파일은 id, 새 파일은 경로. 안 보내면 남긴 파일 → 새 파일(올린 순서) 그대로 */
  fileOrder?: FileOrderItem[] | null;
  /** 링크 목록 (2026-10-13) — 고칠 때 안 보내면 그대로 둔다 */
  links?: LinkInput[] | null;
}): Promise<NoticeResult> {
  const { user, profile } = await requireStaff();
  if (profile.test_role) return { ok: false, error: "테스트 등급을 켠 동안에는 공지를 올리거나 고칠 수 없어요. 위 띠에서 테스트를 끝낸 뒤 해 주세요." };

  const supabase = await createClient();
  const { data: levelRows } = await supabase.from("lc_levels").select("level");
  const levels = [...new Set((input.levels ?? []).map(Number))].sort((a, b) => a - b);
  const subjects = [...new Set(input.subjects ?? [])];
  const title = String(input.title ?? "").trim();
  const body = String(input.body ?? "").trim();
  const err = noticeError({ title, body, levels, subjects }, (levelRows ?? []).map((l) => l.level));
  if (err) return { ok: false, error: err };
  // 둘 다 고르면 "둘 다" 와 같다 — 비워 둔다 (범위 이름이 깔끔하다)
  const subj = subjects.length >= 2 ? [] : subjects;

  // 링크 — 안 보냈으면(undefined) null: 새 공지는 링크 없음, 고칠 때는 그대로
  const parsedLinks = input.links === undefined ? null : parseMaterialLinks(input.links);
  if (parsedLinks && !parsedLinks.ok) return { ok: false, error: parsedLinks.error };
  const newLinks = parsedLinks?.links ?? null;

  // 새 첨부 파일 — 브라우저가 공지 폴더(notices/)에 올렸어야 한다 (경로 조작 · 수업자료 폴더 경로 방지). 같은 경로가 두 번 오면 한 번만
  const files = [...new Map((input.files ?? []).map((f) => [f?.path, f])).values()];
  for (const f of files) {
    if (!f || typeof f.path !== "string" || !isSafeObjectPath(f.path, CLASS_NOTICE_FILE_FOLDER) || !String(f.name ?? "").trim() || !(f.size >= 0)) {
      return { ok: false, error: "파일 정보가 올바르지 않아요. 다시 올려 주세요." };
    }
    if (f.size > CLASS_MATERIAL_MAX_BYTES) return { ok: false, error: `${f.name}: 파일은 50MB 이하만 올릴 수 있어요.` };
  }

  if (!input.id) {
    if (files.length > CLASS_MATERIAL_FILES_MAX) return { ok: false, error: `파일은 한 공지에 ${CLASS_MATERIAL_FILES_MAX}개까지 올릴 수 있어요.` };
    const { data, error } = await supabase
      .from("class_notices")
      .insert({ title, body, levels, subjects: subj, links: newLinks ?? [], author_id: user.id, author_name: (profile.name || "강사").slice(0, 40) })
      .select("id")
      .single();
    if (error || !data) return { ok: false, error: denied(error) };
    if (files.length > 0) {
      // 새 공지도 화면에서 옮긴 순서대로 (폼은 고른 순서로 올리고 순서는 fileOrder 로 따로 보낸다)
      const orderOf = fileOrderOf([], files, input.fileOrder);
      const orderByPath = new Map(files.map((f) => [f.path, orderOf.get(`path:${f.path}`) ?? 0]));
      const { error: filesError } = await supabase.from("class_notice_files").insert(fileRows(data.id, files, orderByPath));
      if (filesError) {
        // 파일이 빠진 공지가 남지 않게 되돌린다 (올린 파일은 브라우저가 지운다)
        await supabase.from("class_notices").delete().eq("id", data.id);
        return { ok: false, error: denied(filesError) };
      }
    }
    revalidateNotices(data.id);
    return { ok: true, id: data.id };
  }

  const id = Number(input.id);
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "잘못된 요청이에요." };
  const [{ data: old }, { data: oldFiles, error: oldFilesError }] = await Promise.all([
    supabase.from("class_notices").select("body").eq("id", id).maybeSingle(),
    supabase.from("class_notice_files").select("id, file_path, file_name, sort_order").eq("notice_id", id),
  ]);
  if (!old) return { ok: false, error: "공지를 찾을 수 없어요. 새로고침해 주세요." };
  if (oldFilesError) return { ok: false, error: denied(oldFilesError) };

  const removeIds = new Set((input.removeFileIds ?? []).map(Number).filter((n) => Number.isInteger(n) && n > 0));
  const current = sortMaterialFiles(oldFiles ?? []);
  const removing = current.filter((f) => removeIds.has(f.id));
  const staying = current.filter((f) => !removeIds.has(f.id));
  if (staying.length + files.length > CLASS_MATERIAL_FILES_MAX) return { ok: false, error: `파일은 한 공지에 ${CLASS_MATERIAL_FILES_MAX}개까지예요. 몇 개를 빼고 더해 주세요.` };

  // 파일 순서 — 화면이 보낸 순서로 0 부터 (남긴 파일 · 새 파일 함께). 새 파일은 그 번호로 넣고, 남긴 파일은 아래 4) 에서 번호가 달라진 것만 고친다
  const orderOf = fileOrderOf(staying, files, input.fileOrder);
  const orderByPath = new Map(files.map((f) => [f.path, orderOf.get(`path:${f.path}`) ?? 0]));

  // 1) 새 파일 행 — 실패하면 아무것도 바뀌지 않은 채 돌아간다
  let added: number[] = [];
  if (files.length > 0) {
    const { data, error } = await supabase.from("class_notice_files").insert(fileRows(id, files, orderByPath)).select("id");
    if (error) return { ok: false, error: denied(error) };
    added = (data ?? []).map((r) => r.id);
  }

  // 2) 공지 행 — 실패하면 방금 넣은 파일 행을 되돌린다
  const { data, error } = await supabase
    .from("class_notices")
    .update({ title, body, levels, subjects: subj, ...(newLinks ? { links: newLinks } : {}), updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id");
  if (error || !data?.length) {
    if (added.length) await supabase.from("class_notice_files").delete().in("id", added);
    return { ok: false, error: error ? denied(error) : "공지를 찾을 수 없어요. 새로고침해 주세요." };
  }

  // 고치면서 본문에서 빠진 사진은 저장소에서 지운다
  const kept = new Set(noteImagePaths(body));
  const gone = noteImagePaths(old.body).filter((p) => !kept.has(p) && isNoteImagePath(p));
  if (gone.length) await removeNoteImagesIfUnused(supabase, { bucket: CLASS_NOTICE_BUCKET, table: "class_notices" }, gone);

  // 3) 뺀 첨부 파일 — 행을 지운 뒤 저장소에서도 지운다 (파일마다 경로가 달라 다른 공지 · 자료가 같은 파일을 쓰지 않는다)
  if (removing.length > 0) {
    const { data: dropped, error: removeError } = await supabase
      .from("class_notice_files")
      .delete()
      .eq("notice_id", id)
      .in(
        "id",
        removing.map((f) => f.id),
      )
      .select("file_path");
    if (removeError) {
      revalidateNotices(id);
      return { ok: false, error: "제목 · 본문은 저장했지만 파일을 빼지 못했어요. 새로고침한 뒤 다시 빼 주세요." };
    }
    if (dropped?.length) await supabase.storage.from(CLASS_NOTICE_FILE_BUCKET).remove(dropped.map((g) => g.file_path));
  }

  // 4) 남긴 파일의 순서 — 번호가 달라진 것만. 하나라도 못 적으면 알린다 — 제목 · 파일은 이미 저장됐다
  const reordered = staying.filter((f) => f.sort_order !== orderOf.get(`id:${f.id}`));
  if (reordered.length > 0) {
    const results = await Promise.all(
      reordered.map((f) => supabase.from("class_notice_files").update({ sort_order: orderOf.get(`id:${f.id}`) ?? f.sort_order }).eq("id", f.id).eq("notice_id", id)),
    );
    if (results.some((r) => r.error)) {
      revalidateNotices(id);
      return { ok: false, error: "저장했지만 파일 순서를 다 적지 못했어요. 새로고침한 뒤 다시 옮겨 주세요." };
    }
  }

  revalidateNotices(id);
  return { ok: true, id };
}

/**
 * 공지 내리기 · 다시 올리기 (2026-10-06 Alan — "공지가 달마다 바뀌는 경우가 있어 … 등록했다가 내리기 … 내려간 게시글에 다시 올리기 토글").
 * 지우지 않고 `published` 만 바꾼다 — 글·사진은 그대로고 학생 화면에서만 빠진다. 로그인한 세션으로 UPDATE 해 RLS 가 한 번 더 막는다.
 */
export async function setClassNoticePublished(id: number, published: boolean): Promise<NoticeResult> {
  const { profile } = await requireStaff();
  if (profile.test_role) return { ok: false, error: "테스트 등급을 켠 동안에는 공지를 내리거나 올릴 수 없어요. 위 띠에서 테스트를 끝낸 뒤 해 주세요." };
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "잘못된 요청이에요." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("class_notices")
    .update({ published: !!published, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id");
  if (error) return { ok: false, error: error.code === "42501" ? "권한이 없어요. 강사·관리자 계정으로 다시 로그인해 주세요." : "바꾸지 못했어요. 잠시 후 다시 시도해 주세요." };
  if (!data?.length) return { ok: false, error: "공지를 찾을 수 없어요. 새로고침해 주세요." };
  revalidateNotices(id);
  return { ok: true, id };
}

/** 공지 삭제 — 글 · 사진 · 첨부 파일을 함께 지운다. 학생 화면에서도 바로 빠진다 */
export async function deleteClassNotice(id: number): Promise<NoticeResult> {
  const { profile } = await requireStaff();
  if (profile.test_role) return { ok: false, error: "테스트 등급을 켠 동안에는 지울 수 없어요. 위 띠에서 테스트를 끝낸 뒤 해 주세요." };
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "잘못된 요청이에요." };
  const supabase = await createClient();
  // 첨부 파일 행은 공지를 지우면 함께 사라지므로(on delete cascade) 경로를 먼저 읽어 둔다
  const { data: files } = await supabase.from("class_notice_files").select("file_path").eq("notice_id", id);
  const { data, error } = await supabase.from("class_notices").delete().eq("id", id).select("body");
  if (error) return { ok: false, error: "삭제하지 못했어요." };
  if (!data?.length) return { ok: false, error: "공지를 찾을 수 없어요. 새로고침해 주세요." };
  // 사진은 다른 공지가 아직 가리키면 남긴다 (공지를 지운 뒤에 센다)
  const paths = data.flatMap((d) => noteImagePaths(d.body));
  if (paths.length) await removeNoteImagesIfUnused(supabase, { bucket: CLASS_NOTICE_BUCKET, table: "class_notices" }, paths);
  if (files?.length) await supabase.storage.from(CLASS_NOTICE_FILE_BUCKET).remove(files.map((f) => f.file_path));
  revalidateNotices(id);
  return { ok: true };
}
