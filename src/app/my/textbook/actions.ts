"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { notifyStaff } from "@/lib/push";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { textbookOrderError } from "@/lib/textbook";
import { formatWon } from "@/lib/utils";

export type TextbookState = { ok?: boolean; error?: string; values?: Record<string, string> };

/**
 * 불라방 교재 주문 (2026-09-21). **품목·금액·입금 계좌는 DB 함수가 정한다** (`public.create_textbook_order`) —
 * 화면이 보낸 것은 고른 교재 번호와 배송지·입금자명뿐이고, 함수가 자격(그 달 불라방 배정)·레벨·중복을 다시 본다.
 */
export async function submitTextbookOrder(_prev: TextbookState, formData: FormData): Promise<TextbookState> {
  const v = (k: string) => String(formData.get(k) ?? "").trim();
  const values = {
    term_id: v("term_id"),
    recipient_name: v("recipient_name"),
    phone: v("phone"),
    postal_code: v("postal_code"),
    address: v("address"),
    address_detail: v("address_detail"),
    memo: v("memo"),
    depositor_name: v("depositor_name"),
  };
  const itemIds = formData
    .getAll("item_id")
    .map((x) => Number(x))
    .filter((n) => Number.isInteger(n) && n > 0);

  const termId = Number(values.term_id);
  if (!Number.isInteger(termId) || termId <= 0) return { error: "주문할 달을 골라 주세요.", values };
  if (itemIds.length === 0) return { error: "주문할 교재를 하나 이상 골라 주세요.", values };
  if (!values.depositor_name) return { error: textbookOrderError("depositor"), values };

  const supabase = await createClient();
  const { data: orderId, error } = await supabase.rpc("create_textbook_order", {
    p_term_id: termId,
    p_item_ids: itemIds,
    p_recipient: values.recipient_name,
    p_phone: values.phone,
    p_postal_code: values.postal_code,
    p_address: values.address,
    p_address_detail: values.address_detail,
    p_memo: values.memo,
    p_depositor: values.depositor_name,
  });
  if (error || !orderId) return { error: textbookOrderError(error?.message), values };

  // 응답을 보낸 뒤에 알린다 — 주문한 행을 서버 전용 클라이언트로 읽는다 (방금 함수가 넣은 행이라 권한 확인은 끝났다)
  after(async () => {
    const { data: o } = await createAdminClient().from("textbook_orders").select("recipient_name, items, total_amount, depositor_name").eq("id", orderId).maybeSingle();
    const count = Array.isArray(o?.items) ? o.items.length : itemIds.length;
    await notifyStaff("textbook_order", {
      title: "새 교재주문",
      body: `${o?.recipient_name ?? values.recipient_name}님 · 교재 ${count}권 · ${formatWon(o?.total_amount ?? 0)} (입금자 ${o?.depositor_name ?? values.depositor_name})`,
      url: "/admin/textbook-orders",
    });
  });

  revalidatePath("/my/textbook");
  return { ok: true };
}

/** 입금 확인 전에만 본인이 취소한다 (DB 함수가 상태를 다시 본다) */
export async function cancelTextbookOrder(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) return;
  const supabase = await createClient();
  await supabase.rpc("cancel_textbook_order", { p_id: id });
  revalidatePath("/my/textbook");
}
