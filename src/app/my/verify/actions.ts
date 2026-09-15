"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type SubmitVerificationInput = { filePath: string; months: number; mode: "onsite" | "live" };
export type SubmitVerificationResult = { ok: true } | { ok: false; error: string };

/**
 * 업로드가 끝난 수강증 경로를 접수한다.
 * enrollment_verifications 는 service_role 만 insert 할 수 있으므로, 여기서 세션·경로를 검증한 뒤 admin 클라이언트로 넣는다.
 * OCR 엔진 미확정 → result = null 로 두고 /admin/verifications 에서 검토·승인한다.
 */
export async function submitVerification(input: SubmitVerificationInput): Promise<SubmitVerificationResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const filePath = String(input.filePath ?? "");
  const months = Number(input.months);
  const mode = input.mode === "live" ? "live" : "onsite";

  if (!filePath.startsWith(`${user.id}/`) || filePath.includes("..")) return { ok: false, error: "파일 경로가 올바르지 않습니다." };
  if (months !== 1 && months !== 2) return { ok: false, error: "등록 개월수는 1 또는 2개월만 가능합니다." };

  const admin = createAdminClient();

  // 실제로 올라간 파일인지 확인
  const fileName = filePath.slice(user.id.length + 1);
  const { data: listed, error: listError } = await admin.storage.from("receipts").list(user.id, { search: fileName, limit: 5 });
  if (listError || !listed?.some((f) => f.name === fileName)) {
    return { ok: false, error: "업로드된 파일을 찾을 수 없어요. 다시 시도해 주세요." };
  }

  // 확인 중인 신청이 있으면 중복 접수 막기
  const { count } = await admin
    .from("enrollment_verifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("result", null);
  if ((count ?? 0) > 0) {
    return { ok: false, error: "이미 확인 중인 등업신청이 있어요. 처리가 끝난 뒤 다시 올려 주세요." };
  }

  const { error } = await admin.from("enrollment_verifications").insert({
    user_id: user.id,
    file_path: filePath,
    result: null,
    parsed: { months, mode_hint: mode },
  });
  if (error) return { ok: false, error: "접수 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요." };

  revalidatePath("/my");
  revalidatePath("/my/verify");
  return { ok: true };
}
