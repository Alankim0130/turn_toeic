"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { needsReviewLink, parseReviewLink, reviewLinkError } from "@/lib/lecture";

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
 * **3주차 모의고사 특강은 YBM 수강후기 링크가 있어야 한다** (2026-10-08 Alan — `needsReviewLink`). 여기서 먼저 말하고, DB 트리거가 한 번 더 막는다.
 * **링크는 한 번만 쓴다** — 다른 학생이 쓴 링크 · 다른 달 특강에 쓴 내 링크는 DB 트리거가 막고(`reviewLinkKey`) 여기서 말로 바꾼다 (`reviewLinkError`).
 * 다른 특강에 링크가 딸려 와도 저장하지 않는다 (받을 까닭이 없는 값이다).
 */
export async function signupLecture(_prev: LectureSignupState, formData: FormData): Promise<LectureSignupState> {
  const lectureId = Number(formData.get("lecture_id"));
  if (!Number.isInteger(lectureId)) return { error: "잘못된 요청이에요." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요해요." };

  // 후기 링크가 필요한 특강인가 — 특강을 못 읽으면(그 달 수강생이 아님) 아래 신청을 RLS 가 막는다
  const { data: lecture } = await supabase
    .from("special_lectures")
    .select("date, kinds, term:terms(enrollment_opens_at)")
    .eq("id", lectureId)
    .maybeSingle();
  let reviewUrl: string | null = null;
  if (lecture && needsReviewLink(lecture, lecture.term?.enrollment_opens_at)) {
    const link = parseReviewLink(String(formData.get("review_url") ?? ""));
    if (!link.ok) return { error: link.error };
    reviewUrl = link.url;
  }

  const { error } = await supabase
    .from("lecture_signups")
    .insert(reviewUrl ? { lecture_id: lectureId, user_id: user.id, review_url: reviewUrl } : { lecture_id: lectureId, user_id: user.id });
  if (error) {
    if (error.message === "lecture_full") return { error: "정원이 찼어요. 자리가 나면 다시 신청할 수 있어요." };
    // 후기 링크 — 없음(review_link_required) · 다른 학생이 쓴 링크(review_link_taken) · 다른 달에 쓴 내 링크(review_link_reused, 2026-10-08)
    const reviewError = reviewLinkError(error.message);
    if (reviewError) return { error: reviewError };
    if (error.code === "23514") return { error: "후기 링크를 확인해 주세요 — 내가 쓴 후기의 주소(https://…)를 그대로 붙여 넣어 주세요." };
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
