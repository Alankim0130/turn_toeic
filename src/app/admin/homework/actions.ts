"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type HomeworkCheckResult = { ok: boolean; error?: string };

/** 숙제 점검완료 / 점검 취소 */
export async function setHomeworkChecked(id: number, checked: boolean): Promise<HomeworkCheckResult> {
  const { user } = await requireStaff();
  if (!Number.isInteger(id)) return { ok: false, error: "잘못된 요청이에요." };

  const supabase = await createClient();
  const patch = checked
    ? { status: "checked", checked_by: user.id, checked_at: new Date().toISOString() }
    : { status: "submitted", checked_by: null, checked_at: null };
  const { data, error } = await supabase.from("homework_submissions").update(patch).eq("id", id).select("id");
  if (error) return { ok: false, error: "저장하지 못했어요. 잠시 후 다시 시도해 주세요." };
  if (!data?.length) return { ok: false, error: "제출물을 찾을 수 없어요." };

  revalidatePath("/admin");
  revalidatePath("/admin/homework");
  revalidatePath("/admin/study");
  revalidatePath("/admin/study-materials");
  revalidatePath("/my/homework");
  revalidatePath("/my/study");
  return { ok: true };
}
