"use server";

import { revalidatePath } from "next/cache";
import { requireCrew } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isSafeObjectPath, type UploadedFile } from "@/lib/upload";
import { studyErrorMessage } from "@/lib/study";
import { MATERIAL_ROUND_MAX } from "@/lib/study-rounds";
import { droppedNoteImages, isMaterialNoteImage, materialNoteError, STUDY_MATERIAL_BUCKET as BUCKET } from "@/lib/study-note";
import { noteImagePaths } from "@/lib/note-format";

export type MaterialResult = { ok: boolean; error?: string };

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
 * 안내에서 빠진 사진을 지워도 되나 (2026-10-05 — 안내가 공지와 같은 서식 글이 됐다). 자료실의 다른 회차나 그 달 적용분(끝난 달은 그때 안내 그대로 남는다)이
 * 아직 그 사진을 가리키면 남긴다. 세는 데 실패하면(count 가 비면) 지우지 않는다 — 지운 사진은 되살릴 수 없다.
 * 경로는 `isMaterialNoteImage` 를 통과한 것뿐이라 LIKE 에 와일드카드가 섞이지 않는다.
 */
async function removeNoteImagesIfUnused(supabase: Awaited<ReturnType<typeof createClient>>, paths: string[]) {
  const unused: string[] = [];
  for (const path of paths.filter(isMaterialNoteImage)) {
    const pattern = `%[img=${path}%`;
    const [{ count: applied }, { count: items }] = await Promise.all([
      supabase.from("study_materials").select("id", { count: "exact", head: true }).like("note", pattern),
      supabase.from("study_material_items").select("id", { count: "exact", head: true }).like("note", pattern),
    ]);
    if (applied === 0 && items === 0) unused.push(path);
  }
  if (unused.length) await supabase.storage.from(BUCKET).remove(unused);
}

/**
 * 비대면 자료 회차 저장 (2026-09-22 Alan — "1회차, 2회차... 이렇게 설정하고 매달 강사들이 설정한 일정표에 따라 적용").
 * 파일은 브라우저가 먼저 저장소(`items/…`)에 올리고, 여기서는 자료실 행만 만든다/고친다.
 * 그 달 날짜에 붙이는 일은 DB 가 한다 (자료실 트리거 → `private.sync_online_materials`).
 *  - itemId 없음: 새 회차 (파일 필수)
 *  - itemId 있음: 제목·안내 문구 수정, file 이 있으면 파일 교체 후 옛 파일 삭제
 * 안내 문구(2026-09-30 Alan "각 회차마다 안내문구")는 그 달 적용분으로 복사돼 학생 `/my/study` 의 그 회차 줄에 보인다.
 * 2026-10-05 부터 안내는 공지와 같은 서식 글(5만 자 · 사진 `notes/…`)이다 — `materialNoteError` 가 폼과 같은 말로 다시 보고,
 * 고치면서 뺀 사진은 아무 안내도 가리키지 않을 때만 저장소에서 지운다.
 */
export async function saveMaterialItem(input: {
  seq: number;
  title: string;
  note?: string | null;
  itemId?: number | null;
  file?: UploadedFile | null;
}): Promise<MaterialResult> {
  // 조교도 올린다 (2026-10-07 Alan) — DB 정책(study_material_items · 버킷 study-materials)도 crew 다 (마이그레이션 20261007100000)
  const { user } = await requireCrew();
  const seq = Number(input.seq);
  const title = String(input.title ?? "").trim();
  const note = String(input.note ?? "").trim();
  const file = input.file ?? null;

  if (!Number.isInteger(seq) || seq < 1 || seq > MATERIAL_ROUND_MAX) return { ok: false, error: "회차를 확인해 주세요." };
  if (title.length > 100) return { ok: false, error: "제목은 100자 이내로 적어 주세요." };
  const noteError = materialNoteError(note);
  if (noteError) return { ok: false, error: noteError };
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
      note: note || null,
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
  const { data: old } = await supabase.from("study_material_items").select("file_path, note").eq("id", itemId).maybeSingle();
  if (!old) return { ok: false, error: "자료를 찾을 수 없어요." };

  const { data, error } = await supabase
    .from("study_material_items")
    .update({ title: title || null, note: note || null, updated_at: new Date().toISOString(), ...fileFields })
    .eq("id", itemId)
    .select("id");
  if (error) return { ok: false, error: studyErrorMessage(error) };
  if (!data?.length) return { ok: false, error: "자료를 찾을 수 없어요." };

  if (file && old.file_path !== file.path) await removeIfUnused(supabase, old.file_path);
  // 그 달 적용분은 위 UPDATE 의 트리거(sync_online_materials)가 이미 새 안내로 바꿨다 — 남은 것은 끝난 달 · 다른 회차가 가리키는 사진뿐이다
  const dropped = droppedNoteImages(old.note, note);
  if (dropped.length) await removeNoteImagesIfUnused(supabase, dropped);

  revalidateMaterials();
  return { ok: true };
}

/** 회차 자료 삭제 — 그 달 적용분도 빠진다 (학생 인증이 붙은 회차는 DB 가 남긴다) */
export async function deleteMaterialItem(id: number): Promise<MaterialResult> {
  await requireCrew();
  if (!Number.isInteger(id)) return { ok: false, error: "잘못된 요청이에요." };

  const supabase = await createClient();
  const { data, error } = await supabase.from("study_material_items").delete().eq("id", id).select("file_path, note");
  if (error) return { ok: false, error: studyErrorMessage(error, "삭제하지 못했어요.") };
  if (!data?.length) return { ok: false, error: "자료를 찾을 수 없어요." };

  for (const d of data) await removeIfUnused(supabase, d.file_path);
  await removeNoteImagesIfUnused(supabase, data.flatMap((d) => noteImagePaths(d.note ?? "")));
  revalidateMaterials();
  return { ok: true };
}
