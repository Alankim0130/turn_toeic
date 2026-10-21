"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { materialMoveBlock, materialMoveIssue, movedFromOf, moveTargetError, moveTargetOf, pathMap, type BulkPost, type CopyStep, type MovedFrom } from "@/lib/board-move";
import {
  CLASS_MATERIAL_BUCKET,
  CLASS_MATERIAL_FILES_MAX,
  materialLinks,
  materialObjectPath,
  noteTooLong,
  sortMaterialFiles,
  type MaterialLink,
} from "@/lib/class-materials";
import { CLASS_NOTICE_BUCKET, CLASS_NOTICE_FILE_BUCKET, CLASS_NOTICE_IMAGE_FOLDER, noticeError, noticeFilePath } from "@/lib/class-notices";
import { noteImagePaths, rewriteNoteImages } from "@/lib/note-format";
import { isNoteImagePath } from "@/lib/note-images";
import { normalizeLevels, STAFF_BOARD_BUCKET, STAFF_POST_IMAGE_FOLDER, staffPostError, staffPostFilePath } from "@/lib/staff-board";
import { objectName } from "@/lib/upload";
import { nextMaterialOrder } from "@/app/admin/class-materials/_lib/next-order";

/**
 * 직원 게시판 ↔ 수업자료실 옮기기 (2026-10-21 Alan — "이 게시물을 수업게시판으로 옮길 수 있으면 좋겠어. 반대로 수업게시물에 있는 내용을
 * 다시 직원게시판으로 옮길 수 도 있어야해"). 규칙은 `src/lib/board-move.ts`.
 *
 * **강사 · 관리자만** (`requireStaff` — 수업자료실 쓰기가 강사 · 관리자다). 모두 **로그인한 사람의 세션으로** 한다 — 서비스 롤을 쓰지 않는다.
 * 저장소 복사(`copy` — 원래 파일 조회 + 새 자리 올리기 권한이 필요하다)도, 행 넣기 · 지우기도 RLS 를 한 번 더 거친다.
 * 순서: ① 사진 · 파일을 새 이름으로 복사 → ② 새 행(+ 파일 행) → ③ 원래 행 지우기(파일 행은 함께) → ④ 원래 사진 · 파일 지우기.
 * ② · ③ 이 실패하면 만든 행과 복사한 파일을 지우고 원래 글은 그대로 둔다 — 글이 둘이 되거나 사라지지 않게.
 * ④ 가 실패하면 원래 파일만 저장소에 남는다 (가리키는 행이 없어 아무에게도 안 보인다 — 공지 사진을 올리고 저장하지 않은 것과 같다).
 *
 * **여러 개 한꺼번에** (같은 날 Alan "여러개를 한번에 선택해서 넘길수 있도록 … 전체선택도") — 화면이 같은 액션을 하나씩 차례로 부른다 (`quiet` — 화면을 매번 다시
 * 그리지 않게). 다 끝나면 `finishBoardMoves` 가 한 번 새로 그린다. 직원 글은 먼저 `planStaffPostsMove` 로 회차 자료로 갈 수 있는지 · 원래 자리를 읽는다.
 * `stop` = 다음 것도 똑같이 실패할 까닭(테스트 등급 · 권한) — 화면이 거기서 멈춘다.
 */

export type MoveResult = { ok: boolean; error?: string; href?: string; stop?: boolean };
/** `quiet` — 여러 개를 차례로 옮길 때 하나마다 화면을 새로 그리지 않는다 (끝에 `finishBoardMoves` 가 한 번) */
export type MoveOptions = { quiet?: boolean };

const TESTING = "테스트 등급을 켠 동안에는 옮길 수 없어요. 위 띠에서 테스트를 끝낸 뒤 해 주세요.";
const BAD = "잘못된 요청이에요.";
const COPY_FAIL = "사진 · 파일을 옮기지 못했어요. 잠시 후 다시 시도해 주세요.";

const denied = (error: { code?: string } | null, fallback: string) =>
  error?.code === "42501" ? "권한이 없어요. 강사 · 관리자 계정으로 다시 로그인해 주세요." : fallback;

/** 실패 — 권한(42501)이면 다음 것도 똑같이 막히므로 여러 개 옮기기를 멈추게 한다 */
const fail = (error: { code?: string } | null, fallback: string): MoveResult => ({ ok: false, error: denied(error, fallback), stop: error?.code === "42501" });
const TESTING_STOP: MoveResult = { ok: false, error: TESTING, stop: true };

