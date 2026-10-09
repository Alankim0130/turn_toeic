"use server";

import { revalidatePath } from "next/cache";
import { isStaff, requireCrew } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type SendResult = { ok: boolean; error?: string; sent?: number };

/**
 * 스태프 → 학생 알림 (2026-09-18 Alan — 미인증 학생에게 메시지). 학생의 알림함(/my/notifications)에 쌓인다.
 * 로그인한 스태프 세션으로 넣는다 — RLS "student_messages: 스태프 발송" 이 한 번 더 막는다. 문자·알림톡·푸시는 보내지 않는다.
 *
 * **조교는 비대면 인증 독촉(`study_checkin`)만 보낸다** (2026-10-03 Alan "스터디를 조교가 운영한다"). DB 정책
 * "student_messages: 조교 발송" 이 같은 집합이다 (종류 · 보낸 이 = 자기 이름).
 */
export async function sendStudentMessages(input: {
  userIds: string[];
  title: string;
  body: string;
  kind?: "general" | "study_checkin";
  related?: { materialId?: number; date?: string } | null;
}): Promise<SendResult> {
  const { user, profile } = await requireCrew();

  const userIds = [...new Set((Array.isArray(input.userIds) ? input.userIds : []).filter((v): v is string => typeof v === "string" && v.length > 0))];
  const title = String(input.title ?? "").trim();
  const body = String(input.body ?? "").trim();
  const kind = input.kind === "study_checkin" ? "study_checkin" : "general";
  if (kind !== "study_checkin" && !isStaff(profile.role)) return { ok: false, error: "조교는 비대면 인증 알림만 보낼 수 있어요." };
  if (userIds.length === 0) return { ok: false, error: "받을 학생을 골라 주세요." };
  if (userIds.length > 200) return { ok: false, error: "한 번에 200명까지 보낼 수 있어요." };
  if (title.length < 1 || title.length > 80) return { ok: false, error: "제목은 1~80자로 적어 주세요." };
  if (body.length < 1 || body.length > 1000) return { ok: false, error: "내용은 1~1,000자로 적어 주세요." };

  const supabase = await createClient();
  // 비대면 인증 독촉은 **그 회차 자료의 스터디를 신청한 학생에게만** (2026-10-09 보안 검토). 받는 사람 목록은 화면이 보내지만
  // 서버가 신청자 명단과 대조한다 — 조교가 아무 회원에게나 "내 스터디에서 인증하기" 버튼이 달린 글을 보내는 길을 막는다. related 도 서버가 다시 만든다
  let related: { materialId: number; date: string } | null = null;
  if (kind === "study_checkin") {
    const materialId = Number(input.related?.materialId);
    if (!Number.isInteger(materialId) || materialId <= 0) return { ok: false, error: "어느 회차의 알림인지 알 수 없어요. 화면을 새로고침해 주세요." };
    const { data: material } = await supabase.from("study_materials").select("study_id, date").eq("id", materialId).maybeSingle();
    if (!material) return { ok: false, error: "회차 자료를 찾을 수 없어요." };
    const { data: signups, error: signupError } = await supabase.from("study_signups").select("user_id").eq("study_id", material.study_id);
    if (signupError) return { ok: false, error: "신청자 명단을 읽지 못했어요. 잠시 후 다시 시도해 주세요." };
    const allowed = new Set((signups ?? []).map((g) => g.user_id));
    if (userIds.some((id) => !allowed.has(id))) return { ok: false, error: "이 스터디를 신청한 학생에게만 보낼 수 있어요. 화면을 새로고침해 주세요." };
    related = { materialId, date: material.date };
  }

  const { error, count } = await supabase.from("student_messages").insert(
    userIds.map((uid) => ({
      user_id: uid,
      sender_id: user.id,
      sender_name: profile.name,
      title,
      body,
      kind,
      related,
    })),
    { count: "exact" },
  );
  if (error) return { ok: false, error: `보내지 못했어요. ${error.message}` };

  revalidatePath("/my", "layout");
  revalidatePath("/admin/study");
  return { ok: true, sent: count ?? userIds.length };
}
