"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { homeworkCheckedMessage, MAX_FEEDBACK } from "@/lib/homework";

export type HomeworkCheckResult = { ok: boolean; error?: string; notified?: boolean };

function revalidateAll() {
  revalidatePath("/admin");
  revalidatePath("/admin/homework");
  revalidatePath("/my/homework");
  revalidatePath("/my", "layout"); // 알림함 배지
}

/**
 * 숙제 점검완료 — **코멘트를 함께 저장하고 학생 알림함으로 보낸다** (2026-09-19 Alan:
 * "강사들은 숙제점검 페이지에서 학생들이 낸 숙제를 점검해주고 질문에 답변을 달아주거나 추가로 할말이
 *  있다면 코멘트를 생성해서 다시 점검완료 메시지를 보낸다. 그럼 학생들은 숙제점검 완료 알림을 받고 확인").
 *
 * 코멘트는 **선택**이다 — 비워 두면 기본 안내 문구로 알림만 간다.
 * 알림은 **앱 안 알림함**(`student_messages`)뿐이다. 문자·알림톡·학생 푸시는 여전히 없다.
 * 알림을 못 보내도 점검은 그대로 남긴다 — 점검이 통째로 실패하는 편이 더 나쁘다.
 */
export async function checkHomework(input: { id: number; feedback?: string }): Promise<HomeworkCheckResult> {
  const { user, profile } = await requireStaff();
  const id = Number(input.id);
  if (!Number.isInteger(id)) return { ok: false, error: "잘못된 요청이에요." };
  const feedback = String(input.feedback ?? "").trim();
  if (feedback.length > MAX_FEEDBACK) return { ok: false, error: `코멘트는 ${MAX_FEEDBACK}자 이내로 적어 주세요.` };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("homework_submissions")
    .update({ status: "checked", checked_by: user.id, checked_at: new Date().toISOString(), feedback: feedback || null })
    .eq("id", id)
    .select("id, user_id, level, subject, class_date");
  if (error) return { ok: false, error: `저장하지 못했어요. ${error.message}` };
  if (!data?.length) return { ok: false, error: "제출물을 찾을 수 없어요." };

  const s = data[0];
  const msg = homeworkCheckedMessage({ level: s.level, subject: s.subject, classDate: s.class_date, feedback });
  const { error: sendError } = await supabase.from("student_messages").insert({
    user_id: s.user_id,
    sender_id: user.id,
    sender_name: profile.name,
    title: msg.title,
    body: msg.body,
    kind: "homework_checked",
    related: { submissionId: s.id },
  });

  revalidateAll();
  return { ok: true, notified: !sendError };
}

/** 점검 취소 — 코멘트도 지운다. 이미 보낸 알림은 그대로 둔다 (학생이 본 것을 없애지 않는다) */
export async function undoHomeworkCheck(id: number): Promise<HomeworkCheckResult> {
  await requireStaff();
  if (!Number.isInteger(id)) return { ok: false, error: "잘못된 요청이에요." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("homework_submissions")
    .update({ status: "submitted", checked_by: null, checked_at: null, feedback: null })
    .eq("id", id)
    .select("id");
  if (error) return { ok: false, error: `저장하지 못했어요. ${error.message}` };
  if (!data?.length) return { ok: false, error: "제출물을 찾을 수 없어요." };

  revalidateAll();
  return { ok: true };
}
