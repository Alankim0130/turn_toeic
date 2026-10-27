import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { PICKUP_PLACE, pickupLabel, textbookAdminStatus } from "@/lib/textbook";
import { cn } from "@/lib/utils";
import { ORDER_STATUS_CLASS } from "./OrderParts";

export type PickupEntry = { id: number; recipient_name: string; status: string; pickup_date: string | null; pickup_time: string | null };

/**
 * 현장수령 예정 (2026-10-07 Alan — "무슨날짜에 올껀지, 몇시쯤 올껀지") — 탭을 넘기지 않아도 누가 언제 오는지 보이게.
 * 아직 건네지 않은 것(금액확인 전 · 수령 대기)을 받으러 올 날짜 · 시각 순으로. 누르면 그 주문으로 간다 —
 * **휴대폰은 그 주문의 카드를 열어서(`?open=` · `#order-m-…`), PC 는 표의 그 줄로(`#order-…`)** (2026-10-27 — 카드와 줄은 둘 다 그려져 있고 주소가 다르다).
 * 링크를 둘 두고 화면 폭으로 하나만 보인다.
 */
export function PickupSchedule({ pickups, today }: { pickups: readonly PickupEntry[]; today: string }) {
  return (
    <section aria-labelledby="pickup-title" className="card mb-4 p-4 sm:p-5">
      <h2 id="pickup-title" className="flex items-center gap-2 font-black text-ink">
        <Icon name="calendar" size={22} />
        현장수령 예정 <span className="rounded-full bg-brand-500 px-2 py-0.5 text-xs font-black text-white">{pickups.length}</span>
      </h2>
      <p className="mt-1 text-xs text-slate">학생이 {PICKUP_PLACE}로 받으러 오는 주문이에요 (배송비 없음). 받으러 올 날짜 · 시각 순이고, 건네면 그 주문의 수령완료를 눌러 주세요.</p>
      <ul className="mt-3 divide-y divide-line">
        {pickups.map((o) => {
          const day = o.pickup_date ?? "";
          const tag = day === today ? "오늘" : day && day < today ? "지남" : null;
          const body = (
            <>
              {tag && <span className={cn("rounded-full px-2 py-0.5 text-xs font-black", tag === "오늘" ? "bg-brand-500 text-white" : "bg-amber-100 text-amber-800")}>{tag}</span>}
              <span className="font-bold text-ink">{o.pickup_date && o.pickup_time ? pickupLabel(o.pickup_date, o.pickup_time) : "날짜 없음"}</span>
              <span className="text-slate">· {o.recipient_name}</span>
              <span className={cn("ml-auto whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold", ORDER_STATUS_CLASS[o.status] ?? "bg-line text-slate")}>
                {textbookAdminStatus(o.status, true)}
              </span>
            </>
          );
          const row = "flex-wrap items-center gap-x-2 gap-y-1 py-2 text-sm hover:bg-brand-50/40";
          return (
            <li key={o.id}>
              <Link href={`/admin/textbook-orders?status=${o.status}&open=${o.id}#order-m-${o.id}`} className={cn("flex lg:hidden", row)}>
                {body}
              </Link>
              <Link href={`/admin/textbook-orders?status=${o.status}#order-${o.id}`} className={cn("hidden lg:flex", row)}>
                {body}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
