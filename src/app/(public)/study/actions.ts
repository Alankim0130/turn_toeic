"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { studyErrorMessage } from "@/lib/study";
import { onlineSignupPhase, onlineStudyWindow, shortDay } from "@/lib/study-rounds";
import { todayKST } from "@/lib/utils";

export type SignupState = { ok?: boolean; error?: string };

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
  if (!Number.isInteger(studyId) || (slotId !== null && !Number.isInteger(slotId))) return { error: "잘못된 요청이에요." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요해요." };

  const { data: existing } = await supabase.from("study_signups").select("id, slot_id").eq("study_id", studyId).eq("user_id", user.id).maybeSingle();
  if (existing?.slot_id === slotId) return { ok: true };

  // 비대면은 개강일부터 3일만 받는다 (2026-10-05 Alan) — 막는 것은 DB 정책이고, 여기서는 왜 안 되는지 날짜로 말해 준다
  const closed = await onlineClosedMessage(supabase, studyId);
  if (closed) return { error: closed };

  const { error } = existing
    ? await supabase.from("study_signups").update({ slot_id: slotId }).eq("id", existing.id)
    : await supabase.from("study_signups").insert({ study_id: studyId, slot_id: slotId, user_id: user.id });

  if (error) {
    if (error.code === "42501") return { error: "지금은 신청할 수 없어요. 그 달 수강생만, 신청 받는 기간에 신청할 수 있어요." };
    if (error.code === "23505") return { error: "이미 신청한 스터디예요. 새로고침해 주세요." };
    return { error: studyErrorMessage(error, "신청하지 못했어요. 잠시 후 다시 시도해 주세요.") };
  }

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
