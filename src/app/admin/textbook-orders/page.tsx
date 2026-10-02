import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { cn, formatDate, formatWon, TRACK_LABEL } from "@/lib/utils";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Alert } from "@/components/ui/Alert";
import { Icon } from "@/components/ui/Icon";
import { FilterTabs } from "@/components/admin/FilterTabs";
import { TableWrap, Th, Td } from "@/components/admin/Table";
import { termLabel } from "../_lib/queries";
import { confirmTextbookPayment, markTextbookShipped, updateTextbookOrder } from "./actions";
import { isStaff, requireCrew } from "@/lib/auth";
import { TEXTBOOK_ADMIN_STATUS } from "@/lib/textbook";

export const metadata: Metadata = { title: "교재주문", robots: { index: false } };

// 배송 단계 (2026-10-02 Alan): 강사가 금액확인 → 조교가 배송완료. 이름은 하는 일 — 학생 화면은 같은 상태를 배송확인 · 배송시작으로 부른다
const TABS = [
  { value: "requested", label: TEXTBOOK_ADMIN_STATUS.requested },
  { value: "confirmed", label: TEXTBOOK_ADMIN_STATUS.confirmed },
  { value: "shipped", label: TEXTBOOK_ADMIN_STATUS.shipped },
  { value: "cancelled", label: TEXTBOOK_ADMIN_STATUS.cancelled },
  { value: "all", label: "전체" },
];

const ERROR_TEXT: Record<string, string> = {
  invalid: "잘못된 요청입니다.",
  stale: "이미 처리됐거나 학생이 취소한 주문이에요. 목록을 다시 확인해 주세요.",
  staff: "금액확인은 강사·관리자만 할 수 있어요 — 교재비가 강사님 통장으로 들어와요.",
};

const STATUS_CLASS: Record<string, string> = {
  requested: "bg-amber-100 text-amber-800",
  confirmed: "bg-brand-100 text-brand-700",
  shipped: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-line text-slate",
};

type OrderedItem = { id: number; name: string; price: number };

