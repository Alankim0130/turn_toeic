"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/auth";

export type LectureSettingsState = { ok?: boolean; error?: string; message?: string };

function revalidateLectures() {
  revalidatePath("/admin/lectures");
  revalidatePath("/admin/sections");
  revalidatePath("/my/class");
  revalidatePath("/my");
}

/**
 * 특강 신청 설정 — 신청 받기 · 정원 · 신청 시작.
 * 특강 자체(날짜·강사·종류)는 반 편성 달력에서 정하고, 여기서는 신청만 다룬다.
 */
export async function updateLectureSignup(_prev: LectureSettingsState, formData: FormData): Promise<LectureSettingsState> {
  await requireStaff();
  const id = Number(formData.get("lecture_id"));
  if (!Number.isInteger(id)) return { error: "잘못된 요청이에요." };

  const signup = formData.get("signup") === "on";
  const capacityRaw = String(formData.get("capacity") ?? "").trim();
  const opensRaw = String(formData.get("signup_opens_at") ?? "").trim();

  let capacity: number | null = null;
  if (signup && capacityRaw !== "") {
    capacity = Number(capacityRaw.replace(/[^\d]/g, ""));
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 1000) return { error: "정원은 1~1000명 사이로 입력해 주세요." };
  }

  let opensAt: string | null = null;
  if (signup && opensRaw !== "") {
    // datetime-local 은 시간대가 없다. 학원 기준(KST)으로 읽는다
    const parsed = new Date(`${opensRaw}:00+09:00`);
    if (Number.isNaN(parsed.getTime())) return { error: "신청 시작 일시가 올바르지 않아요." };
    opensAt = parsed.toISOString();
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("special_lectures")
    .update({ signup, capacity, signup_opens_at: opensAt })
    .eq("id", id)
    .select("id, applied_count");

  if (error) {
    if (error.code === "23514") return { error: "정원은 1~1000명이어야 하고, 신청을 받지 않으면 정원·신청 시작은 비워 둡니다." };
    return { error: "저장하지 못했어요. 잠시 후 다시 시도해 주세요." };
  }
  if (!data?.length) return { error: "수정 권한이 없거나 특강을 찾을 수 없어요." };

  revalidateLectures();
  return { ok: true, message: signup ? "신청 설정을 저장했어요." : "이 특강은 신청을 받지 않습니다." };
}

/** 스태프가 학생 대신 신청을 취소한다 (신청 마감 뒤에도 가능) */
export async function cancelLectureSignupByStaff(signupId: number): Promise<{ ok?: boolean; error?: string }> {
  await requireStaff();
  if (!Number.isInteger(signupId)) return { error: "잘못된 요청이에요." };

  const supabase = await createClient();
  const { data, error } = await supabase.from("lecture_signups").delete().eq("id", signupId).select("id");
  if (error) return { error: "취소하지 못했어요. 잠시 후 다시 시도해 주세요." };
  if (!data?.length) return { error: "이미 취소된 신청이에요." };

  revalidateLectures();
  return { ok: true };
}
