"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCrew, requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AUTO_VERIFY_KEY } from "@/lib/auto-verify";
import { rematchHeldVerifications } from "@/lib/rematch-held";
import { approveVerificationWith } from "@/lib/approve-verification";
import { assignableError } from "@/lib/enrollment-window";
import { todayKST } from "@/lib/utils";

export type ActionState = { error?: string; ok?: boolean; message?: string };

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

  // 승인 본체는 OCR 자동 승인과 같은 함수다 (src/lib/approve-verification.ts).
  // 스태프가 직접 고른 반은 **그 달의 최종 배정**이다 (2026-09-23 Alan) — 이미 그 반에 있어도 막지 않고 옮겨 온다
  const approved = await approveVerificationWith(admin, { verificationId: id, userId: ver.user_id, sectionIds, mode, final: true });
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

/**
 * 수강증 자동 판정 **긴급 스위치** 켜고 끄기 (2026-09-22 Alan "자동 승인 긴급 스위치", 마이그레이션 20260923000500).
 * 끄면 자동 승인·자동 거절 둘 다 멈추고 모든 수강증이 검토 대기로 온다. 배포 없이 바로 먹는다.
 *
 * **강사·관리자만** — 조교에게 연 적 없는 권한이다 (조교는 상태만 본다). 서비스 롤을 쓰지 않고 로그인한 사람의 세션으로 바꿔
 * RLS(`feature_flags: 스태프 수정`)가 한 번 더 막고, 누가 바꿨는지는 트리거가 적는다.
 */
export async function setAutoVerify(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff();
  const enabled = formData.get("enabled") === "true";
  const note = String(formData.get("note") ?? "").trim().slice(0, 200);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("feature_flags")
    .update({ enabled, note: enabled ? null : note || null })
    .eq("key", AUTO_VERIFY_KEY)
    .select("key");
  if (error) return { error: `바꾸지 못했어요. ${error.message}` };
  if (!data || data.length === 0) return { error: "스위치를 찾지 못했어요 — 방금 배포했다면 잠시 뒤 다시 눌러 주세요." };

  revalidatePath("/admin/verifications");
  return {
    ok: true,
    message: enabled ? "자동 판정을 다시 켰어요. 이제 올라오는 수강증부터 자동으로 판정해요." : "자동 판정을 멈췄어요. 이제 모든 수강증이 검토 대기로 와요.",
  };
}

/**
 * 받아 둔 다음 달 수강증을 **지금** 다시 맞춘다 (2026-09-22). 보통은 반을 열 때 저절로 돌지만(반 편성의 개설·상태 변경),
 * 반을 다른 길(SQL 등)로 열었거나 그때 실패했을 때의 길이다. 배정은 승인과 같은 일이라 승인 권한과 같이 조교도 누른다.
 */
export async function rematchHeldNow(): Promise<ActionState> {
  await requireCrew();
  const r = await rematchHeldVerifications(createAdminClient());
  revalidatePath("/admin");
  revalidatePath("/admin/students");
  revalidatePath("/admin/verifications");
  if (r.approved + r.review === 0) {
    return { ok: true, message: r.waiting > 0 ? `아직 맞출 반이 없어요 — ${r.waiting}건은 그 달 반이 열릴 때까지 기다려요.` : "받아 둔 수강증이 없어요." };
  }
  return {
    ok: true,
    message: `자동 배정 ${r.approved}건${r.review > 0 ? ` · 확인이 필요해 검토 대기로 옮긴 ${r.review}건` : ""}${r.waiting > 0 ? ` · 아직 반이 없어 기다리는 ${r.waiting}건` : ""}.`,
  };
}