export default async function TextbookOrdersPage({ searchParams }: { searchParams: Promise<{ status?: string; ok?: string; did?: string; error?: string }> }) {
  // 조교에게도 열린 화면이다 (2026-09-16 Alan). 레이아웃이 조교를 통과시키므로 화면마다 가드를 둔다
  const { profile } = await requireCrew();
  const staff = isStaff(profile.role);
  const { status: statusParam, ok, did, error } = await searchParams;
  // 처음 열면 할 일부터 — 강사·관리자는 금액확인 전, 조교는 배송 대기
  const status = TABS.some((t) => t.value === statusParam) ? (statusParam as string) : staff ? "requested" : "confirmed";
  const supabase = await createClient();

  let query = supabase
    .from("textbook_orders")
    .select("*, user:profiles(name, phone), section:class_sections(track, time_block, course:courses(name), term:terms(year, month))")
    .order("created_at", { ascending: false })
    .limit(300);
  if (status !== "all") query = query.eq("status", status);

  const [{ data: rows }, ...countRes] = await Promise.all([
    query,
    ...["requested", "confirmed", "shipped", "cancelled"].map((s) => supabase.from("textbook_orders").select("id", { count: "exact", head: true }).eq("status", s)),
  ]);
  const counts: Record<string, number | undefined> = {
    requested: countRes[0].count ?? 0,
    confirmed: countRes[1].count ?? 0,
    shipped: countRes[2].count ?? 0,
    cancelled: countRes[3].count ?? 0,
  };
  const back = `/admin/textbook-orders?status=${status}`;

  return (
    <>
      <PageHeader
        icon="orders"
        title="교재주문"
        description="불라방 수강생의 교재 주문이에요. 강사님이 입금자명을 통장과 대조해 '금액확인'을 누르면 조교 화면의 배송 대기로 넘어가고, 보낸 뒤 '배송완료'를 누르면 학생 화면에 배송시작으로 보여요."
      />
      {staff && (
        <div className="mb-4 flex justify-end">
          <Link href="/admin/textbook-orders/setup" className="btn-secondary !py-2 text-sm">
            <Icon name="textbook" size={18} />
            교재·입금 계좌 설정
          </Link>
        </div>
      )}
      {ok && (
        <Alert kind="success" className="mb-4">
          {did === "confirmed"
            ? `주문 #${ok} 금액확인했어요 — 조교 화면의 배송 대기로 넘어갔고, 학생 화면에는 배송확인으로 보여요.`
            : did === "shipped"
              ? `주문 #${ok} 배송완료 — 학생 화면에 배송시작으로 보여요.`
              : `주문 #${ok} 상태를 저장했습니다.`}
        </Alert>
      )}
      {error && <Alert kind="warning" className="mb-4">{ERROR_TEXT[error] ?? "저장에 실패했습니다. 다시 시도해 주세요."}</Alert>}

      <FilterTabs basePath="/admin/textbook-orders" paramKey="status" current={status} tabs={TABS.map((t) => ({ ...t, count: counts[t.value] }))} />

      {(rows ?? []).length === 0 ? (
        <EmptyState icon="orders" title="해당 상태의 교재 주문이 없습니다" />
      ) : (
        <TableWrap>
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
            {(rows ?? []).map((o) => {
              const ordered = (Array.isArray(o.items) ? o.items : []) as OrderedItem[];
              return (
                <tr key={o.id} className="align-top hover:bg-brand-50/40">
                  <Td className="whitespace-nowrap text-xs">{formatDate(o.created_at, { year: "2-digit", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</Td>
                  <Td className="whitespace-nowrap font-bold">{o.user?.name ?? "-"}</Td>
                  <Td className="text-xs">
                    {termLabel(o.section?.term, true)} · {o.section?.course?.name ?? "강좌"}
                    <br />
                    {o.section?.track ? TRACK_LABEL[o.section.track] : ""} {o.section?.time_block ?? ""}
                  </Td>
                  <Td className="min-w-[12rem] text-xs">
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
                  </Td>
                  <Td className="whitespace-nowrap text-xs">
                    {o.recipient_name}
                    <br />
                    <a href={`tel:${o.phone}`} className="text-brand-600 hover:underline">{o.phone}</a>
                  </Td>
                  <Td className="min-w-[14rem] text-xs">
                    {o.postal_code && <span className="text-mist">[{o.postal_code}] </span>}
                    {o.address} {o.address_detail}
                    {o.memo && <p className="mt-1 text-mist">메모: {o.memo}</p>}
                    {o.tracking_no && <p className="mt-1 font-bold text-ink">송장 {o.tracking_no}</p>}
                  </Td>
                  <Td>
                    <span className={cn("whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold", STATUS_CLASS[o.status] ?? "bg-line text-slate")}>
                      {TEXTBOOK_ADMIN_STATUS[o.status] ?? o.status}
                    </span>
                    {/* 학생이 받았다고 누르면(배송완료) 학생 내역에서는 사라지고 여기에 남는다 (2026-10-02) */}
                    {o.status === "shipped" && (
                      <p className="mt-1 whitespace-nowrap text-xs text-slate">
                        {o.received_at ? `학생 수령 확인 · ${formatDate(o.received_at, { month: "numeric", day: "numeric" })}` : "학생 수령 확인 전"}
                      </p>
                    )}
                  </Td>
                  <Td>
                    <div className="flex min-w-[15rem] flex-col gap-2">
                      {/* 할 일 한 단계 — 강사·관리자는 금액확인, 조교는 배송완료 (2026-10-02 Alan) */}
                      {o.status === "requested" &&
                        (staff ? (
                          <form action={confirmTextbookPayment}>
                            <input type="hidden" name="order_id" value={o.id} />
                            <input type="hidden" name="back" value={back} />
                            <button type="submit" className="btn-primary w-full !py-1.5 text-xs">금액확인</button>
                          </form>
                        ) : (
                          <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">강사님 금액확인을 기다려요</p>
                        ))}
                      {o.status === "confirmed" && (
                        <form action={markTextbookShipped} className="flex flex-col gap-1.5">
                          <input type="hidden" name="order_id" value={o.id} />
                          <input type="hidden" name="back" value={back} />
                          <input name="tracking_no" defaultValue={o.tracking_no ?? ""} maxLength={60} placeholder="송장번호 (선택)" className="input !py-1.5 text-xs" aria-label="송장번호" />
                          <button type="submit" className="btn-primary w-full !py-1.5 text-xs">배송완료</button>
                        </form>
                      )}
                      {/* 잘못 누른 것 되돌리기 · 취소 · 송장 고치기 — 평소에는 접어 둔다 */}
                      <details className="text-xs">
                        <summary className="cursor-pointer font-bold text-slate">상태 직접 바꾸기</summary>
                        <form action={updateTextbookOrder} className="mt-1.5 flex flex-col gap-1.5">
                          <input type="hidden" name="order_id" value={o.id} />
                          <input type="hidden" name="back" value={back} />
                          <select name="status" defaultValue={o.status} className="input !py-1.5 text-xs" aria-label="상태">
                            {(["requested", "confirmed", "shipped", "cancelled"] as const).map((v) => (
                              <option key={v} value={v}>{TEXTBOOK_ADMIN_STATUS[v]}</option>
                            ))}
                          </select>
                          <input name="tracking_no" defaultValue={o.tracking_no ?? ""} maxLength={60} placeholder="송장번호" className="input !py-1.5 text-xs" aria-label="송장번호" />
                          <button type="submit" className="btn-secondary !py-1.5 text-xs">저장</button>
                          {!staff && <p className="text-mist">금액확인 전 주문을 배송 대기 · 배송완료로 넘기는 것은 강사·관리자만 할 수 있어요 (금액확인).</p>}
                        </form>
                      </details>
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </TableWrap>
      )}
    </>
  );
}
