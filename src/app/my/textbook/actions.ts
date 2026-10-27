"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { notifyStaff } from "@/lib/push";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pickupDaysFrom, pickupLabel, pickupTimeError, pickupTimesFor, sameOrderItems, textbookOrderError } from "@/lib/textbook";
import { formatWon } from "@/lib/utils";
import { getMyOrders, getMyTextbookOrders } from "../_lib/queries";
import { catalogOf, orderTermsOf, textbookCatalogQueries } from "./_lib/order-terms";

/** `pickup` — 현장수령 주문이면 받으러 올 날짜 · 시각 한 줄 (접수 안내에 그대로 쓴다) */
export type TextbookState = { ok?: boolean; pickup?: string; error?: string; values?: Record<string, string> };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 불라방 교재 주문 (2026-09-21). **품목·금액·입금 계좌는 DB 함수가 정한다** (`public.create_textbook_order`) —
 * 화면이 보낸 것은 고른 교재 번호와 배송지(또는 받으러 올 날짜 · 시각)·입금자명뿐이고, 함수가 자격(그 달 불라방 배정)·레벨·중복을 다시 본다.
 *
 * 받는 방법(2026-10-07): 택배면 예전 그대로 아홉 칸만 보낸다. **현장수령일 때만** p_delivery · p_pickup_date · p_pickup_time 을 더한다 —
 * 배포 사이에 DB 함수가 아직 예전 모양이어도 택배 주문은 그대로 들어간다 (새 칸은 함수에 기본값이 있다).
 *
 * 배송지는 주소 + 상세 주소 둘 다 받는다 (2026-10-07 Alan — "우편번호 필요없고 본인 주소만 기입하게 해줘. 그리고 상세주소는 선택이 아니라 필수로
 * 들어가야해. 그래야지 배송을 할 수 있지" · "요청사항도 없애줘"). 우편번호 · 요청사항 칸은 화면에서 없앴고 함수에는 빈 값을 보낸다 (함수 인자는 그대로).
 * **상세 주소를 반드시 받는 것은 여기서 본다** — DB 함수는 예전처럼 비워도 받는다 (현장수령 시각 범위와 같은 규칙. 주문 함수는 금액 · 자격을 지키는 곳이라 건드리지 않았다).
 *
 * 현장수령 날 · 시각 (2026-10-26 Alan — "월수금은 9:30-15:00 & 18-21시 … 화목금은 9:30-15:00 까지 만" · 날은 "반 편성 달력대로" →
 * 2026-10-27 "3시와 9시는 없애줘" — 퇴근 시각이라 마지막 칸은 2시 30분 · 8시 30분):
 * 고른 날이 **수업이 있는 날**이어야 하고 시각은 **그 날 트랙의 목록 안**이어야 한다 — 화면과 같은 DB 함수(`textbook_pickup_days`)를 로그인한 사람의
 * 세션으로 다시 부른다. 그 함수를 못 부르면(배포 사이 · 잠깐의 오류) 현장수령 주문을 받지 않는다 — 택배 주문은 그대로 들어간다.
 *
 * **교재는 내 반 교재 그대로** (2026-10-27 Alan — "이제는 자동시스템이니 선택할 수 없게, 본인 레벨에 맞는 교재만 딱 보이도록"):
 * 주문 화면과 같은 계산(`orderTermsOf` — 내 불라방 반이 듣는 시간의 과목 × 과정, 지난 주문에서 받은 것은 빼고)을 로그인한 사람의 세션으로 다시 하고,
 * 화면이 보낸 교재가 그것과 똑같을 때만 주문한다. 다르면(그 사이 강사가 교재를 바꿨다 · 지난 주문을 취소했다) 화면을 새로 그려 바뀐 교재를 보여 준다.
 * 내 반 교재를 정하지 못한 달(방학달 통짜 반 등 — `locked` false)만 학생이 고른 교재를 그대로 보낸다 (레벨은 DB 함수가 본다).
 * **DB 함수는 건드리지 않았다** — 주소를 바로 부르면 내 레벨의 다른 교재도 주문되지만, 그 값은 학생이 내고 강사가 통장과 대조한다 (금액 · 자격은 함수가 지킨다).
 */
export async function submitTextbookOrder(_prev: TextbookState, formData: FormData): Promise<TextbookState> {
  const v = (k: string) => String(formData.get(k) ?? "").trim();
  const values = {
    term_id: v("term_id"),
    recipient_name: v("recipient_name"),
    phone: v("phone"),
    address: v("address"),
    address_detail: v("address_detail"),
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
  if (pickup && !values.pickup_time) return { error: textbookOrderError("pickup_time"), values };
  if (!pickup && !values.address) return { error: textbookOrderError("address"), values };
  if (!pickup && !values.address_detail) return { error: textbookOrderError("address_detail"), values };
  if (!values.depositor_name) return { error: textbookOrderError("depositor"), values };

  const supabase = await createClient();
  const [orders, myOrders, catalogRows, pickupDayRows] = await Promise.all([
    getMyOrders(),
    getMyTextbookOrders(),
    textbookCatalogQueries(supabase),
    // 수업이 있는 날인지 · 그 날 고를 수 있는 시각인지 (반 편성 달력 — 화면과 같은 함수)
    pickup ? supabase.rpc("textbook_pickup_days") : null,
  ]);

  // 주문할 교재 — 화면과 같은 계산으로 다시 정한다 (2026-10-27 — 고르는 칸이 없다)
  const catalog = catalogOf(catalogRows);
  if (!catalog) return { error: textbookOrderError(undefined), values };
  const plan = (await orderTermsOf(supabase, orders, myOrders, catalog)).find((t) => t.id === termId);
  if (!plan) return { error: textbookOrderError("not_eligible"), values };
  if (plan.locked && plan.items.length === 0) return { error: textbookOrderError("nothing_to_order"), values };
  if (plan.locked && !sameOrderItems(itemIds, plan.items)) {
    // 화면을 새로 그려 바뀐 교재를 보여 준다 (서버 액션이 경로를 비우면 열린 화면이 새 목록을 받는다)
    revalidatePath("/my/textbook");
    return { error: textbookOrderError("items_changed"), values };
  }

  if (pickupDayRows) {
    if (pickupDayRows.error) return { error: textbookOrderError("pickup_days_error"), values };
    const day = pickupDaysFrom(pickupDayRows.data ?? []).find((d) => d.date === values.pickup_date);
    if (!day) return { error: textbookOrderError("pickup_no_class"), values };
    if (!pickupTimesFor(day.track).includes(values.pickup_time)) return { error: pickupTimeError(day), values };
  }
  const { data: orderId, error } = await supabase.rpc("create_textbook_order", {
    p_term_id: termId,
    // 내 반 교재로 정해진 달은 서버가 정한 그 교재 (화면이 보낸 것과 같다는 것을 위에서 봤다)
    p_item_ids: plan.locked ? plan.items.map((i) => i.id) : itemIds,
    p_recipient: values.recipient_name,
    p_phone: values.phone,
    p_postal_code: "",
    p_address: pickup ? "" : values.address,
    p_address_detail: pickup ? "" : values.address_detail,
    p_memo: "",
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
