"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/auth";
import { noteHasText, noteTooLong } from "@/lib/class-materials";
import { isLectureCondition, type LectureCondition } from "@/lib/lecture";

export type LectureSettingsState = { ok?: boolean; error?: string; message?: string };

function revalidateLectures() {
  revalidatePath("/admin/lectures");
  revalidatePath("/admin/sections");
  revalidatePath("/my/lecture");
  revalidatePath("/my/class");
  revalidatePath("/my");
}

/** 특강 신청 화면의 저장 — 화면이 보낸 값 (폼은 직접 보낸다 — `LectureSignupForm` 머리말) */
export type LectureSettingsInput = {
  lectureId: number;
  signup: boolean;
  /** 비우면 정원 없음 */
  capacity: string;
  /** datetime-local (KST) 또는 "" — 비우면 특강 7일 전 자정 */
  signupOpensAt: string;
  /** 신청 조건 — 신청을 받을 때만 보낸다 (없으면 그대로 둔다) */
  condition?: string;
  /** 안내 (서식 글) — 신청을 받을 때만 보낸다 (없으면 그대로 둔다) */
  notice?: string;
};

/**
 * 특강 신청 설정 — 신청 받기 · 정원 · 신청 시작 · **신청 조건 · 안내** (2026-10-15 Alan — "특강마다 신청조건을 선택할 수 있으면 좋겠어 …
 * 특강신청에서 강사님들이 안내문구를 쓸 수 있는 공간이 있으면 좋겠어. 안내문쓰는 공간은 수업자료실에서 사용하는 그 해당 포멧을 그대로").
 * 특강 자체(날짜·강사·종류)는 반 편성 달력에서 정하고, 여기서는 신청만 다룬다. 로그인한 세션으로 고친다 (정책 "special_lectures: 스태프 수정").
 * 안내는 수업자료실 안내와 같은 꺾쇠 태그 글이고 상한도 같다(5만 자 — `noteTooLong`). 보이는 글자가 없으면 비운다.
 * 조건을 바꿔도 **이미 들어온 신청은 다시 묻지 않는다** (트리거는 넣을 때만 본다) — 화면이 그렇게 적는다.
 */
export async function updateLectureSignup(input: LectureSettingsInput): Promise<LectureSettingsState> {
  await requireStaff();
  const id = Number(input?.lectureId);
  if (!Number.isInteger(id)) return { error: "잘못된 요청이에요." };

  const signup = input.signup === true;
  const capacityRaw = String(input.capacity ?? "").trim();
  const opensRaw = String(input.signupOpensAt ?? "").trim();

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

  const patch: { signup: boolean; capacity: number | null; signup_opens_at: string | null; signup_condition?: LectureCondition; notice?: string | null } = {
    signup,
    capacity,
    signup_opens_at: opensAt,
  };
  if (signup && input.condition !== undefined) {
    if (!isLectureCondition(input.condition)) return { error: "신청 조건을 다시 골라 주세요." };
    patch.signup_condition = input.condition;
  }
  if (signup && input.notice !== undefined) {
    const notice = String(input.notice);
    const tooLong = noteTooLong(notice);
    if (tooLong) return { error: tooLong };
    patch.notice = noteHasText(notice) ? notice : null;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.from("special_lectures").update(patch).eq("id", id).select("id, applied_count");

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
