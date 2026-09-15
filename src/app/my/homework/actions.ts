"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isSafeObjectPath, MB, type UploadedFile } from "@/lib/upload";

export type HomeworkResult = { ok: boolean; error?: string };

const BUCKET = "homework";
const MAX_FILES = 20;

function revalidateHomework() {
  revalidatePath("/my/homework");
  revalidatePath("/my/study");
  revalidatePath("/admin/homework");
  revalidatePath("/admin");
}

/**
 * 브라우저가 homework/{내 id}/{자료 id}/ 에 올린 파일을 제출물로 등록한다.
 * 첫 파일이면 제출물(homework_submissions)을 만든다. 자료를 볼 수 있는지는 RLS 가 확인한다.
 */
export async function registerHomeworkFiles(materialId: number, files: UploadedFile[]): Promise<HomeworkResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요해요." };

  if (!Number.isInteger(materialId) || !Array.isArray(files) || files.length === 0 || files.length > 10) {
    return { ok: false, error: "한 번에 1~10개 파일을 올릴 수 있어요." };
  }
  const prefix = `${user.id}/${materialId}/`;
  for (const f of files) {
    if (!isSafeObjectPath(f.path, prefix) || f.path.slice(prefix.length).includes("/")) return { ok: false, error: "파일 경로가 올바르지 않아요." };
    if (!(f.type?.startsWith("image/") || f.type === "application/pdf")) return { ok: false, error: "사진 또는 PDF 파일만 올릴 수 있어요." };
    if (!(f.size > 0 && f.size <= 20 * MB)) return { ok: false, error: "파일은 20MB 이하만 올릴 수 있어요." };
  }

  // 실제로 올라간 파일인지 확인
  const { data: listed, error: listError } = await supabase.storage.from(BUCKET).list(`${user.id}/${materialId}`, { limit: 200 });
  const names = new Set((listed ?? []).map((o) => o.name));
  if (listError || files.some((f) => !names.has(f.path.slice(prefix.length)))) {
    return { ok: false, error: "업로드된 파일을 찾을 수 없어요. 다시 시도해 주세요." };
  }

  const { data: existing } = await supabase
    .from("homework_submissions")
    .select("id, status, homework_files(count)")
    .eq("material_id", materialId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (existing?.status === "checked") return { ok: false, error: "점검이 끝난 숙제는 바꿀 수 없어요." };
  if ((existing?.homework_files?.[0]?.count ?? 0) + files.length > MAX_FILES) return { ok: false, error: `한 숙제에 파일은 ${MAX_FILES}개까지 올릴 수 있어요.` };

  let submissionId = existing?.id ?? null;
  if (!submissionId) {
    const { data: created, error } = await supabase.from("homework_submissions").insert({ material_id: materialId, user_id: user.id }).select("id").single();
    if (error || !created) {
      return { ok: false, error: error?.code === "42501" ? "지금은 이 자료에 숙제를 낼 수 없어요. 비대면스터디 신청과 수강 기간을 확인해 주세요." : "제출하지 못했어요. 잠시 후 다시 시도해 주세요." };
    }
    submissionId = created.id;
  }

  const { error: filesError } = await supabase.from("homework_files").insert(
    files.map((f) => ({ submission_id: submissionId!, file_path: f.path, file_name: String(f.name).slice(0, 200), file_size: f.size, content_type: f.type })),
  );
  if (filesError) {
    if (!existing) await supabase.from("homework_submissions").delete().eq("id", submissionId);
    return { ok: false, error: filesError.code === "42501" ? "점검이 끝난 숙제는 바꿀 수 없어요." : "제출하지 못했어요. 잠시 후 다시 시도해 주세요." };
  }

  revalidateHomework();
  return { ok: true };
}

/** 점검 전 파일 삭제. 마지막 파일이면 제출물도 지운다 */
export async function deleteHomeworkFile(fileId: number): Promise<HomeworkResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요해요." };
  if (!Number.isInteger(fileId)) return { ok: false, error: "잘못된 요청이에요." };

  const { data: deleted, error } = await supabase.from("homework_files").delete().eq("id", fileId).select("file_path, submission_id");
  if (error) return { ok: false, error: "지우지 못했어요. 잠시 후 다시 시도해 주세요." };
  if (!deleted?.length) return { ok: false, error: "점검이 끝난 숙제는 지울 수 없어요." };

  const { file_path, submission_id } = deleted[0];
  await supabase.storage.from(BUCKET).remove([file_path]);

  const { count } = await supabase.from("homework_files").select("id", { count: "exact", head: true }).eq("submission_id", submission_id);
  if ((count ?? 0) === 0) await supabase.from("homework_submissions").delete().eq("id", submission_id).eq("status", "submitted");

  revalidateHomework();
  return { ok: true };
}
