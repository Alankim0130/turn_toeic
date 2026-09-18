"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type SendResult = { ok: boolean; error?: string; sent?: number };

/**
 * 스태프 → 학생 알림 (2026-09-18 Alan — 미인증 학생에게 메시지). 학생의 알림함(/my/notifications)에 쌓인다.
 * 로그인한 스태프 세션으로 넣는다 — RLS "student_messages: 스태프 발송" 이 한 번 더 막는다. 문자·알림톡·푸시는 보내지 않는다.
 */
export async function sendStudentMessages(input: {
  userIds: string[];
  title: string;
  body: string;
  kind?: "general" | "study_checkin";
  related?: { materialId?: number; date?: string } | null;
}): Promise<SendResult> {
  const { user, profile } = await requireStaff();

  const userIds = [...new Set((Array.isArray(input.userIds) ? input.userIds : []).filter((v): v is string => typeof v === "string" && v.length > 0))];
  const title = String(input.title ?? "").trim();
  const body = String(input.body ?? "").trim();
  const kind = input.kind === "study_checkin" ? "study_checkin" : "general";
  if (userIds.length === 0) return { ok: false, error: "받을 학생을 골라 주세요." };
  if (userIds.length > 200) return { ok: false, error: "한 번에 200명까지 보낼 수 있어요." };
  if (title.length < 1 || title.length > 80) return { ok: false, error: "제목은 1~80자로 적어 주세요." };
  if (body.length < 1 || body.length > 1000) return { ok: false, error: "내용은 1~1,000자로 적어 주세요." };

  const supabase = await createClient();
  const { error, count } = await supabase.from("student_messages").insert(
    userIds.map((uid) => ({
      user_id: uid,
      sender_id: user.id,
      sender_name: profile.name,
      title,
      body,
      kind,
      related: input.related ?? null,
    })),
    { count: "exact" },
  );
  if (error) return { ok: false, error: `보내지 못했어요. ${error.message}` };

  revalidatePath("/my", "layout");
  revalidatePath("/admin/study");
  return { ok: true, sent: count ?? userIds.length };
}