/** 이 액션이 복사한 파일 — 실패하면 지운다 */
type Copied = { bucket: string; paths: string[] };

async function removeCopied(supabase: SupabaseClient, copied: Copied[]) {
  for (const c of copied) if (c.paths.length) await supabase.storage.from(c.bucket).remove(c.paths);
}

/**
 * 파일 하나 복사 — Supabase 저장소의 버킷 사이 복사(`copy` + destinationBucket)는 저장소 서버 안에서 하므로 큰 파일(50MB)도 우리 함수로 내려받지 않는다.
 * 그 복사가 안 되면(저장소가 버킷 사이 복사를 못 받는 판 등) 받아서 다시 올린다 — 같은 세션이라 권한은 같다
 */
async function copyOne(supabase: SupabaseClient, fromBucket: string, toBucket: string, step: CopyStep): Promise<boolean> {
  const { error } = await supabase.storage.from(fromBucket).copy(step.from, step.to, { destinationBucket: toBucket });
  if (!error) return true;
  const { data: blob, error: downloadError } = await supabase.storage.from(fromBucket).download(step.from);
  if (downloadError || !blob) return false;
  const { error: uploadError } = await supabase.storage.from(toBucket).upload(step.to, blob, { contentType: blob.type || undefined, upsert: false });
  return !uploadError;
}

/** 저장소 복사 — 다섯 개씩. 하나라도 못 하면 false (이미 복사한 것은 `copied` 에 남아 부르는 쪽이 지운다) */
async function copyAll(supabase: SupabaseClient, fromBucket: string, toBucket: string, steps: readonly CopyStep[], copied: Copied[]): Promise<boolean> {
  const done: Copied = { bucket: toBucket, paths: [] };
  copied.push(done);
  for (let i = 0; i < steps.length; i += 5) {
    const chunk = steps.slice(i, i + 5);
    const results = await Promise.all(chunk.map((s) => copyOne(supabase, fromBucket, toBucket, s)));
    results.forEach((ok, k) => {
      if (ok) done.paths.push(chunk[k].to);
    });
    if (results.some((ok) => !ok)) return false;
  }
  return true;
}

/** 원래 글을 지운다 — 지워진 줄이 없으면(그 사이 누가 지웠거나 옮겼다) 실패로 본다 */
async function dropSource(supabase: SupabaseClient, table: "staff_posts" | "class_notices" | "class_materials", id: number): Promise<boolean> {
  const { data, error } = await supabase.from(table).delete().eq("id", id).select("id");
  return !error && (data?.length ?? 0) > 0;
}

function revalidateAll(paths: string[], opts?: MoveOptions) {
  if (opts?.quiet === true) return;
  revalidatePath("/admin/board");
  revalidatePath("/admin/class-materials");
  revalidatePath("/my/materials");
  for (const p of paths) revalidatePath(p);
}

type FileLike = { file_name: string; file_size: number | null; content_type: string | null };

/** 새 파일 행 (부모 id 는 부르는 쪽이 붙인다) — 순서는 원래 순서 그대로, 번호는 0 부터 다시 */
const fileRowsOf = (files: readonly FileLike[], steps: readonly CopyStep[]) =>
  files.map((f, k) => ({ file_path: steps[k].to, file_name: f.file_name, file_size: f.file_size, content_type: f.content_type, sort_order: k }));

/**
 * 직원 글 → 수업자료실 (공지사항 또는 회차 자료). 옮긴 사람이 글쓴이가 되고 올린 시각은 지금이다.
 * 공지사항은 학생에게 **바로** 보이고(범위 수강생), 회차 자료는 그 과정을 듣는 반의 회차 수업일부터 보인다 (수업자료실 규칙 그대로).
 */
