"use server";

import { revalidatePath } from "next/cache";
import { isAdmin, requireStaff, ROLE_LABEL, type UserRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { todayKST } from "@/lib/utils";
import type { TablesInsert } from "@/lib/supabase/database.types";

export type StudentActionState = { ok?: boolean; error?: string; message?: string };

const ROLES = Object.keys(ROLE_LABEL) as UserRole[];
const isRole = (v: string): v is UserRole => (ROLES as string[]).includes(v);

function revalidateStudent(id: string) {
  revalidatePath("/admin/students");
  revalidatePath(`/admin/students/${id}`);
  revalidatePath("/admin");
  revalidatePath("/my", "layout");
}

/**
 * 등급(profiles.role) 변경 — 관리자만 (2026-09-16 Alan 요청).
 *
 * 일부러 서비스 롤을 쓰지 않고 **로그인한 사람의 세션으로** 쓴다. 그래야 RLS 정책
 * ("profiles: 본인·admin 수정", with check private.is_admin())이 한 번 더 막아 준다 —
 * 화면 판정이 틀려도 강사는 등급을 못 바꾼다.
 */
export async function updateStudentRole(_prev: StudentActionState, formData: FormData): Promise<StudentActionState> {
  const { profile } = await requireStaff();
  if (!isAdmin(profile.role)) return { error: "등급 변경은 관리자만 할 수 있어요." };

  const id = String(formData.get("id") ?? "");
  const role = String(formData.get("role") ?? "");
  if (!id || !isRole(role)) return { error: "잘못된 요청이에요." };

  const supabase = await createClient();
  const { data: target } = await supabase.from("profiles").select("id, name, role").eq("id", id).maybeSingle();
  if (!target) return { error: "학생을 찾을 수 없어요." };
  if (target.role === role) return { ok: true, message: `이미 ${ROLE_LABEL[role]}이에요.` };

  // 마지막 관리자를 내리면 아무도 등급을 되돌릴 수 없다
  if (target.role === "admin" && role !== "admin") {
    const { count } = await supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin").neq("id", id);
    if (!count) return { error: "마지막 관리자예요. 다른 사람을 먼저 관리자로 올린 뒤 바꿔 주세요." };
  }

  const { data, error } = await supabase.from("profiles").update({ role }).eq("id", id).select("id");
  if (error) return { error: error.code === "42501" ? "권한이 없어요. 관리자만 등급을 바꿀 수 있어요." : `등급을 바꾸지 못했어요. ${error.message}` };
  if (!data?.length) return { error: "등급을 바꾸지 못했어요. 관리자 권한을 확인해 주세요." };

  revalidateStudent(id);
  return { ok: true, message: `${target.name || "학생"} 등급을 ${ROLE_LABEL[role]}(으)로 바꿨어요.` };
}

/**
 * 반 배정 — 수강증 없이 스태프가 직접 (2026-09-16 Alan 요청).
 *
 * 수강증 승인(approveVerification)과 같은 규칙으로 등록 1건을 만든다 — 매달 등록이라 months 는 1,
 * 개강일은 고른 반 중 가장 이른 날, 시청 만료일은 가장 늦은 종강일. 수강증이 없으므로 verification_id 는 비운다.
 * enrollment_orders 에는 authenticated INSERT 권한이 없어 서비스 롤로 쓰고, 권한은 requireStaff 가 본다.
 */
export async function assignSections(_prev: StudentActionState, formData: FormData): Promise<StudentActionState> {
  await requireStaff();

  const id = String(formData.get("id") ?? "");
  const sectionIds = [...new Set(formData.getAll("section_ids").map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  const mode = formData.get("mode") === "live" ? "live" : "onsite";
  if (!id) return { error: "잘못된 요청이에요." };
  if (sectionIds.length === 0) return { error: "배정할 반을 하나 이상 골라 주세요." };

  const admin = createAdminClient();
  const { data: target } = await admin.from("profiles").select("id, name, role").eq("id", id).maybeSingle();
  if (!target) return { error: "학생을 찾을 수 없어요." };

  const { data: sections } = await admin.from("class_sections").select("id, enrollment_opens_at, closes_at").in("id", sectionIds);
  if (!sections || sections.length !== sectionIds.length) return { error: "고른 반을 찾을 수 없어요." };

  const today = todayKST();
  const activatesOn = sections.map((s) => s.enrollment_opens_at).sort()[0];
  const accessUntil = sections.map((s) => s.closes_at).sort().at(-1)!;
  const status = activatesOn <= today ? "active" : "preliminary";

  const { data: order, error: orderErr } = await admin
    .from("enrollment_orders")
    .insert({ user_id: id, months: 1, status, activates_on: activatesOn, access_until: accessUntil })
    .select("id")
    .single();
  if (orderErr || !order) return { error: `등록을 만들지 못했어요. ${orderErr?.message ?? ""}` };

  const rows: TablesInsert<"enrollments">[] = sections.map((s) => ({ order_id: order.id, student_id: id, section_id: s.id, status: "active", mode }));
  const { error: enrErr } = await admin.from("enrollments").insert(rows);
  if (enrErr) {
    await admin.from("enrollment_orders").delete().eq("id", order.id);
    return { error: enrErr.code === "23505" ? "이미 그 반에 배정된 학생이에요." : `반 배정에 실패했어요. ${enrErr.message}` };
  }

  // 개강일이 지났으면 수강생으로 올린다 (강사·관리자는 그대로 둔다)
  if (status === "active") await admin.from("profiles").update({ role: "student" }).eq("id", id).in("role", ["member", "alumni"]);

  revalidateStudent(id);
  return {
    ok: true,
    message: `반 ${sections.length}개를 배정했어요.${status === "preliminary" ? ` ${activatesOn} 개강일이 되면 수강생이 돼요.` : ""}`,
  };
}

/** 배정 해제. 등록에 남은 반이 없으면 등록도 함께 지운다 */
export async function removeEnrollment(enrollmentId: number): Promise<StudentActionState> {
  await requireStaff();
  if (!Number.isInteger(enrollmentId)) return { error: "잘못된 요청이에요." };

  const admin = createAdminClient();
  const { data: gone, error } = await admin.from("enrollments").delete().eq("id", enrollmentId).select("student_id, order_id");
  if (error) return { error: `배정을 해제하지 못했어요. ${error.message}` };
  if (!gone?.length) return { error: "배정을 찾을 수 없어요." };

  const { student_id: studentId, order_id: orderId } = gone[0];
  if (orderId) {
    const { count } = await admin.from("enrollments").select("id", { count: "exact", head: true }).eq("order_id", orderId);
    if (!count) await admin.from("enrollment_orders").delete().eq("id", orderId);
  }

  if (studentId) revalidateStudent(studentId);
  return { ok: true, message: "배정을 해제했어요." };
}
