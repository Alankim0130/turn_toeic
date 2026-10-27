import { isPickup } from "@/lib/textbook";
import { monthDay, orderDeliveryText, orderMoneyText } from "@/lib/textbook-order-card";
import type { UsedTracking } from "@/lib/tracking-label";
import { formatDate } from "@/lib/utils";
import {
  OrderActions,
  OrderClassList,
  OrderDelivery,
  OrderItemsSummary,
  orderReceivedText,
  OrderStatusBadge,
  type AdminOrder,
  type OrderClassLine,
} from "./OrderParts";

/**
 * 교재주문 한 건 — **휴대폰 · 태블릿(lg 미만)의 카드** (2026-10-27 Alan — "지금 배송페이지를 보면 화면을 오른쪽으로 많이 넘겨야지 보여.
 * Pc에서는 저렇게 보여도 괜찮은데, 모바일에서는 쫌 불편해. 한화면에서 직관적으로 처리하는게 안될까? 예를들면 학생의 교재주문신청을 간략하게 보여주고,
 * 그 학생을 클릭하면 상세정보가 나오도록!"). 그전에는 여덟 칸짜리 표라 휴대폰에서 처리 버튼까지 옆으로 한참 밀어야 했다.
 *
 * - **닫힌 채로 선다** — 이름 · 상태 / 교재 몇 권 · 합계 · 입금자 / 송장 · 받으러 올 날 · 주소 (`textbook-order-card.ts`) · 오른쪽에 주문한 날.
 *   누르면 그 카드만 열린다 — `<details>` 라 자바스크립트 없이 열리고 이 카드는 서버 컴포넌트다 (수업자료실 자료 카드와 같다)
 * - **열면 그 자리에서 처리한다** — 반 · 교재 · 받는 분 · 연락처 · 주소를 보고, 아래에서 금액확인 · QR 찍기 + 배송완료 · 수령완료 · 상태 직접 바꾸기.
 *   처리 조각은 표와 같은 `OrderActions` 다 (한 일에 길이 둘이면 갈라진다). 버튼 · 칸은 크고 글자 16px — 아이폰이 칸을 누를 때 확대하지 않는다
 * - **팝업으로 띄우지 않는다** — 그 안의 QR 찍기가 카메라 창(팝업)을 여는데, 팝업 위에 팝업을 겹치지 않는다 (닫기 · 뒤 화면 잠금이 엉킨다)
 * - PC(lg 이상)는 예전 표 그대로다. 화면이 기기를 모르니 둘 다 그리고 폭으로 하나를 숨긴다 (학생명단 반별 명단과 같다) —
 *   그래서 카드의 주소는 `order-m-{id}` 다 (표의 줄이 `order-{id}`). 현장수령 예정에서 누르면 `?open=` 으로 그 카드가 열린 채 온다
 */
export function OrderCard({
  o,
  student,
  classLines,
  classFallback,
  staff,
  back,
  used,
  open = false,
}: {
  o: AdminOrder;
  /** 주문한 학생의 가입 이름 */
  student: string;
  classLines: OrderClassLine[] | null;
  classFallback: [string, string];
  staff: boolean;
  back: string;
  used: readonly UsedTracking[];
  /** 처음부터 열어 둔다 — 현장수령 예정에서 이 주문을 눌러 왔을 때 */
  open?: boolean;
}) {
  const pickup = isPickup(o);
  const received = orderReceivedText(o);
  return (
    <li id={`order-m-${o.id}`} className="card scroll-mt-24 overflow-hidden target:ring-2 target:ring-brand-300">
      <details className="group/order" open={open || undefined}>
        {/* 닫힌 카드 전체가 여닫는 곳 — 오른쪽 꺾쇠가 열렸는지 말해 준다. 키보드로 왔을 때의 테두리는 카드 안쪽에 그린다 (카드가 둥근 모서리를 자른다) */}
        <summary className="flex cursor-pointer list-none items-center gap-2 p-3.5 transition hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-300 [&::-webkit-details-marker]:hidden">
          <span className="min-w-0 flex-1">
            {/* 주문한 날은 첫 줄 오른쪽 끝 — 둘째 · 셋째 줄이 카드 폭을 다 쓰게 (320px 에서 입금자 이름이 잘리지 않게) */}
            <span className="flex items-center gap-1.5">
              <b className="min-w-0 truncate text-[15px] font-black text-ink">{student}</b>
              <OrderStatusBadge o={o} className="shrink-0 px-2 py-0.5 text-[11px]" />
              <span className="ml-auto shrink-0 pl-1 text-xs font-bold tabular-nums text-mist" title="주문한 날">
                {monthDay(o.created_at)}
              </span>
            </span>
            <span className="mt-1 block truncate text-xs text-slate">
              {orderMoneyText(o)} ·{" "}
              {o.depositor_name ? `입금자 ${o.depositor_name}` : <b className="font-bold text-red-700">입금자 미입력</b>}
            </span>
            <span className="mt-0.5 block truncate text-xs font-semibold text-ink">{orderDeliveryText(o)}</span>
          </span>
          <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full bg-paper text-slate ring-1 ring-line transition group-open/order:rotate-180">
            <svg viewBox="0 0 24 24" className="size-4 fill-none stroke-current stroke-[2.5]">
              <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </summary>

        <div className="space-y-4 border-t border-line px-3.5 pb-4 pt-3">
          <dl className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-x-3 gap-y-2.5 text-xs leading-relaxed">
            <dt className="font-bold text-mist">반</dt>
            <dd className="min-w-0 text-ink">
              <OrderClassList lines={classLines} fallback={classFallback} />
            </dd>
            <dt className="font-bold text-mist">교재</dt>
            <dd className="min-w-0 text-ink">
              <OrderItemsSummary o={o} />
            </dd>
            <dt className="font-bold text-mist">받는 분</dt>
            <dd className="min-w-0 text-ink">
              {o.recipient_name} ·{" "}
              {/* 누르면 전화가 걸린다 — 검은 글자 + 연분홍 밑줄 (명단의 전화번호와 같은 규칙) */}
              <a href={`tel:${o.phone}`} className="whitespace-nowrap font-semibold underline decoration-brand-200 underline-offset-2 hover:decoration-brand-500">
                {o.phone}
              </a>
            </dd>
            <dt className="font-bold text-mist">{pickup ? "받는 날" : "주소"}</dt>
            <dd className="min-w-0 text-ink [overflow-wrap:anywhere]">
              <OrderDelivery o={o} />
            </dd>
            <dt className="font-bold text-mist">주문일</dt>
            <dd className="min-w-0 text-ink">{formatDate(o.created_at, { month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" })}</dd>
            {received && (
              <>
                <dt className="font-bold text-mist">수령</dt>
                <dd className="min-w-0 text-ink">{received}</dd>
              </>
            )}
          </dl>

          <OrderActions o={o} staff={staff} back={back} used={used} size="md" />
        </div>
      </details>
    </li>
  );
}
