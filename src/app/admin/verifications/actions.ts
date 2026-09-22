"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCrew } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { approveVerificationWith } from "@/lib/approve-verification";
import { assignableError } from "@/lib/enrollment-window";
import { todayKST } from "@/lib/utils";

export type ActionState = { error?: string };

function revalidateAll(id: number) {
  revalidatePath("/admin");
  revalidatePath("/admin/students");
  revalidatePath("/admin/verifications");
  revalidatePath(`/admin/verifications/${id}`);
  revalidatePath("/my", "layout");
}

/**
 * 수동 승인: 반 배정 + 등록 생성 + 등업.
 * 등록은 매달 단위(2026-09-15 Alan 확정)라 한 번의 승인 = 그 달 반 배정 1건이다.
 * 주5일은 같은 달의 월수금·화목금 두 반을 함께 고른다.
 */
export async function approveVerification(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireCrew();

  const id = Number(formData.get("verification_id"));
  const sectionIds = [...new Set(formData.getAll("section_ids").map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  const mode = formData.get("mode") === "live" ? "live" : "onsite";

  if (!id) return { error: "잘못된 요청입니다." };
  if (sectionIds.length === 0) return { error: "배정할 반을 1개 이상 선택해 주세요." };

  const admin = createAdminClient();
  const { data: ver } = await admin.from("enrollment_verifications").select("id, user_id, result").eq("id", id).single();
  if (!ver) return { error: "검증 기록을 찾을 수 없습니다." };
  if (ver.result === "approved") return { error: "이미 승인된 기록입니다. 정정은 아래 배정 수정에서 해 주세요." };

  // 승인 본체는 OCR 자동 승인과 같은 함수다 (src/lib/approve-verification.ts)
  const approved = await approveVerificationWith(admin, { verificationId: id, userId: ver.user_id, sectionIds, mode });
  if (!approved.ok) return { error: approved.error };

  revalidateAll(id);
  redirect(`/admin/verifications/${id}?done=approved`);
}

export async function rejectVerification(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireCrew();
  const id = Number(formData.get("verification_id"));
  const reason = String(formData.get("reject_reason") ?? "").trim();
  if (!id) return { error: "잘못된 요청입니다." };
  if (reason.length < 2) return { error: "반려 사유를 입력해 주세요. 학생에게 그대로 보입니다." };

  const admin = createAdminClient();
  const { data: ver } = await admin.from("enrollment_verifications").select("id, result").eq("id", id).single();
  if (!ver) return { error: "검증 기록을 찾을 수 없습니다." };
  if (ver.result === "approved") return { error: "이미 승인된 기록은 반려할 수 없습니다." };

  const { error } = await admin.from("enrollment_verifications").update({ result: "rejected", reject_reason: reason }).eq("id", id);
  if (error) return { error: `저장에 실패했습니다. ${error.message}` };

  revalidateAll(id);
  redirect(`/admin/verifications/${id}?done=rejected`);
}

/** 오배정 정정: 배정된 반 / 수강 방식 변경 */
export async function updateEnrollment(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireCrew();
  const verificationId = Number(formData.get("verification_id"));
  const enrollmentId = Number(formData.get("enrollment_id"));
  const sectionId = Number(formData.get("section_id"));
  const mode = formData.get("mode") === "live" ? "live" : "onsite";
  if (!verificationId || !enrollmentId || !sectionId) return { error: "잘못된 요청입니다." };

  const admin = createAdminClient();
  const { data: enr } = await admin.from("enrollments").select("id, order_id, student_id").eq("id", enrollmentId).single();
  if (!enr) return { error: "배정 기록을 찾을 수 없습니다." };

  // 승인과 같은 규칙 — 옮긴 뒤에도 한 등록 안의 반은 한 달(기수)이고, 종강 전이어야 한다 (`enrollment-window.ts`)
  const [{ data: target }, { data: sibs }] = await Promise.all([
    admin.from("class_sections").select("id, term_id, enrollment_opens_at, closes_at").eq("id", sectionId).maybeSingle(),
    admin
      .from("enrollments")
      .select("id, section:class_sections!enrollments_section_id_fkey(id, term_id, enrollment_opens_at, closes_at)")
      .eq("order_id", enr.order_id)
      .neq("id", enrollmentId),
  ]);
  if (!target) return { error: "고른 반을 찾을 수 없습니다." };
  const invalid = assignableError([target, ...(sibs ?? []).flatMap((s) => (s.section ? [s.section] : []))], todayKST());
  if (invalid) return { error: invalid };

  const { error } = await admin
    .from("enrollments")
    .update({ section_id: sectionId, mode, status: "active" })
    .eq("id", enrollmentId);
  if (error) return { error: error.code === "23505" ? "이미 같은 반에 배정되어 있습니다." : `저장에 실패했습니다. ${error.message}` };
  // 등록 기간(개강일~종강일)·상태·학생 등급은 DB 트리거가 옮긴 반의 날짜로 다시 맞춘다 (private.sync_order_window, 20260922113000).
  // 그전에는 여기서 만료일만 고쳐 개강일·상태가 옛 반 그대로 남았다

  revalidateAll(verificationId);
  redirect(`/admin/verifications/${verificationId}?done=updated`);
}
