"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MERGED_PATH } from "@/lib/auth";
import { recheckAfterRename, type RenameRecheckResult } from "./recheck";

/**
 * 이름·전화번호 확인과 계정 통합 (2026-09-18 Alan 요청), 내 정보 수정 (2026-10-02 Alan 요청).
 *
 * 판정은 전부 DB 함수가 한다 (마이그레이션 20260918110000 · 20261002150000) — 화면이 보낸 값으로 계정을 합치지 않는다.
 * 특히 **통합은 요청한 계정이 아닌 쪽에서 확인해야 실행된다** (두 계정 모두에 로그인할 수 있어야 한다).
 * **실명은 등업 전까지만 본인이 고친다** (`can_rename_self`) — 고치면 이름 때문에 멈춰 있던 수강증을 다시 본다 (`recheckAfterRename`).
 */

export type AccountState = { error?: string; message?: string; approved?: boolean };

const GENERIC = "처리하지 못했어요. 잠시 후 다시 시도해 주세요.";
const NAME_LOCKED = "등업이 끝난 뒤에는 이름을 직접 바꿀 수 없어요. 이름이 틀렸다면 선생님께 문의해 주세요.";

/** 이름을 고친 뒤 학생에게 할 말 — 수강증까지 다시 봐서 등업이 끝났으면 그것부터 말한다 */
function renamedMessage(name: string, re: RenameRecheckResult): AccountState {
  if (re.approved) {
    const what = re.preliminary ? "예비등록" : "등업";
    const where = re.assigned.length > 0 ? ` — ${re.assigned.join(", ")}` : "";
    return { message: `이름을 '${name}'(으)로 고쳤어요. 올려 둔 수강증을 다시 확인해 ${what}까지 끝냈어요${where}.`, approved: true };
  }
  if (re.pending > 0) return { message: `이름을 '${name}'(으)로 고쳤어요. 올려 둔 수강증은 선생님이 확인해 드려요.` };
  return { message: `이름을 '${name}'(으)로 고쳤어요.` };
}

/**
 * 인증 직후 확인 화면 — 적은 이름이 가입 실명과 같은지 보고, 전화번호를 저장한다.
 * 다르면 **등업 전에는 적은 이름으로 고친다** (2026-10-02 Alan — 오타를 고칠 기회). 등업 뒤에는 그대로 막힌다.
 */
