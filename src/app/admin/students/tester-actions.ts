"use server";

import { revalidatePath } from "next/cache";
import { isAdmin, isStaff, isTestRole, requireStaff, ROLE_LABEL } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export type TesterActionState = { ok?: boolean; error?: string; message?: string };

/**
 * 테스트 등급 켜기 · 바꾸기 · 끄기 (2026-09-16 Alan 요청 — 강사·관리자 계정을 테스터로).
 *
 * test_role 은 authenticated 에 쓰기 권한이 없다. 테스트 중에는 RLS 상 관리자가 아니라서 세션으로는
 * 스스로 끌 수도 없기 때문에, 여기서 **진짜 등급(role)** 을 확인한 뒤 서비스 롤로 쓴다.
 *  - 내 계정: 강사·관리자면 누구나
 *  - 다른 테스터 계정: 관리자만
 *  - 대상은 강사·관리자 계정만 (DB check 제약도 같은 규칙)
 */
async function writeTestRole(targetId: string, value: string): Promise<TesterActionState> {
  const { user, profile } = await requireStaff();
  const id = targetId || user.id;
  if (value !== "" && !isTestRole(value)) return { error: "테스트 등급은 회원 · 수강생 · 졸업생 중에서 고를 수 있어요." };
  if (id !== user.id && !isAdmin(profile.role)) return { error: "다른 사람의 테스트 등급은 관리자만 바꿀 수 있어요." };

  const admin = createAdminClient();
  const { data: target } = await admin.from("profiles").select("id, name, role").eq("id", id).maybeSingle();
  if (!target) return { error: "계정을 찾을 수 없어요." };
  if (!isStaff(target.role)) return { error: "테스터(강사·관리자) 계정만 테스트 등급을 켤 수 있어요." };

  const next = isTestRole(value) ? value : null;
  const { error } = await admin.from("profiles").update({ test_role: next }).eq("id", id);
  if (error) return { error: `테스트 등급을 바꾸지 못했어요. ${error.message}` };

  revalidatePath("/", "layout");
  const who = id === user.id ? "내 계정" : `${target.name || "테스터"} 계정`;
  return {
    ok: true,
    message: next ? `${who}을 ${ROLE_LABEL[next]}(으)로 테스트합니다. 학생 모드에서 확인해 보세요.` : `${who}의 테스트를 끝냈어요.`,
  };
}

/** 학생 상세의 "테스트 등급" 칸 */
export async function setTestRole(_prev: TesterActionState, formData: FormData): Promise<TesterActionState> {
  return writeTestRole(String(formData.get("id") ?? ""), String(formData.get("test_role") ?? ""));
}

/** 화면 위 테스트 띠: 내 테스트 등급 바꾸기 */
export async function switchMyTestRole(formData: FormData) {
  await writeTestRole("", String(formData.get("test_role") ?? ""));
}

/** 화면 위 테스트 띠: 테스트 끝내기 */
export async function endMyTest() {
  await writeTestRole("", "");
}
