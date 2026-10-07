"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { notifyStaff } from "@/lib/push";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PICKUP_TIMES, pickupLabel, textbookOrderError } from "@/lib/textbook";
import { formatWon } from "@/lib/utils";

/** `pickup` — 현장수령 주문이면 받으러 올 날짜 · 시각 한 줄 (접수 안내에 그대로 쓴다) */
export type TextbookState = { ok?: boolean; pickup?: string; error?: string; values?: Record<string, string> };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 불라방 교재 주문 (2026-09-21). **품목·금액·입금 계좌는 DB 함수가 정한다** (`public.create_textbook_order`) —
 * 화면이 보낸 것은 고른 교재 번호와 배송지(또는 받으러 올 날짜 · 시각)·입금자명뿐이고, 함수가 자격(그 달 불라방 배정)·레벨·중복을 다시 본다.
 *
 * 받는 방법(2026-10-07): 택배면 예전 그대로 아홉 칸만 보낸다. **현장수령일 때만** p_delivery · p_pickup_date · p_pickup_time 을 더한다 —
 * 배포 사이에 DB 함수가 아직 예전 모양이어도 택배 주문은 그대로 들어간다 (새 칸은 함수에 기본값이 있다).
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
    delivery: v("delivery") === "pickup" ? "pickup" : "parcel",
    pickup_date: v("pickup_date"),
    pickup_time: v("pickup_time"),
  };
  const itemIds = formData
    .getAll("item_id")
    .map((x) => Number(x))
    .filter((n) => Number.isInteger(n) && n > 0);
  const pickup = values.delivery === "pickup";

  const termId = Number(values.term_id);
  if (!Number.isInteger(termId) || termId <= 0) return { error: "주문할 달을 골라 주세요.", values };
  if (itemIds.length === 0) return { error: "주문할 교재를 하나 이상 골라 주세요.", values };
  if (pickup && !DATE.test(values.pickup_date)) return { error: textbookOrderError("pickup_date"), values };
  if (pickup && !PICKUP_TIMES.includes(values.pickup_time)) return { error: textbookOrderError("pickup_time"), values };
  if (!values.depositor_name) return { error: textbookOrderError("depositor"), values };

  const supabase = await createClient();
  const { data: orderId, error } = await supabase.rpc("create_textbook_order", {
    p_term_id: termId,
    p_item_ids: itemIds,
    p_recipient: values.recipient_name,
    p_phone: values.phone,
    p_postal_code: pickup ? "" : values.postal_code,
    p_address: pickup ? "" : values.address,
    p_address_detail: pickup ? "" : values.address_detail,
    p_memo: values.memo,
    p_depositor: values.depositor_name,
    ...(pickup ? { p_delivery: "pickup", p_pickup_date: values.pickup_date, p_pickup_time: values.pickup_time } : {}),
  });
  if (error || !orderId) return { error: textbookOrderError(error?.message), values };

  const when = pickup ? pickupLabel(values.pickup_date, values.pickup_time) : null;
  // 응답을 보낸 뒤에 알린다 — 주문한 행을 서버 전용 클라이언트로 읽는다 (방금 함수가 넣은 행이라 권한 확인은 끝났다)
  after(async () => {
    const { data: o } = await createAdminClient().from("textbook_orders").select("recipient_name, items, total_amount, depositor_name").eq("id", orderId).maybeSingle();
    const count = Array.isArray(o?.items) ? o.items.length : itemIds.length;
    await notifyStaff("textbook_order", {
      title: when ? "새 교재주문 · 현장수령" : "새 교재주문",
      body:
        `${o?.recipient_name ?? values.recipient_name}님 · 교재 ${count}권 · ${formatWon(o?.total_amount ?? 0)} (입금자 ${o?.depositor_name ?? values.depositor_name})` +
        (when ? ` · ${when} 학원에서 받아요` : ""),
      url: "/admin/textbook-orders",
    });
  });

  revalidatePath("/my/textbook");
  return when ? { ok: true, pickup: when } : { ok: true };
}

/** 입금 확인 전에만 본인이 취소한다 (DB 함수가 상태를 다시 본다) */
export async function cancelTextbookOrder(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) return;
  const supabase = await createClient();
  await supabase.rpc("cancel_textbook_order", { p_id: id });
  revalidatePath("/my/textbook");
}

/**
 * 받았어요(배송완료) — 학생이 누르면 그 주문이 내 내역에서 사라진다 (2026-10-02 Alan — "학생이 해당화면을 없애고 싶다면,
 * 배송완료 버튼을 누르면 사라지게"). 주문 기록은 남고 강사 · 조교 화면에는 "학생 수령 확인" 으로 보인다.
 * 내 주문 · 배송시작(shipped) 상태일 때만 — DB 함수(`receive_textbook_order`)가 auth.uid() 로 다시 본다.
 * (현장수령은 조교가 건네며 "수령완료" 를 누를 때 함께 찍혀 학생이 누를 일이 거의 없다 — 상태를 손으로 바꾼 경우만 이 버튼이 선다)
 */
export async function receiveTextbookOrder(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) return;
  const supabase = await createClient();
  await supabase.rpc("receive_textbook_order", { p_id: id });
  revalidatePath("/my/textbook");
}
