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

/** 수동 승인: 반 배정 + 등록 생성 + 등업 */
export async function approveVerification(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff();

  const id = Number(formData.get("verification_id"));
  const sectionIds = [...new Set(formData.getAll("section_ids").map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  const months = Number(formData.get("months")) === 2 ? 2 : 1;
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
    .select("id, course_id, track, time_block, enrollment_opens_at, closes_at, term:terms(year, month)")
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

  const today = todayKST();
  let activatesOn = sections.map((s) => s.enrollment_opens_at).sort()[0];
  let accessUntil = sections.map((s) => s.closes_at).sort().at(-1)!;

  // 둘째 달 자동 배정 시도
  const nextRows: { section_id: number | null; pending_from: number }[] = [];
  if (months === 2) {
    for (const s of sections) {
      const t = s.term;
      let found: { id: number; closes_at: string } | null = null;
      if (t) {
        const ny = t.month === 12 ? t.year + 1 : t.year;
        const nm = t.month === 12 ? 1 : t.month + 1;
        const { data: nextTerm } = await admin.from("terms").select("id").eq("year", ny).eq("month", nm).maybeSingle();
        if (nextTerm) {
          let q = admin
            .from("class_sections")
            .select("id, closes_at")
            .eq("term_id", nextTerm.id)
            .eq("course_id", s.course_id)
            .eq("track", s.track)
            .neq("status", "draft")
            .order("id")
            .limit(1);
          q = s.time_block === null ? q.is("time_block", null) : q.eq("time_block", s.time_block);
          const { data } = await q;
          found = data?.[0] ?? null;
        }
      }
      if (found) {
        nextRows.push({ section_id: found.id, pending_from: s.id });
        if (found.closes_at > accessUntil) accessUntil = found.closes_at;
      } else {
        nextRows.push({ section_id: null, pending_from: s.id });
      }
    }
  }
  if (activatesOn > accessUntil) activatesOn = accessUntil;
  const status = activatesOn <= today ? "active" : "preliminary";

  const { data: order, error: orderErr } = await admin
    .from("enrollment_orders")
    .insert({ user_id: ver.user_id, verification_id: id, months, status, activates_on: activatesOn, access_until: accessUntil })
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
  for (const n of nextRows) {
    rows.push(
      n.section_id
        ? { order_id: order.id, student_id: ver.user_id, section_id: n.section_id, status: "active", mode }
        : { order_id: order.id, student_id: ver.user_id, section_id: null, status: "pending_section", mode, pending_from_section_id: n.pending_from },
    );
  }
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
    .update({ section_id: sectionId, mode, status: "active", pending_from_section_id: null })
    .eq("id", enrollmentId);
  if (error) return { error: error.code === "23505" ? "이미 같은 반에 배정되어 있습니다." : `저장에 실패했습니다. ${error.message}` };

  // 주문의 시청 만료일을 배정된 반들의 최대 종강일로 맞춘다
  const { data: sibs } = await admin.from("enrollments").select("section:class_sections!enrollments_section_id_fkey(closes_at)").eq("order_id", enr.order_id);
  const maxCloses = (sibs ?? []).map((s) => s.section?.closes_at).filter((d): d is string => !!d).sort().at(-1);
  if (maxCloses) await admin.from("enrollment_orders").update({ access_until: maxCloses }).eq("id", enr.order_id);

  revalidateAll(verificationId);
  redirect(`/admin/verifications/${verificationId}?done=updated`);
}
