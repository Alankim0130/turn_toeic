"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * 교재·입금 계좌 설정 (2026-09-21 Alan — "교재비를 받는 계좌번호와 교재 과목 등록은 강사가 직접").
 * **강사·관리자만** (조교는 주문 처리만 한다). 쓰기는 로그인한 사람의 세션으로 해서 DB 정책(is_staff)이 한 번 더 막는다.
 */

const BACK = "/admin/textbook-orders/setup";
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const num = (f: FormData, k: string) => {
  const v = str(f, k).replace(/[,\s원]/g, "");
  return v === "" ? null : Number(v);
};

function done(section: string, ok: boolean, error?: string): never {
  revalidatePath(BACK);
  revalidatePath("/my/textbook");
  redirect(`${BACK}?${ok ? `ok=${section}` : `error=${encodeURIComponent(error ?? "save")}`}#${section}`);
}

// ─── 입금 계좌 ─────────────────────────────────────────────────────────────
export async function saveTextbookAccount(formData: FormData) {
  await requireStaff();
  const id = num(formData, "id");
  const row = {
    bank_name: str(formData, "bank_name"),
    account_no: str(formData, "account_no"),
    holder: str(formData, "holder"),
    label: str(formData, "label") || null,
    sort_order: num(formData, "sort_order") ?? 0,
    updated_at: new Date().toISOString(),
  };
  if (!row.bank_name || row.bank_name.length > 30) done("accounts", false, "은행 이름을 확인해 주세요 (30자까지).");
  if (row.account_no.length < 4 || row.account_no.length > 40) done("accounts", false, "계좌번호를 확인해 주세요.");
  if (!row.holder || row.holder.length > 30) done("accounts", false, "예금주를 확인해 주세요 (30자까지).");
  if (row.label && row.label.length > 40) done("accounts", false, "이름표는 40자까지예요.");
  if (!Number.isInteger(row.sort_order)) done("accounts", false, "순서는 숫자로 적어 주세요.");

  const supabase = await createClient();
  const { error } = id ? await supabase.from("textbook_accounts").update(row).eq("id", id) : await supabase.from("textbook_accounts").insert(row);
  done("accounts", !error, error?.message);
}

export async function toggleTextbookAccount(formData: FormData) {
  await requireStaff();
  const id = num(formData, "id");
  if (!id) done("accounts", false, "잘못된 요청입니다.");
  const supabase = await createClient();
  const { error } = await supabase
    .from("textbook_accounts")
    .update({ active: str(formData, "active") === "true", updated_at: new Date().toISOString() })
    .eq("id", id!);
  done("accounts", !error, error?.message);
}

export async function deleteTextbookAccount(formData: FormData) {
  await requireStaff();
  const id = num(formData, "id");
  if (!id) done("accounts", false, "잘못된 요청입니다.");
  // 지난 주문의 입금 안내는 주문에 박혀 있어 계좌를 지워도 남는다. 이 계좌를 쓰던 교재는 기본 계좌로 간다
  const supabase = await createClient();
  const { error } = await supabase.from("textbook_accounts").delete().eq("id", id!);
  done("accounts", !error, error?.message);
}

// ─── 교재 ─────────────────────────────────────────────────────────────────
export async function saveTextbookItem(formData: FormData) {
  await requireStaff();
  const id = num(formData, "id");
  const level = num(formData, "level");
  const accountId = num(formData, "account_id");
  const row = {
    name: str(formData, "name"),
    level,
    price: num(formData, "price") ?? -1,
    account_id: accountId,
    note: str(formData, "note") || null,
    sort_order: num(formData, "sort_order") ?? 0,
    updated_at: new Date().toISOString(),
  };
  if (!row.name || row.name.length > 60) done("items", false, "교재 이름을 확인해 주세요 (60자까지).");
  if (!Number.isInteger(row.price) || row.price < 0 || row.price > 1_000_000) done("items", false, "가격은 0원부터 100만 원까지 숫자로 적어 주세요.");
  if (level !== null && !Number.isInteger(level)) done("items", false, "레벨을 다시 골라 주세요.");
  if (accountId !== null && !Number.isInteger(accountId)) done("items", false, "입금 계좌를 다시 골라 주세요.");
  if (row.note && row.note.length > 200) done("items", false, "설명은 200자까지예요.");
  if (!Number.isInteger(row.sort_order)) done("items", false, "순서는 숫자로 적어 주세요.");

  const supabase = await createClient();
  const { error } = id ? await supabase.from("textbook_items").update(row).eq("id", id) : await supabase.from("textbook_items").insert(row);
  done("items", !error, error?.message);
}

export async function toggleTextbookItem(formData: FormData) {
  await requireStaff();
  const id = num(formData, "id");
  if (!id) done("items", false, "잘못된 요청입니다.");
  const supabase = await createClient();
  const { error } = await supabase
    .from("textbook_items")
    .update({ active: str(formData, "active") === "true", updated_at: new Date().toISOString() })
    .eq("id", id!);
  done("items", !error, error?.message);
}

export async function deleteTextbookItem(formData: FormData) {
  await requireStaff();
  const id = num(formData, "id");
  if (!id) done("items", false, "잘못된 요청입니다.");
  // 이미 들어온 주문에는 교재 이름·가격이 박혀 있어 지워도 내역은 그대로다
  const supabase = await createClient();
  const { error } = await supabase.from("textbook_items").delete().eq("id", id!);
  done("items", !error, error?.message);
}

// ─── 배송비 · 기본 계좌 · 안내 ─────────────────────────────────────────────
export async function saveTextbookSettings(formData: FormData) {
  await requireStaff();
  const shipping = num(formData, "shipping_fee") ?? 0;
  const defaultAccount = num(formData, "default_account_id");
  const notice = str(formData, "notice") || null;
  if (!Number.isInteger(shipping) || shipping < 0 || shipping > 100_000) done("settings", false, "배송비는 0원부터 10만 원까지 숫자로 적어 주세요.");
  if (defaultAccount !== null && !Number.isInteger(defaultAccount)) done("settings", false, "기본 계좌를 다시 골라 주세요.");
  if (notice && notice.length > 300) done("settings", false, "안내 문구는 300자까지예요.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("textbook_settings")
    .update({ shipping_fee: shipping, default_account_id: defaultAccount, notice, updated_at: new Date().toISOString() })
    .eq("id", true);
  done("settings", !error, error?.message);
}
