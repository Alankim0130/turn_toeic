import { TableWrap, Th, Td } from "@/components/admin/Table";
import type { UsedTracking } from "@/lib/tracking-label";
import { formatDate } from "@/lib/utils";
import { OrderCard } from "./OrderCard";
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

/** 주문 한 건과 화면이 미리 만든 글자 — 가입 이름 · 반 */
export type OrderEntry = {
  order: AdminOrder;
  /** 주문한 학생의 가입 이름 (`getProfileNames` — 조교는 profiles 를 못 읽는다) */
  student: string;
  /** 주문의 반 전부 (`orderClassLines`) — 반을 다 읽지 못했으면 null */
  classLines: OrderClassLine[] | null;
  /** 그때 쓰는 대표 반 두 줄 */
  classFallback: [string, string];
};

/**
 * 교재주문 목록 — **휴대폰 · 태블릿(lg 미만)은 카드(`OrderCard`), PC 는 표** (2026-10-27 Alan — "Pc에서는 저렇게 보여도 괜찮은데,
 * 모바일에서는 쫌 불편해 … 학생의 교재주문신청을 간략하게 보여주고, 그 학생을 클릭하면 상세정보가 나오도록!").
 * 화면이 기기를 모르니 둘 다 그리고 폭으로 하나를 숨긴다 (학생명단 반별 명단과 같다). 처리는 둘 다 `OrderActions` 한 조각이다.
 * PC 표는 그 전 모양 그대로다 — 여덟 칸이라 넘치면 옆으로 민다.
 */
export function OrderList({
  orders,
  staff,
  back,
  used,
  openId,
}: {
  orders: OrderEntry[];
  staff: boolean;
  back: string;
  used: readonly UsedTracking[];
  /** 휴대폰 카드를 열어 둔 채 보여 줄 주문 — 현장수령 예정에서 눌러 왔을 때 (`?open=`) */
  openId: number | null;
}) {
  return (
    <>
      <ul className="space-y-2 lg:hidden" aria-label="교재 주문">
        {orders.map((e) => (
          <OrderCard
            key={e.order.id}
            o={e.order}
            student={e.student}
            classLines={e.classLines}
            classFallback={e.classFallback}
            staff={staff}
            back={back}
            used={used}
            open={e.order.id === openId}
          />
        ))}
      </ul>
      <TableWrap className="hidden lg:block">
        <thead>
          <tr>
            <Th>주문일</Th>
            <Th>수강생</Th>
            <Th>반</Th>
            <Th>교재 · 금액</Th>
            <Th>수령인 / 연락처</Th>
            <Th>주소</Th>
            <Th>상태</Th>
            <Th>처리</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {orders.map(({ order: o, student, classLines, classFallback }) => {
            const received = orderReceivedText(o);
            return (
              <tr key={o.id} id={`order-${o.id}`} className="scroll-mt-24 align-top hover:bg-brand-50/40 target:bg-brand-50">
                <Td className="whitespace-nowrap text-xs">{formatDate(o.created_at, { year: "2-digit", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</Td>
                <Td className="whitespace-nowrap font-bold">{student}</Td>
                {/* 칸이 좁아지면 반 이름이 한 글자씩 세로로 쪼개져서 최소 너비를 둔다 (표는 넘치면 옆으로 민다).
                    주문의 반 전부를 학생명단 카드처럼 — 주5일은 한 줄, 단과면 RC단과 · LC단과 (2026-10-27) */}
                <Td className="min-w-[10rem] text-xs">
                  <OrderClassList lines={classLines} fallback={classFallback} />
                </Td>
                <Td className="min-w-[12rem] text-xs">
                  <OrderItemsSummary o={o} />
                </Td>
                <Td className="whitespace-nowrap text-xs">
                  {o.recipient_name}
                  <br />
                  <a href={`tel:${o.phone}`} className="text-brand-600 hover:underline">{o.phone}</a>
                </Td>
                <Td className="min-w-[14rem] text-xs">
                  <OrderDelivery o={o} />
                </Td>
                <Td>
                  <OrderStatusBadge o={o} />
                  {/* 학생이 받았다고 누르면(배송완료) 학생 내역에서는 사라지고 여기에 남는다 (2026-10-02). 현장수령은 건넬 때 찍힌다 */}
                  {received && <p className="mt-1 whitespace-nowrap text-xs text-slate">{received}</p>}
                </Td>
                <Td>
                  {/* 할 일 한 단계 — 강사·관리자는 금액확인, 조교는 배송완료 (2026-10-02 Alan). 휴대폰 카드와 같은 조각이다 */}
                  <OrderActions o={o} staff={staff} back={back} used={used} className="min-w-[15rem]" />
                </Td>
              </tr>
            );
          })}
        </tbody>
      </TableWrap>
    </>
  );
}