export async function moveStaffPostToClass(input: { id: number; target: unknown }, opts?: MoveOptions): Promise<MoveResult> {
  const { user, profile } = await requireStaff();
  if (profile.test_role) return TESTING_STOP;
  const id = Number(input?.id);
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: BAD };
  const target = moveTargetOf(input?.target);
  if (!target) return { ok: false, error: "옮길 곳을 다시 골라 주세요." };

  const supabase = await createClient();
  const [{ data: levelRows }, { data: post }] = await Promise.all([
    supabase.from("lc_levels").select("level"),
    supabase
      .from("staff_posts")
      .select("id, title, body, links, staff_post_files(id, file_path, file_name, file_size, content_type, sort_order)")
      .eq("id", id)
      .maybeSingle(),
  ]);
  if (!post) return { ok: false, error: "글을 찾을 수 없어요. 새로고침해 주세요." };
  const known = (levelRows ?? []).map((l) => l.level);
  const targetError = moveTargetError(target, known);
  if (targetError) return { ok: false, error: targetError };

  const files = sortMaterialFiles(post.staff_post_files);
  const links = materialLinks(post.links);
  if (files.length > CLASS_MATERIAL_FILES_MAX) return { ok: false, error: `파일이 ${CLASS_MATERIAL_FILES_MAX}개를 넘어 옮길 수 없어요. 몇 개를 뺀 뒤 옮겨 주세요.` };
  const copied: Copied[] = [];

  if (target.kind === "notice") {
    const err = noticeError({ title: post.title, body: post.body, levels: target.levels, subjects: target.subjects }, known);
    if (err) return { ok: false, error: err };
    // 사진은 공지 사진 버킷의 images/ 로, 첨부 파일은 수업자료실 버킷의 notices/ 로 — 새 이름으로
    const images = noteImagePaths(post.body).filter(isNoteImagePath);
    const imageSteps = images.map((from) => ({ from, to: `${CLASS_NOTICE_IMAGE_FOLDER}${objectName({ name: from })}` }));
    const fileSteps = files.map((f) => ({ from: f.file_path, to: noticeFilePath({ name: f.file_name }) }));
    if (!(await copyAll(supabase, STAFF_BOARD_BUCKET, CLASS_NOTICE_BUCKET, imageSteps, copied)) || !(await copyAll(supabase, STAFF_BOARD_BUCKET, CLASS_NOTICE_FILE_BUCKET, fileSteps, copied))) {
      await removeCopied(supabase, copied);
      return { ok: false, error: COPY_FAIL };
    }
    const { data: notice, error } = await supabase
      .from("class_notices")
      .insert({
        title: post.title,
        body: rewriteNoteImages(post.body, pathMap(imageSteps)),
        levels: target.levels,
        subjects: target.subjects,
        links,
        author_id: user.id,
        author_name: (profile.name || "강사").slice(0, 40),
      })
      .select("id")
      .single();
    if (error || !notice) {
      await removeCopied(supabase, copied);
      return fail(error, "공지로 옮기지 못했어요. 잠시 후 다시 시도해 주세요.");
    }
    const undo = async () => {
      await supabase.from("class_notices").delete().eq("id", notice.id);
      await removeCopied(supabase, copied);
    };
    if (files.length > 0) {
      const { error: filesError } = await supabase.from("class_notice_files").insert(fileRowsOf(files, fileSteps).map((r) => ({ ...r, notice_id: notice.id })));
      if (filesError) {
        await undo();
        return fail(filesError, "공지로 옮기지 못했어요. 잠시 후 다시 시도해 주세요.");
      }
    }
    if (!(await dropSource(supabase, "staff_posts", id))) {
      await undo();
      return { ok: false, error: "직원 게시판에서 글을 빼지 못해 옮기지 않았어요. 이미 지워졌거나 옮겨졌을 수 있어요 — 새로고침해 주세요." };
    }
    const leftovers = [...images, ...files.map((f) => f.file_path)];
    if (leftovers.length) await supabase.storage.from(STAFF_BOARD_BUCKET).remove(leftovers);
    revalidateAll([`/admin/board/${id}`, `/my/materials/notices/${notice.id}`], opts);
    const level = target.levels[0];
    return { ok: true, href: `/admin/class-materials/notices/${notice.id}${level ? `?level=${level}` : ""}` };
  }

  // 회차 자료 — 사진이 든 글은 못 간다 (안내에 사진을 넣을 수 없다). 첨부 파일은 그 레벨 · 과목 폴더로
  const block = materialMoveBlock({ body: post.body, files: files.length, links: links.length });
  if (block) return { ok: false, error: block };
  // 안내 · 스크립트는 자료 올리기(`saveClassMaterial`)와 같이 앞뒤 빈칸을 떼고 비면 null
  const note = post.body.trim();
  const tooLong = noteTooLong(note);
  if (tooLong) return { ok: false, error: tooLong };
  const fileSteps = files.map((f) => ({ from: f.file_path, to: materialObjectPath(target.level, target.subject, { name: f.file_name }) }));
  if (!(await copyAll(supabase, STAFF_BOARD_BUCKET, CLASS_MATERIAL_BUCKET, fileSteps, copied))) {
    await removeCopied(supabase, copied);
    return { ok: false, error: COPY_FAIL };
  }
  const { data: material, error } = await supabase
    .from("class_materials")
    .insert({
      level: target.level,
      subject: target.subject,
      book_set: target.set,
      seq: target.seq,
      title: post.title,
      note: note || null,
      links,
      uploaded_by: user.id,
      // 그 회차의 끝에 선다 — 여러 개를 한 회차로 옮기면 옮긴 순서대로 (자료 올리기와 같은 규칙)
      sort_order: await nextMaterialOrder(supabase, target),
    })
    .select("id")
    .single();
  if (error || !material) {
    await removeCopied(supabase, copied);
    return fail(error, "회차 자료로 옮기지 못했어요. 잠시 후 다시 시도해 주세요.");
  }
  const undo = async () => {
    await supabase.from("class_materials").delete().eq("id", material.id);
    await removeCopied(supabase, copied);
  };
  if (files.length > 0) {
    const { error: filesError } = await supabase.from("class_material_files").insert(fileRowsOf(files, fileSteps).map((r) => ({ ...r, material_id: material.id })));
    if (filesError) {
      await undo();
      return fail(filesError, "회차 자료로 옮기지 못했어요. 잠시 후 다시 시도해 주세요.");
    }
  }
  if (!(await dropSource(supabase, "staff_posts", id))) {
    await undo();
    return { ok: false, error: "직원 게시판에서 글을 빼지 못해 옮기지 않았어요. 이미 지워졌거나 옮겨졌을 수 있어요 — 새로고침해 주세요." };
  }
  if (files.length) await supabase.storage.from(STAFF_BOARD_BUCKET).remove(files.map((f) => f.file_path));
  revalidateAll([`/admin/board/${id}`], opts);
  return { ok: true, href: `/admin/class-materials?level=${target.level}&cell=${target.subject}-${target.set}` };
}

