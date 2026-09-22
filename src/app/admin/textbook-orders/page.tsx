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
import { updateTextbookOrder } from "./actions";
import { isStaff, requireCrew } from "@/lib/auth";
import { TEXTBOOK_STATUS } from "@/lib/textbook";

export const metadata: Metadata = { title: "교재주문", robots: { index: false } };

const TABS = [
  { value: "requested", label: "입금 확인 전" },
  { value: "confirmed", label: "입금 확인" },
  { value: "shipped", label: "발송" },
  { value: "cancelled", label: "취소" },
  { value: "all", label: "전체" },
];

const STATUS_CLASS: Record<string, string> = {
  requested: "bg-amber-100 text-amber-800",
  confirmed: "bg-brand-100 text-brand-700",
  shipped: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-line text-slate",
};

type OrderedItem = { id: number; name: string; price: number };

export default async function TextbookOrdersPage({ searchParams }: { searchParams: Promise<{ status?: string; ok?: string; error?: string }> }) {
  // 조교에게도 열린 화면이다 (2026-09-16 Alan). 레이아웃이 조교를 통과시키므로 화면마다 가드를 둔다
  const { profile } = await requireCrew();
  const { status: statusParam, ok, error } = await searchParams;
  const status = TABS.some((t) => t.value === statusParam) ? (statusParam as string) : "requested";
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
        description="불라방 수강생의 교재 주문이에요. 입금자명을 통장과 대조해 '입금 확인'으로 바꾸고, 발송하면 송장번호를 남기면 학생 화면에도 보여요."
      />
      {isStaff(profile.role) && (
        <div className="mb-4 flex justify-end">
          <Link href="/admin/textbook-orders/setup" className="btn-secondary !py-2 text-sm">
            <Icon name="textbook" size={18} />
            교재·입금 계좌 설정
          </Link>
        </div>
      )}
      {ok && <Alert kind="success" className="mb-4">주문 #{ok} 상태를 저장했습니다.</Alert>}
      {error && <Alert kind="warning" className="mb-4">{error === "invalid" ? "잘못된 요청입니다." : "저장에 실패했습니다. 다시 시도해 주세요."}</Alert>}

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
                      {TEXTBOOK_STATUS[o.status]?.label ?? o.status}
                    </span>
                  </Td>
                  <Td>
                    <form action={updateTextbookOrder} className="flex min-w-[15rem] flex-col gap-1.5">
                      <input type="hidden" name="order_id" value={o.id} />
                      <input type="hidden" name="back" value={back} />
                      <select name="status" defaultValue={o.status} className="input !py-1.5 text-xs" aria-label="상태">
                        <option value="requested">입금 확인 전</option>
                        <option value="confirmed">입금 확인</option>
                        <option value="shipped">발송</option>
                        <option value="cancelled">취소</option>
                      </select>
                      <input name="tracking_no" defaultValue={o.tracking_no ?? ""} placeholder="송장번호 (발송 시)" className="input !py-1.5 text-xs" aria-label="송장번호" />
                      <button type="submit" className="btn-secondary !py-1.5 text-xs">저장</button>
                    </form>
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
