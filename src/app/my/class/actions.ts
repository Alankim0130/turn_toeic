"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type LectureSignupState = { ok?: boolean; error?: string };

function revalidateLectures() {
  revalidatePath("/my/class");
  revalidatePath("/my");
  revalidatePath("/admin/lectures");
  revalidatePath("/admin/sections");
}

/**
 * 특강 신청. 자격(그 달 수강생·신청 받는 중)과 정원은 RLS·트리거가 최종 판단한다.
 * 화면은 안내만 하고, 마지막 한 자리에 동시에 눌러도 정원을 넘지 않는다.
 */
export async function signupLecture(_prev: LectureSignupState, formData: FormData): Promise<LectureSignupState> {
  const lectureId = Number(formData.get("lecture_id"));
  if (!Number.isInteger(lectureId)) return { error: "잘못된 요청이에요." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요해요." };

  const { error } = await supabase.from("lecture_signups").insert({ lecture_id: lectureId, user_id: user.id });
  if (error) {
    if (error.message === "lecture_full") return { error: "정원이 찼어요. 자리가 나면 다시 신청할 수 있어요." };
    if (error.code === "23505") return { error: "이미 신청한 특강이에요. 새로고침해 주세요." };
    if (error.code === "42501") return { error: "지금은 신청할 수 없어요. 그 달 수강생만, 신청 받는 기간에 신청할 수 있어요." };
    return { error: "신청하지 못했어요. 잠시 후 다시 시도해 주세요." };
  }

  revalidateLectures();
  return { ok: true };
}

/** 신청 취소. 신청 받는 중일 때만 본인이 취소할 수 있다 */
export async function cancelLectureSignup(_prev: LectureSignupState, formData: FormData): Promise<LectureSignupState> {
  const lectureId = Number(formData.get("lecture_id"));
  if (!Number.isInteger(lectureId)) return { error: "잘못된 요청이에요." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요해요." };

  const { data, error } = await supabase.from("lecture_signups").delete().eq("lecture_id", lectureId).eq("user_id", user.id).select("id");
  if (error) return { error: "취소하지 못했어요. 잠시 후 다시 시도해 주세요." };
  if (!data?.length) return { error: "신청이 마감된 뒤에는 직접 취소할 수 없어요. 강사에게 말씀해 주세요." };

  revalidateLectures();
  return { ok: true };
}
