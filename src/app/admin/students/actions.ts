"use server";

import { revalidatePath } from "next/cache";
import { canAssignRole, isAssistant, requireCrew, requireStaff, ROLE_LABEL, type UserRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assignableError, orderWindow } from "@/lib/enrollment-window";
import { promoteToStudent } from "@/lib/student-role";
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
 * 등급(profiles.role) 변경 — 강사·관리자는 전부, **조교는 학생 등급만**
 * (2026-09-16 Alan 요청 / 2026-09-19 Alan "조교에게도 등급권한을 부여해주는 권한").
 *
 * 누가 누구를 어디까지 바꿀 수 있나는 `canAssignRole()` 한곳이 정하고, DB 정책
 * "profiles: 본인·스태프·조교 수정" 이 같은 집합을 한 번 더 본다.
 *
 * 일부러 서비스 롤을 쓰지 않고 **로그인한 사람의 세션으로** 쓴다. 그래야 RLS 가 한 번 더 막아 준다 —
 * 화면 판정이 틀려도 조교는 스태프 계정을 건드리거나 누군가를 관리자로 올릴 수 없다.
 */
export async function updateStudentRole(_prev: StudentActionState, formData: FormData): Promise<StudentActionState> {
  const { profile } = await requireCrew();
  // 테스트 중에는 RLS 가 이 관리자를 학생으로 보므로 세션 UPDATE 가 막힌다 — 먼저 끄게 안내한다
  if (profile.test_role) return { error: "테스트 중에는 등급을 바꿀 수 없어요. 화면 위 띠에서 테스트를 먼저 끝내 주세요." };

  const id = String(formData.get("id") ?? "");
  const role = String(formData.get("role") ?? "");
  if (!id || !isRole(role)) return { error: "잘못된 요청이에요." };

  const supabase = await createClient();
  const { data: target } = await supabase.from("profiles").select("id, name, role, test_role").eq("id", id).maybeSingle();
  if (!target) return { error: "학생을 찾을 수 없어요." };

  // 누가 누구를 어디까지 바꿀 수 있나는 canAssignRole 한곳이 정한다 (DB 정책과 같은 집합)
  if (!canAssignRole(profile.role, target.role, role)) {
    return {
      error: isAssistant(profile.role)
        ? "조교는 학생 등급(회원 · 수강생 · 졸업생)만 바꿀 수 있어요. 강사·관리자 계정이나 스태프 등급은 관리자에게 요청해 주세요."
        : "등급 변경은 강사·관리자만 할 수 있어요.",
    };
  }
  if (target.role === role) return { ok: true, message: `이미 ${ROLE_LABEL[role]}이에요.` };

  // 마지막 관리자를 내리면 아무도 등급을 되돌릴 수 없다
  if (target.role === "admin" && role !== "admin") {
    const { count } = await supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin").neq("id", id);
    if (!count) return { error: "마지막 관리자예요. 다른 사람을 먼저 관리자로 올린 뒤 바꿔 주세요." };
  }

  // 테스트 중인 테스터를 강사·관리자가 아닌 등급으로 내리면 test_role 이 남아 DB check(테스트 등급은 스태프만)에 걸린다.
  // test_role 은 서비스 롤만 바꿀 수 있어서 여기서 먼저 끈다 (호출한 사람이 관리자인지는 위에서 확인했다)
  const endsTest = !!target.test_role && role !== "instructor" && role !== "admin";
  if (endsTest) {
    const { error: clearError } = await createAdminClient().from("profiles").update({ test_role: null }).eq("id", id);
    if (clearError) return { error: "테스트 중인 계정이라 등급을 바꾸지 못했어요. 그 계정의 테스트를 먼저 끝내 주세요." };
  }

  const { data, error } = await supabase.from("profiles").update({ role }).eq("id", id).select("id");
  if (error) {
    // RLS 정책과 조교 가드 트리거(assistant_role_only)가 같은 코드로 막는다
    if (error.code === "42501")
      return {
        error: isAssistant(profile.role)
          ? "권한이 없어요. 조교는 학생 등급만 바꿀 수 있어요."
          : "권한이 없어요. 강사·관리자만 등급을 바꿀 수 있어요.",
      };
    // 새 등급(조교)을 넣었는데 DB 마이그레이션이 아직 안 올라간 동안 — 무슨 일인지 알려 준다
    if (error.code === "22P02") return { error: `${ROLE_LABEL[role]} 등급이 아직 서버에 올라가지 않았어요. 잠시 뒤 다시 해 주세요.` };
    if (error.code === "23514") return { error: "테스트 중인 계정이라 등급을 바꾸지 못했어요. 그 계정의 테스트를 먼저 끝내 주세요." };
    return { error: `등급을 바꾸지 못했어요. ${error.message}` };
  }
  if (!data?.length) return { error: "등급을 바꾸지 못했어요. 관리자 권한을 확인해 주세요." };

  revalidateStudent(id);
  return {
    ok: true,
    message: `${target.name || "학생"} 등급을 ${ROLE_LABEL[role]}(으)로 바꿨어요.${endsTest ? " 켜져 있던 테스트 등급도 함께 껐어요." : ""}`,
  };
}

