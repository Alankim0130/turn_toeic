"use server";

import { revalidatePath } from "next/cache";
import { requireCrew } from "@/lib/auth";
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
 *
 * **조교도 점검한다** (2026-10-03 Alan "숙제점검"). DB 정책 "homework_submissions: 스태프·조교 점검" ·
 * "student_messages: 조교 발송"(점검완료 알림 — 그 학생의 점검된 숙제만)이 같은 집합이다.
 * **강사(이혜영 · 이영수)가 아닌 사람이 점검하면 학생 알림에는 그 과목 선생님 이름이 간다** (2026-10-08 Alan — "조교가 했다고 알림가는거 빨리 없애줘"
 * → 같은 날 저녁 "조교가 숙제검사했다고 알리지 말아줘. !!!!!!" — 점검한 계정이 관리자 등급이라 조교만 보던 규칙에 안 걸렸다. 지금은 조교 · 관리자 전부).
 * 이름을 바꾸는 것은 DB 트리거(`private.student_messages_homework_sender`) 한곳이다 — 여기서 무엇을 보내든 조교 · 관리자 이름은 남지 않는다.
 */
export async function checkHomework(input: { id: number; feedback?: string }): Promise<HomeworkCheckResult> {
  const { user, profile } = await requireCrew();
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
    sender_id: user.id, // 누가 점검했는지는 기록에 남는다 (학생은 이 id 로 이름을 못 읽는다)
    sender_name: profile.name, // 강사가 아니면(조교 · 관리자) DB 트리거가 그 과목 선생님 이름(RC 이영수 · LC 이혜영)으로 바꾼다
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
  await requireCrew();
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