/**
 * 직원 게시판에 새 글로 넣는다 (옮겨 오는 쪽 공통). 글쓴이는 트리거가 옮긴 사람으로 적는다 — 그래서 첨부 파일 행도 글쓴이 정책으로 넣을 수 있다.
 * 실패하면 넣은 글과 복사한 파일을 되돌리고 null
 */
async function insertBoardPost(
  supabase: SupabaseClient,
  post: { title: string; body: string; links: MaterialLink[]; levels: number[]; moved_from: MovedFrom },
  files: readonly FileLike[],
  fileSteps: readonly CopyStep[],
  copied: Copied[],
): Promise<{ id: number; undo: () => Promise<void> } | { fail: MoveResult }> {
  const { data, error } = await supabase
    .from("staff_posts")
    .insert({ title: post.title, body: post.body, links: post.links, levels: post.levels, moved_from: post.moved_from })
    .select("id")
    .single();
  if (error || !data) {
    await removeCopied(supabase, copied);
    return { fail: fail(error, "직원 게시판으로 옮기지 못했어요. 잠시 후 다시 시도해 주세요.") };
  }
  const undo = async () => {
    await supabase.from("staff_posts").delete().eq("id", data.id);
    await removeCopied(supabase, copied);
  };
  if (files.length > 0) {
    const { error: filesError } = await supabase.from("staff_post_files").insert(fileRowsOf(files, fileSteps).map((r) => ({ ...r, post_id: data.id })));
    if (filesError) {
      await undo();
      return { fail: fail(filesError, "직원 게시판으로 옮기지 못했어요. 잠시 후 다시 시도해 주세요.") };
    }
  }
  return { id: data.id, undo };
}

const SOURCE_GONE = "수업자료실에서 빼지 못해 옮기지 않았어요. 이미 지워졌거나 옮겨졌을 수 있어요 — 새로고침해 주세요.";

