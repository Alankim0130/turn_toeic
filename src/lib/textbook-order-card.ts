/**
 * 교재주문 화면의 **휴대폰 카드** — 닫힌 카드에 서는 두 줄 (2026-10-27 Alan — "지금 배송페이지를 보면 화면을 오른쪽으로 많이 넘겨야지 보여.
 * Pc에서는 저렇게 보여도 괜찮은데, 모바일에서는 쫌 불편해. 한화면에서 직관적으로 처리하는게 안될까? 예를들면 학생의 교재주문신청을 간략하게 보여주고,
 * 그 학생을 클릭하면 상세정보가 나오도록!"). 그리는 일은 `src/components/admin/textbook-orders/OrderCard.tsx`, 글자는 서버가 만든다.
 *
 * 닫힌 카드 = 이름 · 상태 / **교재 몇 권 · 합계 · 입금자** / **받는 방법 쪽에서 지금 볼 것** (송장 · 받으러 올 날 · 받은 확인 · 주소).
 * 강사님은 둘째 줄로 통장과 대조하고(금액확인 전), 조교는 셋째 줄로 어느 주문인지 본다 — 나머지는 카드를 열어 본다.
 */
import { formatWon } from "@/lib/utils";
import { isPickup, pickupLabel } from "@/lib/textbook";

export type OrderCardInput = {
  status: string;
  delivery_method?: string | null;
  items: unknown;
  quantity: number;
  total_amount: number;
  pickup_date: string | null;
  pickup_time: string | null;
  address: string | null;
  address_detail: string | null;
  tracking_no: string | null;
  received_at: string | null;
};

/** 시각 → 한국 날짜 "10/27". 읽을 수 없으면 빈 글자 */
export function monthDay(iso: string | null | undefined): string {
  if (!iso) return "";
  const day = new Date(iso);
  if (Number.isNaN(day.getTime())) return "";
  const [, m, d] = day.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }).split("-").map(Number);
  return m && d ? `${m}/${d}` : "";
}

/** 교재 몇 권 — 주문에 적힌 교재 줄. 교재 목록이 생기기 전의 예전 주문은 권수만 있다 */
export function orderBookCount(o: Pick<OrderCardInput, "items" | "quantity">): number {
  return Array.isArray(o.items) && o.items.length > 0 ? o.items.length : o.quantity;
}

/** 둘째 줄 앞부분 — "교재 2권 · 24,500원" (입금자는 따로 — 없으면 빨갛게 그린다) */
export function orderMoneyText(o: Pick<OrderCardInput, "items" | "quantity" | "total_amount">): string {
  const books = `교재 ${orderBookCount(o)}권`;
  return o.total_amount > 0 ? `${books} · ${formatWon(o.total_amount)}` : books;
}

/**
 * 셋째 줄 — 받는 방법 쪽에서 지금 볼 것.
 * - 택배: 송장번호가 있으면 `송장 …`(배송완료면 학생이 받았는지까지), 없으면 `택배 · 주소` (보낸 뒤면 받은 확인)
 * - 현장수령: `현장수령 · 받으러 올 날짜 · 시각`, 건넸으면 `현장수령 · 10/29 학원에서 받아 감`
 */
export function orderDeliveryText(o: OrderCardInput): string {
  if (isPickup(o)) {
    if (o.status === "shipped") return o.received_at ? `현장수령 · ${monthDay(o.received_at)} 학원에서 받아 감` : "현장수령 · 건넴";
    return `현장수령 · ${o.pickup_date && o.pickup_time ? pickupLabel(o.pickup_date, o.pickup_time) : "받으러 올 날짜 없음"}`;
  }
  const received = o.received_at ? `학생 수령 확인 ${monthDay(o.received_at)}` : "학생 수령 확인 전";
  const tracking = o.tracking_no?.trim();
  if (tracking) return o.status === "shipped" ? `송장 ${tracking} · ${received}` : `송장 ${tracking}`;
  if (o.status === "shipped") return `택배 · ${received}`;
  const address = [o.address, o.address_detail].filter((v) => v?.trim()).join(" ");
  return `택배 · ${address || "주소 없음"}`;
}
