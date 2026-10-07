import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { cn, formatDate, formatWon, todayKST, TRACK_LABEL } from "@/lib/utils";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Alert } from "@/components/ui/Alert";
import { Icon } from "@/components/ui/Icon";
import { FilterTabs } from "@/components/admin/FilterTabs";
import { TableWrap, Th, Td } from "@/components/admin/Table";
import { termLabel } from "../_lib/queries";
import { getProfileNames } from "../_lib/profile-names";
import { confirmTextbookPayment, markTextbookPickedUp, markTextbookShipped, updateTextbookOrder } from "./actions";
import { isStaff, requireCrew } from "@/lib/auth";
import { isPickup, pickupLabel, TEXTBOOK_ADMIN_STATUS, textbookAdminStatus } from "@/lib/textbook";
import { isTextbookAccountMissing } from "@/lib/textbook-guide";

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
    .select("*, section:class_sections(track, time_block, course:courses(name), term:terms(year, month))")
    .order("created_at", { ascending: false })
    .limit(300);
  if (status !== "all") query = query.eq("status", status);

  const [{ data: rows }, { data: pickups }, accountMissing, ...countRes] = await Promise.all([
    query,
    // 현장수령 예정 (2026-10-07) — 아직 건네지 않은 것(금액확인 전 · 수령 대기)을 받으러 올 날짜 · 시각 순으로. 탭과 상관없이 맨 위에 선다
    supabase
      .from("textbook_orders")
      .select("id, recipient_name, status, pickup_date, pickup_time")
      .eq("delivery_method", "pickup")
      .in("status", ["requested", "confirmed"])
      .order("pickup_date", { ascending: true })
      .order("pickup_time", { ascending: true })
      .limit(50),
    // 입금 계좌가 없어 학생이 주문하지 못하는가 (2026-10-07) — 그동안은 주문이 안 들어와 이 화면이 빈 채로 조용했다
    isTextbookAccountMissing(supabase),
    ...["requested", "confirmed", "shipped", "cancelled"].map((s) => supabase.from("textbook_orders").select("id", { count: "exact", head: true }).eq("status", s)),
  ]);
  const today = todayKST();
  // 주문한 학생의 가입 이름 — 이름 · 등급만 주는 함수로 (조교는 profiles 를 못 읽는다, 2026-10-03 `profile-names.ts`).
  // 배송에 쓰는 받는 사람 · 연락처 · 주소는 주문에 따로 적혀 있다 (Alan — 교재 배송은 번호가 필요하다)
  const names = await getProfileNames(supabase, (rows ?? []).map((o) => o.user_id));
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
        description="불라방 수강생의 교재 주문이에요. 강사님이 입금자명을 통장과 대조해 '금액확인'을 누르면 조교 화면의 배송 대기로 넘어가고, 보낸 뒤 '배송완료'를 누르면 학생 화면에 배송시작으로 보여요. 현장수령 주문은 학생이 고른 날짜 · 시각에 학원에서 건네고 '수령완료'를 눌러요."
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
            ? `주문 #${ok} 금액확인했어요 — 조교 화면의 배송 대기로 넘어갔고, 학생 화면에는 배송확인(현장수령이면 입금확인)으로 보여요.`
            : did === "shipped"
              ? `주문 #${ok} 배송완료 — 학생 화면에 배송시작으로 보여요.`
              : did === "picked"
                ? `주문 #${ok} 수령완료 — 학원에서 건넸어요. 학생 주문 내역에서는 사라져요.`
                : `주문 #${ok} 상태를 저장했습니다.`}
        </Alert>
      )}
      {error && <Alert kind="warning" className="mb-4">{ERROR_TEXT[error] ?? "저장에 실패했습니다. 다시 시도해 주세요."}</Alert>}
      {accountMissing && (
        <Alert kind="warning" title="입금 계좌가 없어 불라방 학생이 교재를 주문하지 못해요" className="mb-4">
          학생 주문 화면에 &lsquo;입금 계좌가 아직 등록되지 않았어요&rsquo; 가 떠요.{" "}
          {staff ? (
            <>
              <Link href="/admin/textbook-orders/setup#accounts" className="font-bold text-brand-700 underline decoration-brand-200 underline-offset-2 hover:decoration-brand-500">
                교재·입금 계좌 설정
              </Link>
              에서 은행 · 계좌번호 · 예금주를 넣어 주세요.
            </>
          ) : (
            "강사님께 교재·입금 계좌 설정에서 계좌를 넣어 달라고 부탁해 주세요."
          )}
        </Alert>
      )}

      {/* 현장수령 예정 (2026-10-07 Alan — "무슨날짜에 올껀지, 몇시쯤 올껀지") — 탭을 넘기지 않아도 누가 언제 오는지 보이게 */}
      {(pickups ?? []).length > 0 && (
        <section aria-labelledby="pickup-title" className="card mb-4 p-4 sm:p-5">
          <h2 id="pickup-title" className="flex items-center gap-2 font-black text-ink">
            <Icon name="calendar" size={22} />
            현장수령 예정 <span className="rounded-full bg-brand-500 px-2 py-0.5 text-xs font-black text-white">{(pickups ?? []).length}</span>
          </h2>
          <p className="mt-1 text-xs text-slate">학생이 학원에 와서 받아 가는 주문이에요 (배송비 없음). 받으러 올 날짜 · 시각 순이고, 건네면 그 주문의 수령완료를 눌러 주세요.</p>
          <ul className="mt-3 divide-y divide-line">
            {(pickups ?? []).map((o) => {
              const day = o.pickup_date ?? "";
              const tag = day === today ? "오늘" : day && day < today ? "지남" : null;
              return (
                <li key={o.id}>
                  <Link href={`/admin/textbook-orders?status=${o.status}#order-${o.id}`} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2 text-sm hover:bg-brand-50/40">
                    {tag && (
                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-black", tag === "오늘" ? "bg-brand-500 text-white" : "bg-amber-100 text-amber-800")}>{tag}</span>
                    )}
                    <span className="font-bold text-ink">{o.pickup_date && o.pickup_time ? pickupLabel(o.pickup_date, o.pickup_time) : "날짜 없음"}</span>
                    <span className="text-slate">· {o.recipient_name}</span>
                    <span className={cn("ml-auto whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold", STATUS_CLASS[o.status] ?? "bg-line text-slate")}>
                      {textbookAdminStatus(o.status, true)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

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
              const pickup = isPickup(o);
              return (
                <tr key={o.id} id={`order-${o.id}`} className="scroll-mt-24 align-top hover:bg-brand-50/40 target:bg-brand-50">
                  <Td className="whitespace-nowrap text-xs">{formatDate(o.created_at, { year: "2-digit", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</Td>
                  <Td className="whitespace-nowrap font-bold">{names.get(o.user_id)?.name ?? "-"}</Td>
                  {/* 칸이 좁아지면 반 이름이 한 글자씩 세로로 쪼개져서 최소 너비를 둔다 (표는 넘치면 옆으로 민다) */}
                  <Td className="min-w-[9rem] text-xs">
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
                    {pickup ? (
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
                  </Td>
                  <Td>
                    <span className={cn("whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold", STATUS_CLASS[o.status] ?? "bg-line text-slate")}>
                      {textbookAdminStatus(o.status, pickup)}
                    </span>
                    {/* 학생이 받았다고 누르면(배송완료) 학생 내역에서는 사라지고 여기에 남는다 (2026-10-02). 현장수령은 건넬 때 찍힌다 */}
                    {o.status === "shipped" && (
                      <p className="mt-1 whitespace-nowrap text-xs text-slate">
                        {o.received_at
                          ? `${pickup ? "학원에서 받아 감" : "학생 수령 확인"} · ${formatDate(o.received_at, { month: "numeric", day: "numeric" })}`
                          : "학생 수령 확인 전"}
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
                      {o.status === "confirmed" && pickup && (
                        <form action={markTextbookPickedUp} className="flex flex-col gap-1.5">
                          <input type="hidden" name="order_id" value={o.id} />
                          <input type="hidden" name="back" value={back} />
                          <button type="submit" className="btn-primary w-full !py-1.5 text-xs">수령완료</button>
                          <p className="text-mist">학원에서 건넨 뒤 눌러 주세요 — 학생 주문 내역에서 사라져요.</p>
                        </form>
                      )}
                      {o.status === "confirmed" && !pickup && (
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
                              <option key={v} value={v}>{textbookAdminStatus(v, pickup)}</option>
                            ))}
                          </select>
                          <input name="tracking_no" defaultValue={o.tracking_no ?? ""} maxLength={60} placeholder="송장번호" className="input !py-1.5 text-xs" aria-label="송장번호" />
                          <button type="submit" className="btn-secondary !py-1.5 text-xs">저장</button>
                          {!staff && (
                            <p className="text-mist">
                              금액확인 전 주문을 {textbookAdminStatus("confirmed", pickup)} · {textbookAdminStatus("shipped", pickup)}로 넘기는 것은 강사·관리자만 할 수 있어요 (금액확인).
                            </p>
                          )}
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