/**
 * 반 배정 — 수강증 없이 스태프가 직접 (2026-09-16 Alan 요청).
 *
 * 수강증 승인(approveVerification)과 같은 규칙으로 등록 1건을 만든다 — 매달 등록이라 months 는 1,
 * 개강일은 고른 반 중 가장 이른 날, 시청 만료일은 가장 늦은 종강일. 수강증이 없으므로 verification_id 는 비운다.
 * enrollment_orders 에는 authenticated INSERT 권한이 없어 서비스 롤로 쓰고, 권한은 requireStaff 가 본다.
 */
export async function assignSections(_prev: StudentActionState, formData: FormData): Promise<StudentActionState> {
  await requireCrew();

  const id = String(formData.get("id") ?? "");
  const sectionIds = [...new Set(formData.getAll("section_ids").map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  const mode = formData.get("mode") === "live" ? "live" : "onsite";
  if (!id) return { error: "잘못된 요청이에요." };
  if (sectionIds.length === 0) return { error: "배정할 반을 하나 이상 골라 주세요." };

  const admin = createAdminClient();
  const { data: target } = await admin.from("profiles").select("id, name, role").eq("id", id).maybeSingle();
  if (!target) return { error: "학생을 찾을 수 없어요." };

  const { data: sections } = await admin.from("class_sections").select("id, term_id, enrollment_opens_at, closes_at").in("id", sectionIds);
  if (!sections || sections.length !== sectionIds.length) return { error: "고른 반을 찾을 수 없어요." };

  // 수강증 승인과 같은 규칙 (`enrollment-window.ts`) — 한 달의 반만, 종강 전 반만, 기간 = 반의 개강일~종강일
  const today = todayKST();
  const invalid = assignableError(sections, today);
  if (invalid) return { error: invalid };
  const { activatesOn, accessUntil, status } = orderWindow(sections, today);

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

  // 개강일이 지났으면 수강생으로 올린다 — 진짜 등급과 테스트 등급 둘 다 (promoteToStudent 참고)
  if (status === "active") await promoteToStudent(admin, id);

  revalidateStudent(id);
  return {
    ok: true,
    message: `반 ${sections.length}개를 배정했어요.${status === "preliminary" ? ` ${activatesOn} 개강일이 되면 수강생이 돼요.` : ""}`,
  };
}

/** 배정 해제. 등록에 남은 반이 없으면 등록도 함께 지운다 */
export async function removeEnrollment(enrollmentId: number): Promise<StudentActionState> {
  await requireCrew();
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

/**
 * 스태프가 두 계정을 직접 합친다 (2026-09-18 Alan 요청).
 *
 * 학생 스스로 합치려면 **두 계정 모두에 로그인**해야 하는데(도메인 규칙 3-1), 옛 계정 비밀번호를 잊거나
 * 옛 소셜 계정을 못 쓰는 경우가 있다. 그때는 강사가 같은 사람인지 확인하고 여기서 합친다.
 * 이동 규칙은 학생 쪽과 같은 DB 함수(`private.merge_accounts`)를 쓰고, 누가 합쳤는지 기록이 남는다.
 */
export async function mergeStudentAccounts(_prev: StudentActionState, formData: FormData): Promise<StudentActionState> {
  await requireStaff();

  const from = String(formData.get("from_user") ?? "");
  const to = String(formData.get("to_user") ?? "");
  if (!from || !to || from === to) return { error: "합칠 두 계정을 확인해 주세요." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("staff_merge_accounts", { p_from: from, p_to: to });

  if (error) {
    const msg = error.message.includes("not_mergeable")
      ? "강사·관리자 계정이거나 이미 합쳐진 계정이에요."
      : error.message.includes("forbidden")
        ? "권한이 없습니다."
        : `합치지 못했어요. ${error.message}`;
    return { error: msg };
  }

  const moved = (data ?? {}) as Record<string, number>;
  const total = Object.values(moved).reduce((a, b) => a + (Number(b) || 0), 0);
  revalidatePath("/admin/students", "layout");
  revalidatePath("/my", "layout");
  return { message: `계정을 합쳤어요. 기록 ${total}건을 옮기고, 비워진 계정은 로그인만 막았습니다.` };
}
