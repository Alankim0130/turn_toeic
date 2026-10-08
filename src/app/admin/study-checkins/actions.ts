"use server";

import { revalidatePath } from "next/cache";
import { requireCrew } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CHECKIN_MAX_FEEDBACK, studyCheckedMessage } from "@/lib/study-checkin";

export type CheckinCheckResult = { ok: boolean; error?: string; notified?: boolean };

function revalidateAll() {
  revalidatePath("/admin/study-checkins");
  revalidatePath("/admin/study");
  revalidatePath("/my/study");
  revalidatePath("/my", "layout"); // 알림함 배지
}

/**
 * 비대면 스터디 인증 **확인 완료** — 코멘트를 함께 저장하고 학생 알림함으로 보낸다 (2026-10-08 Alan —
 * "비대면 스터디도 숙제 점검 처럼 게시판이 필요합니당~"). 숙제 점검(`checkHomework`)과 모양이 같고 표 · 알림 종류는 따로다.
 *
 * 코멘트는 **선택**이다 — 비워 두면 기본 안내 문구로 알림만 간다. 알림을 못 보내도 확인은 그대로 남긴다.
 * **확인 전인 인증만** 바꾼다 — 두 사람이 같은 인증을 동시에 눌러도 알림이 두 번 가지 않는다.
 * 조교도 한다 (스터디는 조교가 운영한다 — 2026-10-03 Alan). 정책 "study_checkins: 스태프·조교 확인" ·
 * "student_messages: 조교 발송"(인증 확인 알림 — 그 학생의 확인된 인증만)이 같은 집합이다.
 * **조교가 확인해도 학생 알림에 조교 이름이 가지 않는다** — DB 트리거(`private.student_messages_study_sender`)가 이름을 비운다.
 */
export async function checkStudyCheckin(input: { id: number; feedback?: string }): Promise<CheckinCheckResult> {
  const { user, profile } = await requireCrew();
  const id = Number(input.id);
  if (!Number.isInteger(id)) return { ok: false, error: "잘못된 요청이에요." };
  const feedback = String(input.feedback ?? "").trim();
  if (feedback.length > CHECKIN_MAX_FEEDBACK) return { ok: false, error: `코멘트는 ${CHECKIN_MAX_FEEDBACK}자 이내로 적어 주세요.` };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("study_checkins")
    .update({ status: "checked", checked_by: user.id, checked_at: new Date().toISOString(), feedback: feedback || null })
    .eq("id", id)
    .eq("status", "submitted")
    .select("id, user_id, material_id, material:study_materials(date, seq)");
  if (error) return { ok: false, error: `저장하지 못했어요. ${error.message}` };
  if (!data?.length) return { ok: false, error: "이미 확인했거나 학생이 지운 인증이에요. 화면을 새로고침해 주세요." };

  const c = data[0];
  const msg = studyCheckedMessage({ date: c.material?.date, seq: c.material?.seq, feedback });
  const { error: sendError } = await supabase.from("student_messages").insert({
    user_id: c.user_id,
    sender_id: user.id, // 누가 확인했는지는 기록에 남는다 (학생은 이 id 로 이름을 못 읽는다)
    sender_name: profile.name, // 조교면 DB 트리거가 비운다 — 알림함은 시각만 적는다
    title: msg.title,
    body: msg.body,
    kind: "study_checked",
    related: { checkinId: c.id, materialId: c.material_id, date: c.material?.date ?? null },
  });

  revalidateAll();
  return { ok: true, notified: !sendError };
}

/** 확인 취소 — 코멘트도 지운다. 이미 보낸 알림은 그대로 둔다 (학생이 본 것을 없애지 않는다) */
export async function undoStudyCheckin(id: number): Promise<CheckinCheckResult> {
  await requireCrew();
  if (!Number.isInteger(id)) return { ok: false, error: "잘못된 요청이에요." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("study_checkins")
    .update({ status: "submitted", checked_by: null, checked_at: null, feedback: null })
    .eq("id", id)
    .select("id");
  if (error) return { ok: false, error: `저장하지 못했어요. ${error.message}` };
  if (!data?.length) return { ok: false, error: "인증을 찾을 수 없어요." };

  revalidateAll();
  return { ok: true };
}
