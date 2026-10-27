import { confirmTextbookPayment, markTextbookPickedUp, markTextbookShipped, updateTextbookOrder } from "@/app/admin/textbook-orders/actions";
import type { Database } from "@/lib/supabase/database.types";
import { isPickup, pickupLabel, textbookAdminStatus } from "@/lib/textbook";
import type { UsedTracking } from "@/lib/tracking-label";
import { cn, formatDate, formatWon } from "@/lib/utils";
import { TrackingNoField } from "./TrackingNoField";

/**
 * 교재주문 한 건의 조각들 — **PC 표(`/admin/textbook-orders` 의 칸)와 휴대폰 카드(`OrderCard`)가 같이 쓴다** (2026-10-27).
 * 처리(금액확인 · 배송완료 · 수령완료 · 상태 직접 바꾸기)가 두 군데로 갈라지지 않게 한곳에 둔다. 서버 컴포넌트다 — 폼은 서버 액션으로 보낸다.
 */

export type AdminOrder = Database["public"]["Tables"]["textbook_orders"]["Row"];
export type OrderedItem = { id: number; name: string; price: number };
/** 반 한 줄 — 학생명단 카드와 같은 이름 (`orderClassLines` — 주5일은 한 줄, 단과면 RC단과 · LC단과) */
export type OrderClassLine = { key: string; label: string; single: string | null };

export const ORDER_STATUS_CLASS: Record<string, string> = {
  requested: "bg-amber-100 text-amber-800",
  confirmed: "bg-brand-100 text-brand-700",
  shipped: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-line text-slate",
};

export const orderedItems = (o: Pick<AdminOrder, "items">) => (Array.isArray(o.items) ? o.items : []) as OrderedItem[];

/** 반 — 주문할 때 적어 둔 그 달 불라방 반 전부. 반을 다 읽지 못했으면(`lines` 없음) 대표 반 두 줄(`fallback`) */
export function OrderClassList({ lines, fallback }: { lines: OrderClassLine[] | null; fallback: [string, string] }) {
  if (!lines) {
    return (
      <>
        {fallback[0]}
        <br />
        {fallback[1]}
      </>
    );
  }
  return (
    <ul className="space-y-0.5">
      {lines.map((line) => (
        <li key={line.key}>
          {line.single && <span className="mr-1 whitespace-nowrap rounded bg-ink px-1 text-white">{line.single}</span>}
          {line.label}
        </li>
      ))}
    </ul>
  );
}