/**
 * 수업자료실 공지 → 직원 게시판. 학생 화면에서 바로 빠진다. 레벨은 공지 범위의 레벨 그대로(RC/LC 는 직원 게시판에 없다 — 원래 자리에 적어 둔다).
 * 사진은 직원 게시판 images/ 로, 첨부 파일은 files/ 로 새 이름으로 복사한다
 */
export async function moveClassNoticeToBoard(id: number, opts?: MoveOptions): Promise<MoveResult> {
  const { profile } = await requireStaff();
  if (profile.test_role) return TESTING_STOP;
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: BAD };
  const supabase = await createClient();
  const [{ data: levelRows }, { data: notice }] = await Promise.all([
    supabase.from("lc_levels").select("level"),
    supabase
      .from("class_notices")
      .select("id, title, body, levels, subjects, links, class_notice_files(id, file_path, file_name, file_size, content_type, sort_order)")
      .eq("id", id)
      .maybeSingle(),
  ]);
  if (!notice) return { ok: false, error: "공지를 찾을 수 없어요. 새로고침해 주세요." };
  const known = (levelRows ?? []).map((l) => l.level);
  const levels = normalizeLevels(notice.levels).filter((l) => known.includes(l));
  const err = staffPostError({ title: notice.title, body: notice.body, levels }, known);
  if (err) return { ok: false, error: err };

  const files = sortMaterialFiles(notice.class_notice_files);
  const images = noteImagePaths(notice.body).filter(isNoteImagePath);
  const imageSteps = images.map((from) => ({ from, to: `${STAFF_POST_IMAGE_FOLDER}${objectName({ name: from })}` }));
  const fileSteps = files.map((f) => ({ from: f.file_path, to: staffPostFilePath({ name: f.file_name }) }));
  const copied: Copied[] = [];
  if (!(await copyAll(supabase, CLASS_NOTICE_BUCKET, STAFF_BOARD_BUCKET, imageSteps, copied)) || !(await copyAll(supabase, CLASS_NOTICE_FILE_BUCKET, STAFF_BOARD_BUCKET, fileSteps, copied))) {
    await removeCopied(supabase, copied);
    return { ok: false, error: COPY_FAIL };
  }
  const subjects = (notice.subjects ?? []).filter((s): s is "rc" | "lc" => s === "rc" || s === "lc");
  const made = await insertBoardPost(
    supabase,
    {
      title: notice.title,
      body: rewriteNoteImages(notice.body, pathMap(imageSteps)),
      links: materialLinks(notice.links),
      levels,
      moved_from: { kind: "notice", levels, subjects },
    },
    files,
    fileSteps,
    copied,
  );
  if ("fail" in made) return made.fail;
  if (!(await dropSource(supabase, "class_notices", id))) {
    await made.undo();
    return { ok: false, error: SOURCE_GONE };
  }
  if (images.length) await supabase.storage.from(CLASS_NOTICE_BUCKET).remove(images);
  if (files.length) await supabase.storage.from(CLASS_NOTICE_FILE_BUCKET).remove(files.map((f) => f.file_path));
  revalidateAll([`/my/materials/notices/${id}`, `/admin/class-materials/notices/${id}`, `/admin/board/${made.id}`], opts);
  return { ok: true, href: `/admin/board/${made.id}` };
}

/**
 * 수업자료실 회차 자료 → 직원 게시판. 학생 화면에서 바로 빠진다. 레벨은 자료의 레벨, 과목 · 과정 · 회차는 원래 자리에 적어 두어
 * 다시 옮길 때 그 회차가 미리 골라진다. 안내 · 스크립트는 본문이 되고 첨부 파일은 files/ 로 새 이름으로 복사한다
 */
