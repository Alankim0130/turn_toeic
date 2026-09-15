"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyStaff } from "@/lib/push";

export type SubmitVerificationInput = { filePath: string };
export type SubmitVerificationResult = { ok: true } | { ok: false; error: string };

/**
 * 업로드가 끝난 수강증 경로를 접수한다.
 * enrollment_verifications 는 service_role 만 insert 할 수 있으므로, 여기서 세션·경로를 검증한 뒤 admin 클라이언트로 넣는다.
 * 등록은 매달 단위이고 현장/불라방은 수강증 내용(수강료)으로 판정하므로 학생에게 따로 받지 않는다.
 * OCR 엔진 미확정 → result·parsed 를 비워 두고 /admin/verifications 에서 검토·승인한다.
 */
export async function submitVerification(input: SubmitVerificationInput): Promise<SubmitVerificationResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const filePath = String(input?.filePath ?? "");
  if (!filePath.startsWith(`${user.id}/`) || filePath.includes("..")) return { ok: false, error: "파일 경로가 올바르지 않습니다." };

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
  });
  if (error) return { ok: false, error: "접수 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요." };

  after(async () => {
    const { data: profile } = await admin.from("profiles").select("name").eq("id", user.id).maybeSingle();
    await notifyStaff("verification", {
      title: "새 등업신청",
      body: `${profile?.name || "회원"}님이 수강증을 올렸어요. 확인해 주세요.`,
      url: "/admin/verifications?status=pending",
    });
  });

  revalidatePath("/my");
  revalidatePath("/my/verify");
  return { ok: true };
}
