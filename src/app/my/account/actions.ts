"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * 이름·전화번호 확인과 계정 통합 (2026-09-18 Alan 요청).
 *
 * 판정은 전부 DB 함수가 한다 (마이그레이션 20260918110000) — 화면이 보낸 값으로 계정을 합치지 않는다.
 * 특히 **통합은 요청한 계정이 아닌 쪽에서 확인해야 실행된다** (두 계정 모두에 로그인할 수 있어야 한다).
 */

export type AccountState = { error?: string; message?: string };

const GENERIC = "처리하지 못했어요. 잠시 후 다시 시도해 주세요.";

/** 인증 직후 확인 화면 — 적은 이름이 가입 실명과 같은지 보고, 전화번호를 저장한다 */
export async function confirmIdentity(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();

  if (name.replace(/\s/g, "").length < 2) return { error: "이름을 정확히 적어 주세요." };
  if (!/^01[0-9]{8,9}$/.test(phone.replace(/[^0-9]/g, ""))) return { error: "휴대폰 번호를 확인해 주세요. (예: 010-1234-5678)" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("confirm_identity", { p_name: name, p_phone: phone });

  if (error) {
    const msg = error.message.includes("name_mismatch")
      ? "가입할 때 적은 이름과 달라요. 수강증의 이름이 맞다면 강사에게 문의해 주세요."
      : error.message.includes("invalid_phone")
        ? "휴대폰 번호를 확인해 주세요. (예: 010-1234-5678)"
        : GENERIC;
    return { error: msg };
  }

  revalidatePath("/my", "layout");
  return { message: "확인했습니다." };
}

/** 통합 요청 — 남길 계정을 고른다. 실제 이동은 반대쪽 계정이 확인해야 일어난다 */
export async function requestMerge(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const other = String(formData.get("other") ?? "");
  const keep = String(formData.get("keep") ?? "");
  if (!other || !keep) return { error: "합칠 계정을 골라 주세요." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("request_account_merge", { p_other: other, p_keep: keep });

  if (error) {
    return { error: error.message.includes("not_a_candidate") ? "이름·전화번호가 같은 계정이 아니에요. 다시 확인해 주세요." : GENERIC };
  }

  revalidatePath("/my", "layout");
  return { message: "통합을 신청했어요. 다른 계정으로 로그인해서 확인하면 합쳐집니다." };
}

/** 통합 확인 — **요청하지 않은 쪽** 계정에서만 된다 (본인 확인) */
export async function confirmMerge(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const id = Number(formData.get("request_id"));
  if (!id) return { error: "잘못된 요청입니다." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("confirm_account_merge", { p_request: id });

  if (error) {
    const msg = error.message.includes("not_the_other_account")
      ? "이 계정에서는 확인할 수 없어요. 통합을 신청하지 않은 쪽 계정으로 로그인해 주세요."
      : error.message.includes("request_not_found")
        ? "이미 처리됐거나 취소된 신청이에요."
        : error.message.includes("not_mergeable")
          ? "합칠 수 없는 계정이에요. 강사에게 문의해 주세요."
          : GENERIC;
    return { error: msg };
  }

  revalidatePath("/my", "layout");
  return { message: "계정을 합쳤어요. 숙제·수강 기록이 이 계정으로 모두 옮겨졌습니다." };
}

export async function cancelMerge(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const id = Number(formData.get("request_id"));
  if (!id) return { error: "잘못된 요청입니다." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_account_merge", { p_request: id });
  if (error) return { error: error.message.includes("request_not_found") ? "이미 처리된 신청이에요." : GENERIC };

  revalidatePath("/my", "layout");
  return { message: "신청을 취소했어요." };
}