export async function moveClassMaterialToBoard(id: number, opts?: MoveOptions): Promise<MoveResult> {
  const { profile } = await requireStaff();
  if (profile.test_role) return TESTING_STOP;
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: BAD };
  const supabase = await createClient();
  const [{ data: levelRows }, { data: material }] = await Promise.all([
    supabase.from("lc_levels").select("level"),
    supabase
      .from("class_materials")
      .select("id, level, subject, book_set, seq, title, note, links, class_material_files(id, file_path, file_name, file_size, content_type, sort_order)")
      .eq("id", id)
      .maybeSingle(),
  ]);
  if (!material) return { ok: false, error: "자료를 찾을 수 없어요. 새로고침해 주세요." };
  const known = (levelRows ?? []).map((l) => l.level);
  const levels = known.includes(material.level) ? [material.level] : [];
  const body = material.note ?? "";
  const err = staffPostError({ title: material.title, body, levels }, known);
  if (err) return { ok: false, error: err };

  const files = sortMaterialFiles(material.class_material_files);
  const fileSteps = files.map((f) => ({ from: f.file_path, to: staffPostFilePath({ name: f.file_name }) }));
  const copied: Copied[] = [];
  if (!(await copyAll(supabase, CLASS_MATERIAL_BUCKET, STAFF_BOARD_BUCKET, fileSteps, copied))) {
    await removeCopied(supabase, copied);
    return { ok: false, error: COPY_FAIL };
  }
  const subject = material.subject === "lc" ? "lc" : "rc";
  const set = material.book_set === "A" || material.book_set === "B" ? material.book_set : null;
  const made = await insertBoardPost(
    supabase,
    {
      title: material.title,
      body,
      links: materialLinks(material.links),
      levels,
      moved_from: { kind: "material", level: material.level, subject, set, seq: set ? material.seq : null },
    },
    files,
    fileSteps,
    copied,
  );
  if ("fail" in made) return made.fail;
  if (!(await dropSource(supabase, "class_materials", id))) {
    await made.undo();
    return { ok: false, error: SOURCE_GONE };
  }
  if (files.length) await supabase.storage.from(CLASS_MATERIAL_BUCKET).remove(files.map((f) => f.file_path));
  revalidateAll([`/admin/board/${made.id}`], opts);
  return { ok: true, href: `/admin/board/${made.id}` };
}

/** 한 번에 고를 수 있는 직원 글 수 — 목록 한 쪽(20개)보다 넉넉히 */
const PLAN_MAX = 100;

/**
 * 여러 개 수업자료실로 옮기기 전에 — 고른 글마다 회차 자료로 갈 수 있는지(사진 · 빈 글)와 원래 자리를 읽는다. 바꾸는 것은 없다.
 * 본문을 목록 화면에서 읽지 않으려고(글마다 5만 자까지) 대화창을 열 때 여기서 한 번 읽어 줄여 준다. **오래된 글부터** 준다 —
 * 화면이 그 순서로 옮겨 같은 회차 · 공지 목록에서 쓴 순서가 이어진다. 그 사이 지워진 글은 빠진다 (화면이 '이미 옮겨졌거나 지워진 글' 로 적는다).
 */
export async function planStaffPostsMove(ids: unknown): Promise<{ ok: true; posts: BulkPost[] } | { ok: false; error: string }> {
  const { profile } = await requireStaff();
  if (profile.test_role) return { ok: false, error: TESTING };
  const list = Array.isArray(ids) ? [...new Set(ids.map(Number).filter((n) => Number.isInteger(n) && n > 0))] : [];
  if (list.length === 0) return { ok: false, error: "옮길 글을 골라 주세요." };
  if (list.length > PLAN_MAX) return { ok: false, error: `한 번에 ${PLAN_MAX}개까지 옮길 수 있어요.` };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("staff_posts")
    .select("id, title, body, links, levels, moved_from, staff_post_files(count)")
    .in("id", list)
    .order("created_at")
    .order("id");
  if (error) return { ok: false, error: denied(error, "고른 글을 읽지 못했어요. 잠시 후 다시 시도해 주세요.") };
  const posts: BulkPost[] = (data ?? []).map((p) => ({
    id: p.id,
    title: p.title,
    levels: normalizeLevels(p.levels),
    movedFrom: movedFromOf(p.moved_from),
    materialIssue: materialMoveIssue({ body: p.body, files: p.staff_post_files[0]?.count ?? 0, links: materialLinks(p.links).length }),
  }));
  return { ok: true, posts };
}

/** 여러 개를 다 옮긴 뒤 한 번 — 직원 게시판 · 수업자료실 · 학생 수업자료실 화면을 새로 그린다 (하나씩은 `quiet` 로 옮겼다) */
export async function finishBoardMoves(): Promise<MoveResult> {
  await requireStaff();
  revalidatePath("/admin/board", "layout");
  revalidatePath("/admin/class-materials", "layout");
  revalidatePath("/my/materials", "layout");
  return { ok: true };
}