/** 교재 · 배송비 · 합계 · 입금자 */
export function OrderItemsSummary({ o }: { o: AdminOrder }) {
  const ordered = orderedItems(o);
  return (
    <>
      {ordered.length > 0 ? (
        <ul className="space-y-0.5">
          {ordered.map((i) => (
            <li key={i.id}>
              {i.name} <span className="text-mist">{formatWon(i.price)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <span className="text-mist">{o.quantity}권 (예전 주문)</span>
      )}
      {o.shipping_fee > 0 && <p className="text-mist">배송비 {formatWon(o.shipping_fee)}</p>}
      {o.total_amount > 0 && <p className="mt-1 font-black text-ink">합계 {formatWon(o.total_amount)}</p>}
      <p className={cn("mt-1 inline-block rounded-full px-2 py-0.5 font-bold", o.depositor_name ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-700")}>
        {o.depositor_name ? `입금자 ${o.depositor_name}` : "입금자 미입력"}
      </p>
    </>
  );
}

/** 주소 (현장수령이면 받으러 올 날짜 · 시각) · 메모 · 송장 */
export function OrderDelivery({ o }: { o: AdminOrder }) {
  return (
    <>
      {isPickup(o) ? (
        // 현장수령 (2026-10-07) — 주소 대신 받으러 올 날짜 · 시각
        <p>
          <span className="mr-1.5 inline-block rounded-full bg-brand-500 px-2 py-0.5 font-black text-white">현장수령</span>
          <span className="font-bold text-ink">{o.pickup_date && o.pickup_time ? pickupLabel(o.pickup_date, o.pickup_time) : "날짜 없음"}</span>
        </p>
      ) : (
        <>
          {o.postal_code && <span className="text-mist">[{o.postal_code}] </span>}
          {o.address} {o.address_detail}
        </>
      )}
      {o.memo && <p className="mt-1 text-mist">메모: {o.memo}</p>}
      {o.tracking_no && <p className="mt-1 font-bold text-ink">송장 {o.tracking_no}</p>}
    </>
  );
}

/** 학생이 받았는지 — 배송완료 주문만. 학생이 받았다고 누르면(배송완료) 학생 내역에서는 사라지고 여기에 남는다 (2026-10-02). 현장수령은 건넬 때 찍힌다 */
export function orderReceivedText(o: AdminOrder): string | null {
  if (o.status !== "shipped") return null;
  if (!o.received_at) return "학생 수령 확인 전";
  return `${isPickup(o) ? "학원에서 받아 감" : "학생 수령 확인"} · ${formatDate(o.received_at, { month: "numeric", day: "numeric" })}`;
}

/** 상태 이름표 — 현장수령이면 수령 대기 · 수령완료 */
export function OrderStatusBadge({ o, className }: { o: AdminOrder; className?: string }) {
  return (
    <span className={cn("whitespace-nowrap rounded-full font-bold", ORDER_STATUS_CLASS[o.status] ?? "bg-line text-slate", className ?? "px-2.5 py-0.5 text-xs")}>
      {textbookAdminStatus(o.status, isPickup(o))}
    </span>
  );
}

/**
 * 처리 — 할 일 한 단계(강사 · 관리자는 금액확인, 조교는 배송완료 · 수령완료, 2026-10-02 Alan) + 접어 둔 '상태 직접 바꾸기'.
 * `size="md"` 는 휴대폰 카드 — 버튼 · 칸이 크고 글자 16px 라 아이폰이 칸을 누를 때 확대하지 않는다. 표는 예전 그대로 작다(`sm`)
 */
export function OrderActions({
  o,
  staff,
  back,
  used,
  size = "sm",
  className,
}: {
  o: AdminOrder;
  staff: boolean;
  back: string;
  used: readonly UsedTracking[];
  size?: "sm" | "md";
  className?: string;
}) {
  const pickup = isPickup(o);
  const md = size === "md";
  const button = md ? "w-full !py-2.5" : "w-full !py-1.5 text-xs";
  const hint = md ? "text-xs text-mist" : "text-mist";
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {o.status === "requested" &&
        (staff ? (
          <form action={confirmTextbookPayment}>
            <input type="hidden" name="order_id" value={o.id} />
            <input type="hidden" name="back" value={back} />
            <button type="submit" className={cn("btn-primary", button)}>금액확인</button>
          </form>
        ) : (
          <p className={cn("rounded-xl bg-amber-50 px-3 py-2 font-bold text-amber-800", md ? "text-sm" : "text-xs")}>강사님 금액확인을 기다려요</p>
        ))}
      {o.status === "confirmed" && pickup && (
        <form action={markTextbookPickedUp} className="flex flex-col gap-1.5">
          <input type="hidden" name="order_id" value={o.id} />
          <input type="hidden" name="back" value={back} />
          <button type="submit" className={cn("btn-primary", button)}>수령완료</button>
          <p className={hint}>학원에서 건넨 뒤 눌러 주세요 — 학생 주문 내역에서 사라져요.</p>
        </form>
      )}
      {o.status === "confirmed" && !pickup && (
        <form action={markTextbookShipped} className="flex flex-col gap-1.5">
          <input type="hidden" name="order_id" value={o.id} />
          <input type="hidden" name="back" value={back} />
          {/* QR 찍기 — 카메라에 접수증 QR 을 비추면 운송장번호가 들어간다 (2026-10-27 Alan "하나씩 기입하려니 너무 많아서" → "카메라를 틀어서 qr이 인식이되면") */}
          <TrackingNoField
            key={o.tracking_no ?? ""}
            orderId={o.id}
            defaultValue={o.tracking_no ?? ""}
            placeholder="송장번호 (선택)"
            recipient={o.recipient_name}
            used={used}
            size={size}
          />
          <button type="submit" className={cn("btn-primary", button)}>배송완료</button>
        </form>
      )}
      {/* 잘못 누른 것 되돌리기 · 취소 · 송장 고치기 — 평소에는 접어 둔다 */}
      <details className={md ? "text-sm" : "text-xs"}>
        <summary className={cn("cursor-pointer font-bold text-slate", md && "py-1")}>상태 직접 바꾸기</summary>
        <form action={updateTextbookOrder} className="mt-1.5 flex flex-col gap-1.5">
          <input type="hidden" name="order_id" value={o.id} />
          <input type="hidden" name="back" value={back} />
          <select name="status" defaultValue={o.status} className={cn("input", md ? "!py-2.5" : "!py-1.5 text-xs")} aria-label="상태">
            {(["requested", "confirmed", "shipped", "cancelled"] as const).map((v) => (
              <option key={v} value={v}>{textbookAdminStatus(v, pickup)}</option>
            ))}
          </select>
          <TrackingNoField
            key={o.tracking_no ?? ""}
            orderId={o.id}
            defaultValue={o.tracking_no ?? ""}
            placeholder="송장번호"
            recipient={o.recipient_name}
            used={used}
            photo={!pickup}
            size={size}
          />
          <button type="submit" className={cn("btn-secondary", md ? "!py-2.5" : "!py-1.5 text-xs")}>저장</button>
          {!staff && (
            <p className={hint}>
              금액확인 전 주문을 {textbookAdminStatus("confirmed", pickup)} · {textbookAdminStatus("shipped", pickup)}로 넘기는 것은 강사·관리자만 할 수 있어요 (금액확인).
            </p>
          )}
        </form>
      </details>
    </div>
  );
}
