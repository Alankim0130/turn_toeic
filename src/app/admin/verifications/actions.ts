"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { todayKST } from "@/lib/utils";
import type { TablesInsert } from "@/lib/supabase/database.types";

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
  await requireStaff();

  const id = Number(formData.get("verification_id"));
  const sectionIds = [...new Set(formData.getAll("section_ids").map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  const mode = formData.get("mode") === "live" ? "live" : "onsite";
  const receiptNo = String(formData.get("receipt_no") ?? "").trim() || null;

  if (!id) return { error: "잘못된 요청입니다." };
  if (sectionIds.length === 0) return { error: "배정할 반을 1개 이상 선택해 주세요." };

  const admin = createAdminClient();
  const { data: ver } = await admin.from("enrollment_verifications").select("id, user_id, result").eq("id", id).single();
  if (!ver) return { error: "검증 기록을 찾을 수 없습니다." };
  if (ver.result === "approved") return { error: "이미 승인된 기록입니다. 정정은 아래 배정 수정에서 해 주세요." };

  const { data: sections } = await admin
    .from("class_sections")
    .select("id, enrollment_opens_at, closes_at")
    .in("id", sectionIds);
  if (!sections || sections.length !== sectionIds.length) return { error: "선택한 반을 찾을 수 없습니다." };

  if (receiptNo) {
    const { data: dup } = await admin
      .from("enrollment_verifications")
      .select("id")
      .eq("receipt_no", receiptNo)
      .eq("result", "approved")
      .neq("id", id)
      .maybeSingle();
    if (dup) return { error: "이미 다른 계정에서 사용된 영수증 번호입니다." };
  }

  // 개강일 = 고른 반 중 가장 이른 개강일, 시청 만료일 = 가장 늦은 종강일
  const today = todayKST();
  const activatesOn = sections.map((s) => s.enrollment_opens_at).sort()[0];
  const accessUntil = sections.map((s) => s.closes_at).sort().at(-1)!;
  const status = activatesOn <= today ? "active" : "preliminary";

  const { data: order, error: orderErr } = await admin
    .from("enrollment_orders")
    .insert({ user_id: ver.user_id, verification_id: id, months: 1, status, activates_on: activatesOn, access_until: accessUntil })
    .select("id")
    .single();
  if (orderErr || !order) return { error: `등록 생성에 실패했습니다. ${orderErr?.message ?? ""}` };

  const rows: TablesInsert<"enrollments">[] = sections.map((s) => ({
    order_id: order.id,
    student_id: ver.user_id,
    section_id: s.id,
    status: "active",
    mode,
  }));
  const { error: enrErr } = await admin.from("enrollments").insert(rows);
  if (enrErr) {
    await admin.from("enrollment_orders").delete().eq("id", order.id);
    return { error: enrErr.code === "23505" ? "이미 같은 반에 배정된 수강생입니다." : `반 배정에 실패했습니다. ${enrErr.message}` };
  }

  const { error: verErr } = await admin
    .from("enrollment_verifications")
    .update({ result: "approved", matched_section: sections[0].id, receipt_no: receiptNo, reject_reason: null })
    .eq("id", id);
  if (verErr) {
    await admin.from("enrollment_orders").delete().eq("id", order.id);
    return { error: verErr.code === "23505" ? "이미 다른 계정에서 사용된 영수증 번호입니다." : `승인 기록 저장에 실패했습니다. ${verErr.message}` };
  }

  if (status === "active") {
    await admin.from("profiles").update({ role: "student" }).eq("id", ver.user_id).in("role", ["member", "alumni"]);
  }

  revalidateAll(id);
  redirect(`/admin/verifications/${id}?done=approved`);
}

export async function rejectVerification(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff();
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
  await requireStaff();
  const verificationId = Number(formData.get("verification_id"));
  const enrollmentId = Number(formData.get("enrollment_id"));
  const sectionId = Number(formData.get("section_id"));
  const mode = formData.get("mode") === "live" ? "live" : "onsite";
  if (!verificationId || !enrollmentId || !sectionId) return { error: "잘못된 요청입니다." };

  const admin = createAdminClient();
  const { data: enr } = await admin.from("enrollments").select("id, order_id, student_id").eq("id", enrollmentId).single();
  if (!enr) return { error: "배정 기록을 찾을 수 없습니다." };

  const { error } = await admin
    .from("enrollments")
    .update({ section_id: sectionId, mode, status: "active" })
    .eq("id", enrollmentId);
  if (error) return { error: error.code === "23505" ? "이미 같은 반에 배정되어 있습니다." : `저장에 실패했습니다. ${error.message}` };

  // 주문의 시청 만료일을 배정된 반들의 최대 종강일로 맞춘다
  const { data: sibs } = await admin.from("enrollments").select("section:class_sections!enrollments_section_id_fkey(closes_at)").eq("order_id", enr.order_id);
  const maxCloses = (sibs ?? []).map((s) => s.section?.closes_at).filter((d): d is string => !!d).sort().at(-1);
  if (maxCloses) await admin.from("enrollment_orders").update({ access_until: maxCloses }).eq("id", enr.order_id);

  revalidateAll(verificationId);
  redirect(`/admin/verifications/${verificationId}?done=updated`);
}
