"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { studyErrorMessage } from "@/lib/study";
import { onlineSignupPhase, onlineStudyWindow, shortDay } from "@/lib/study-rounds";
import { todayKST } from "@/lib/utils";

export type SignupState = { ok?: boolean; error?: string; /** 레벨 요청 — 바로 적용됐는가(레벨이 없던 신청), 아니면 승인을 기다린다 */ applied?: boolean };

function revalidateSignups() {
  revalidatePath("/study");
  revalidatePath("/my/study");
  revalidatePath("/admin/study");
  revalidatePath("/admin/sections");
}

/**
 * 스터디 신청 · 시간대 변경. 한 스터디에 신청은 하나라서, 이미 신청했으면 시간대만 옮긴다.
 * 자격(그 달 수강생·신청 받는 중)과 정원은 RLS·트리거가 최종 판단한다.
 */
export async function signupStudy(_prev: SignupState, formData: FormData): Promise<SignupState> {
  const studyId = Number(formData.get("study_id"));
  const slotRaw = String(formData.get("slot_id") ?? "");
  const slotId = slotRaw === "" ? null : Number(slotRaw);
  // 비대면은 레벨(1~3)을 골라 신청한다 (2026-10-12 Alan "레벨은 학생이 직접 고르는걸로"). 단어 스터디는 시간대의 레벨이라 보내지 않는다
  const levelRaw = String(formData.get("level") ?? "");
  const level = levelRaw === "" ? null : Number(levelRaw);
  if (!Number.isInteger(studyId) || (slotId !== null && !Number.isInteger(slotId)) || (level !== null && !Number.isInteger(level))) return { error: "잘못된 요청이에요." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요해요." };

  const { data: existing } = await supabase.from("study_signups").select("id, slot_id, level").eq("study_id", studyId).eq("user_id", user.id).maybeSingle();
  if (existing?.slot_id === slotId && existing?.level === level) return { ok: true };

  // 비대면은 개강일부터 3일만 받는다 (2026-10-05 Alan) — 막는 것은 DB 정책이고, 여기서는 왜 안 되는지 날짜로 말해 준다
  const closed = await onlineClosedMessage(supabase, studyId);
  if (closed) return { error: closed };

  // 이미 신청했으면 시간대만 옮긴다 (같은 레벨의 다른 시간대 — 레벨이 달라지면 DB 트리거 study_level_locked 가 막는다 → 변경 요청으로)
  // 레벨은 DB 가 본다 — 비대면 새 신청에 레벨이 없으면 study_level_required
  const { error } = existing
    ? await supabase.from("study_signups").update({ slot_id: slotId }).eq("id", existing.id)
    : await supabase.from("study_signups").insert({ study_id: studyId, slot_id: slotId, user_id: user.id, level });

  if (error) {
    if (error.code === "42501" && !error.message?.includes("study_level_locked")) return { error: "지금은 신청할 수 없어요. 그 달 수강생만, 신청 받는 기간에 신청할 수 있어요." };
    if (error.code === "23505") return { error: "이미 신청한 스터디예요. 새로고침해 주세요." };
    return { error: studyErrorMessage(error, "신청하지 못했어요. 잠시 후 다시 시도해 주세요.") };
  }

  revalidateSignups();
  return { ok: true };
}

/**
 * 레벨 고르기 · 변경 요청 (2026-10-12 Alan — "학생이 스터디 레벨을 변경하고 싶다면 신청한 후 조교나 강사승인이 있어야지 변경이 가능하도록").
 * DB 함수 `set_study_level` 이 정한다 — 레벨이 아직 없던 신청(레벨 전 10월)은 바로 적용하고, 있으면 요청으로 남겨 조교 · 강사가 승인한다.
 * 비대면은 `level`, 단어 스터디는 `slot_id`(그 시간대의 레벨)를 보낸다. 본인 신청인지는 함수가 auth.uid() 로 거른다.
 */
export async function requestStudyLevel(_prev: SignupState, formData: FormData): Promise<SignupState> {
  const signupId = Number(formData.get("signup_id"));
  const levelRaw = String(formData.get("level") ?? "");
  const slotRaw = String(formData.get("slot_id") ?? "");
  const level = levelRaw === "" ? null : Number(levelRaw);
  const slotId = slotRaw === "" ? null : Number(slotRaw);
  if (!Number.isInteger(signupId) || (level !== null && !Number.isInteger(level)) || (slotId !== null && !Number.isInteger(slotId))) return { error: "잘못된 요청이에요." };
  if (level === null && slotId === null) return { error: "레벨을 골라 주세요." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요해요." };

  const { data, error } = await supabase.rpc("set_study_level", { p_signup_id: signupId, p_level: level ?? undefined, p_slot_id: slotId ?? undefined });
  if (error) return { error: studyErrorMessage(error, "요청하지 못했어요. 잠시 후 다시 시도해 주세요.") };

  revalidateSignups();
  const applied = typeof data === "object" && data !== null && "applied" in data ? Boolean((data as { applied?: boolean }).applied) : false;
  return { ok: true, applied };
}

/** 변경 요청 취소 (본인) */
export async function cancelStudyLevelRequest(_prev: SignupState, formData: FormData): Promise<SignupState> {
  const signupId = Number(formData.get("signup_id"));
  if (!Number.isInteger(signupId)) return { error: "잘못된 요청이에요." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요해요." };

  const { data, error } = await supabase.rpc("cancel_study_level_request", { p_signup_id: signupId });
  if (error) return { error: studyErrorMessage(error, "취소하지 못했어요.") };
  if (!data) return { error: "취소할 요청이 없어요. 화면을 새로고침해 주세요." };

  revalidateSignups();
  return { ok: true };
}

/** 비대면 스터디인데 오늘이 신청 기간(개강일 ~ +2)이 아니면 그 까닭. 아니면 null (대면 · 단어 · 읽지 못함 — 판단은 DB 에 맡긴다) */
async function onlineClosedMessage(supabase: Awaited<ReturnType<typeof createClient>>, studyId: number): Promise<string | null> {
  const { data: study } = await supabase.from("studies").select("kind, term:terms(enrollment_opens_at)").eq("id", studyId).maybeSingle();
  const opens = study?.kind === "online" ? (study.term?.enrollment_opens_at ?? null) : null;
  if (!opens) return null;
  const phase = onlineSignupPhase(opens, todayKST());
  const w = onlineStudyWindow(opens);
  if (phase === "before") return `비대면 스터디는 개강일 ${shortDay(w.signupFrom)}부터 3일 동안 신청할 수 있어요.`;
  if (phase === "after") return `비대면 스터디 신청 기간(${shortDay(w.signupFrom)} ~ ${shortDay(w.signupUntil)})이 끝났어요. 강사에게 말씀해 주세요.`;
  return null;
}

/** 신청 취소. 신청 받는 중(open)일 때만 본인이 취소할 수 있다 — 비대면은 신청 기간(개강일 ~ +2) 안에만 */
export async function cancelStudySignup(_prev: SignupState, formData: FormData): Promise<SignupState> {
  const studyId = Number(formData.get("study_id"));
  if (!Number.isInteger(studyId)) return { error: "잘못된 요청이에요." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요해요." };

  const { data, error } = await supabase.from("study_signups").delete().eq("study_id", studyId).eq("user_id", user.id).select("id");
  if (error) return { error: studyErrorMessage(error, "취소하지 못했어요. 잠시 후 다시 시도해 주세요.") };
  if (!data?.length) return { error: "신청이 마감된 뒤에는 직접 취소할 수 없어요. 강사에게 말씀해 주세요." };

  revalidateSignups();
  return { ok: true };
}