export async function confirmIdentity(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();

  if (name.replace(/\s/g, "").length < 2) return { error: "이름을 정확히 적어 주세요." };
  if (!/^01[0-9]{8,9}$/.test(phone.replace(/[^0-9]/g, ""))) return { error: "휴대폰 번호를 확인해 주세요. (예: 010-1234-5678)" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const { data, error } = await supabase.rpc("confirm_identity", { p_name: name, p_phone: phone });

  if (error) {
    const msg = error.message.includes("name_mismatch")
      ? `가입할 때 적은 이름과 달라요. ${NAME_LOCKED}`
      : error.message.includes("reserved_name")
        ? "쓸 수 없는 이름이에요. 선생님께 문의해 주세요."
        : error.message.includes("invalid_name")
          ? "이름을 정확히 적어 주세요."
          : error.message.includes("invalid_phone")
            ? "휴대폰 번호를 확인해 주세요. (예: 010-1234-5678)"
            : GENERIC;
    return { error: msg };
  }

  const r = (data ?? {}) as { renamed?: boolean; from?: string; to?: string };
  if (r.renamed && r.from && r.to) {
    const re = await recheckAfterRename(user.id, r.from, r.to);
    revalidatePath("/my", "layout");
    revalidatePath("/admin/verifications");
    return renamedMessage(r.to, re);
  }

  revalidatePath("/my", "layout");
  return { message: "확인했습니다." };
}

const GENDERS = new Set(["male", "female", "other", "undisclosed"]);

/**
 * 내 정보 저장 (2026-10-02 Alan — "학생이 '내 정보' 수정을 할 수 있는 공간").
 * 휴대폰·대학·학과·성별은 세션으로 바로 고친다 (정책 "profiles: 본인·스태프·조교 수정" — 이름·등급은 안 바뀌어야 통과).
 * 이름이 달라졌으면 먼저 `rename_myself` 가 고칠 수 있는지 본다 (등업 전만). 고쳤으면 멈춰 있던 수강증을 다시 본다.
 */
export async function updateMyProfile(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const v = (k: string) => String(formData.get(k) ?? "").trim();
  const name = v("name").replace(/\s+/g, " ");
  const phone = v("phone").replace(/[^\d]/g, "");
  const university = v("university");
  const department = v("department");
  const gender = v("gender") || "undisclosed";

  if (name.replace(/\s/g, "").length < 2 || name.length > 20) return { error: "이름을 정확히 적어 주세요." };
  if (!/^01\d{8,9}$/.test(phone)) return { error: "휴대폰 번호를 확인해 주세요. (예: 010-1234-5678)" };
  if (university.length > 60 || department.length > 60) return { error: "대학 · 학과는 60자 안으로 적어 주세요." };
  if (!GENDERS.has(gender)) return { error: "성별 선택이 올바르지 않습니다." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const { data: current } = await supabase.from("profiles").select("name").eq("id", user.id).maybeSingle();
  if (!current) return { error: GENERIC };

  let renamed: { from: string; to: string } | null = null;
  if (current.name.replace(/\s/g, "") !== name.replace(/\s/g, "")) {
    const { data, error } = await supabase.rpc("rename_myself", { p_name: name });
    if (error) {
      const msg = error.message.includes("name_locked")
        ? NAME_LOCKED
        : error.message.includes("reserved_name")
          ? "쓸 수 없는 이름이에요. 선생님께 문의해 주세요."
          : error.message.includes("invalid_name")
            ? "이름을 정확히 적어 주세요."
            : GENERIC;
      return { error: msg };
    }
    const r = (data ?? {}) as { renamed?: boolean; from?: string; to?: string };
    if (r.renamed && r.from && r.to) renamed = { from: r.from, to: r.to };
  }

  const { error: saveError } = await supabase
    .from("profiles")
    .update({ phone, university: university || null, department: department || null, gender })
    .eq("id", user.id);
  if (saveError) return { error: "저장하지 못했어요. 잠시 후 다시 시도해 주세요." };

  revalidatePath("/my", "layout");
  if (renamed) {
    const re = await recheckAfterRename(user.id, renamed.from, renamed.to);
    revalidatePath("/admin/verifications");
    return renamedMessage(renamed.to, re);
  }
  return { message: "내 정보를 저장했어요." };
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

/**
 * 스태프가 보낸 "남길 계정 고르기" (2026-10-02 Alan — "학생이 직접 어느 계정을 남길 것인지 선택").
 * 어느 계정에서든 고르면 그 자리에서 합쳐진다 (스태프가 같은 사람임을 보증했다). 판정은 DB 의 `choose_merge_account`.
 * 지금 로그인한 계정을 남기지 않았으면 이 계정은 곧장 통합된 계정이 되므로 /account-merged 로 보낸다.
 */
export async function chooseMergeAccount(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const id = Number(formData.get("request_id"));
  const keep = String(formData.get("keep") ?? "");
  if (!id || !keep) return { error: "남길 계정을 골라 주세요." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const { data, error } = await supabase.rpc("choose_merge_account", { p_request: id, p_keep: keep });
  if (error) {
    const msg = error.message.includes("request_not_found")
      ? "이미 처리됐거나 취소된 요청이에요."
      : error.message.includes("forbidden")
        ? "이 계정에서는 고를 수 없어요."
        : error.message.includes("not_mergeable")
          ? "합칠 수 없는 계정이에요. 강사에게 문의해 주세요."
          : GENERIC;
    return { error: msg };
  }

  const kept = (data as { kept?: string } | null)?.kept;
  revalidatePath("/my", "layout");
  if (kept && kept !== user.id) redirect(MERGED_PATH);
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
