import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { formatDate, TRACK_LABEL } from "@/lib/utils";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Alert } from "@/components/ui/Alert";
import { FilterTabs } from "@/components/admin/FilterTabs";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { TableWrap, Th, Td } from "@/components/admin/Table";
import { termLabel } from "../_lib/queries";
import { updateTextbookOrder } from "./actions";
import { requireCrew } from "@/lib/auth";

export const metadata: Metadata = { title: "교재주문", robots: { index: false } };

const TABS = [
  { value: "requested", label: "신청" },
  { value: "confirmed", label: "확인" },
  { value: "shipped", label: "발송" },
  { value: "cancelled", label: "취소" },
  { value: "all", label: "전체" },
];

export default async function TextbookOrdersPage({ searchParams }: { searchParams: Promise<{ status?: string; ok?: string; error?: string }> }) {
  // 조교는 이 화면을 쓸 수 없다 — 레이아웃이 조교를 통과시키므로 화면마다 막는다
  await requireCrew();
  const { status: statusParam, ok, error } = await searchParams;
  const status = TABS.some((t) => t.value === statusParam) ? (statusParam as string) : "requested";
  const supabase = await createClient();

  let query = supabase
    .from("textbook_orders")
    .select("*, user:profiles(name, phone), section:class_sections(track, start_time, course:courses(name), term:terms(year, month))")
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
      <PageHeader icon="orders" title="교재주문" description="불라방 수강생의 교재 배송 신청입니다. 발송 후 송장번호를 남기면 학생 화면에도 표시됩니다." />
      {ok && <Alert kind="success" className="mb-4">주문 #{ok} 상태를 저장했습니다.</Alert>}
      {error && <Alert kind="warning" className="mb-4">{error === "invalid" ? "잘못된 요청입니다." : "저장에 실패했습니다. 다시 시도해 주세요."}</Alert>}

      <FilterTabs basePath="/admin/textbook-orders" paramKey="status" current={status} tabs={TABS.map((t) => ({ ...t, count: counts[t.value] }))} />

      {(rows ?? []).length === 0 ? (
        <EmptyState icon="orders" title="해당 상태의 교재 신청이 없습니다" />
      ) : (
        <TableWrap>
          <thead>
            <tr>
              <Th>신청일</Th>
              <Th>수강생</Th>
              <Th>반</Th>
              <Th>수령인 / 연락처</Th>
              <Th>주소</Th>
              <Th>수량</Th>
              <Th>상태</Th>
              <Th>처리</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {(rows ?? []).map((o) => (
              <tr key={o.id} className="align-top hover:bg-brand-50/40">
                <Td className="whitespace-nowrap text-xs">{formatDate(o.created_at, { year: "2-digit", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</Td>
                <Td className="whitespace-nowrap font-bold">{o.user?.name ?? "-"}</Td>
                <Td className="text-xs">
                  {termLabel(o.section?.term, true)} · {o.section?.course?.name ?? "강좌"}
                  <br />
                  {o.section?.track ? TRACK_LABEL[o.section.track] : ""} {o.section?.start_time ? o.section.start_time.slice(0, 5) : ""}
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
                <Td className="whitespace-nowrap">{o.quantity}권</Td>
                <Td><StatusBadge status={o.status} /></Td>
                <Td>
                  <form action={updateTextbookOrder} className="flex min-w-[15rem] flex-col gap-1.5">
                    <input type="hidden" name="order_id" value={o.id} />
                    <input type="hidden" name="back" value={back} />
                    <select name="status" defaultValue={o.status} className="input !py-1.5 text-xs" aria-label="상태">
                      <option value="requested">신청</option>
                      <option value="confirmed">확인</option>
                      <option value="shipped">발송</option>
                      <option value="cancelled">취소</option>
                    </select>
                    <input name="tracking_no" defaultValue={o.tracking_no ?? ""} placeholder="송장번호 (발송 시)" className="input !py-1.5 text-xs" aria-label="송장번호" />
                    <button type="submit" className="btn-secondary !py-1.5 text-xs">저장</button>
                  </form>
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
    </>
  );
}
