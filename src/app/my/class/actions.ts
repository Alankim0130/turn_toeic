"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isSnsFollow, LECTURE_SUBJECT_ERROR, lectureCondition, parseReviewLink, reviewLinkError, snsFollowError } from "@/lib/lecture";
import { isLectureWay } from "@/lib/utils";

export type LectureSignupState = { ok?: boolean; error?: string };

function revalidateLectures() {
  revalidatePath("/my/lecture");
  revalidatePath("/my/class");
  revalidatePath("/my");
  revalidatePath("/admin/lectures");
  revalidatePath("/admin/sections");
}

/**
 * 특강 신청 — **신청 방식 하나를 골라서** (2026-10-16 Alan — 모의고사는 현장 · 시험지 수령 · PDF 수령, RC · LC특강은 현장 · 수업영상 받기).
 * 자격(그 달 수강생 · 강사가 '신청 받기' 를 누른 특강 · 그 방식을 받음)과 정원(방식마다)은 RLS · 트리거가 최종 판단한다.
 * 화면은 안내만 하고, 마지막 한 자리에 동시에 눌러도 정원을 넘지 않는다. **한 특강에 한 방식** — 이미 신청했으면 DB 가 `lecture_already_signed` 로 막는다.
 * **신청 조건은 그 방식의 것이다** (`special_lecture_ways.signup_condition`, `LECTURE_CONDITIONS`):
 *  - review — YBM 수강후기 링크가 있어야 한다 (2026-10-08). 여기서 먼저 말하고, DB 트리거가 한 번 더 막는다.
 *    **링크는 한 번만 쓴다** — 다른 학생이 쓴 링크 · 다른 달 특강에 쓴 내 링크는 DB 트리거가 막고(`reviewLinkKey`) 여기서 말로 바꾼다 (`reviewLinkError`).
 *  - sns — 유튜브 구독을 체크하고 인스타그램 새로 · 기존 팔로우를 골라야 한다. 새로 · 기존만 저장한다 (`sns_follow`).
 * 조건이 아닌 값이 딸려 와도 보내지 않는다 (DB 트리거도 비운다).
 * **단과 학생은 제 과목 특강만** (2026-10-12 Alan) — DB 트리거(`lecture_signups_eligible_subject`)가 `lecture_subject_mismatch` 로 막고 여기서 말로 바꾼다.
 * 화면은 그 카드의 신청 버튼을 아예 그리지 않는다 (`lectureSubjectBlock`).
 */
export async function signupLecture(_prev: LectureSignupState, formData: FormData): Promise<LectureSignupState> {
  const lectureId = Number(formData.get("lecture_id"));
  const way = formData.get("way");
  if (!Number.isInteger(lectureId)) return { error: "잘못된 요청이에요." };
  if (!isLectureWay(way)) return { error: "신청 방식을 골라 주세요." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요해요." };

  // 그 방식의 신청 조건 — 못 읽으면(그 달 수강생이 아니거나 없는 방식) 아래 신청을 DB 가 막는다
  const { data: wayRow } = await supabase
    .from("special_lecture_ways")
    .select("signup_condition, enabled")
    .eq("lecture_id", lectureId)
    .eq("way", way)
    .maybeSingle();
  if (wayRow && !wayRow.enabled) return { error: "지금은 이 방식으로 신청을 받지 않아요. 새로고침해 주세요." };
  const condition = lectureCondition(wayRow?.signup_condition);
  const row: { lecture_id: number; user_id: string; way: string; review_url?: string; sns_follow?: string } = { lecture_id: lectureId, user_id: user.id, way };
  if (condition === "review") {
    const link = parseReviewLink(String(formData.get("review_url") ?? ""));
    if (!link.ok) return { error: link.error };
    row.review_url = link.url;
  } else if (condition === "sns") {
    const follow = formData.get("sns_follow");
    if (formData.get("youtube") !== "on" || !isSnsFollow(follow)) {
      return { error: "역전토익 유튜브 구독과 인스타그램 팔로우를 하고, 둘 다 체크한 뒤 신청해 주세요." };
    }
    row.sns_follow = follow;
  }

  const { error } = await supabase.from("lecture_signups").insert(row);
  if (error) {
    if (error.message === "lecture_full") return { error: "이 방식은 정원이 찼어요. 다른 방식을 고르거나, 자리가 나면 다시 신청해 주세요." };
    if (error.message === "lecture_already_signed") return { error: "이미 신청한 특강이에요. 방식을 바꾸려면 신청을 취소하고 다시 신청해 주세요." };
    if (error.message === "lecture_signup_closed") return { error: "지금은 이 방식으로 신청을 받지 않아요. 새로고침해 주세요." };
    if (error.message === "lecture_subject_mismatch") return { error: LECTURE_SUBJECT_ERROR };
    // 신청 조건 — 후기 링크 없음(review_link_required) · 다른 학생이 쓴 링크(review_link_taken) · 다른 달에 쓴 내 링크(review_link_reused, 2026-10-08) ·
    // 유튜브 구독 · 인스타그램 팔로우 안 함(sns_follow_required, 2026-10-15)
    const reviewError = reviewLinkError(error.message) ?? snsFollowError(error.message);
    if (reviewError) return { error: reviewError };
    if (error.code === "23514") return { error: "후기 링크를 확인해 주세요 — 내가 쓴 후기의 주소(https://…)를 그대로 붙여 넣어 주세요." };
    if (error.code === "23505") return { error: "이미 신청한 특강이에요. 새로고침해 주세요." };
    if (error.code === "42501") return { error: "지금은 신청할 수 없어요. 그 달 수강생만, 신청 받는 동안에 신청할 수 있어요." };
    return { error: "신청하지 못했어요. 잠시 후 다시 시도해 주세요." };
  }

  revalidateLectures();
  return { ok: true };
}

/** 신청 취소 — 그 방식 하나. 신청 받는 동안에만 본인이 취소할 수 있다 */
export async function cancelLectureSignup(_prev: LectureSignupState, formData: FormData): Promise<LectureSignupState> {
  const lectureId = Number(formData.get("lecture_id"));
  const way = formData.get("way");
  if (!Number.isInteger(lectureId) || !isLectureWay(way)) return { error: "잘못된 요청이에요." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요해요." };

  const { data, error } = await supabase
    .from("lecture_signups")
    .delete()
    .eq("lecture_id", lectureId)
    .eq("way", way)
    .eq("user_id", user.id)
    .select("id");
  if (error) return { error: "취소하지 못했어요. 잠시 후 다시 시도해 주세요." };
  if (!data?.length) return { error: "신청이 마감된 뒤에는 직접 취소할 수 없어요. 강사에게 말씀해 주세요." };

  revalidateLectures();
  return { ok: true };
}
