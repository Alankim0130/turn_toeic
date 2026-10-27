import { loadGated } from "@/components/student/StudentGate";
import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Alert } from "@/components/ui/Alert";
import { Reveal } from "@/components/ui/Reveal";
import { Icon } from "@/components/ui/Icon";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isPickup, orderHint, PICKUP_PLACE, pickupDaysFrom, pickupLabel, textbookStatus } from "@/lib/textbook";
import { formatDate, formatWon } from "@/lib/utils";
import { getMyOrders, getMyTextbookOrders, termLabel } from "../_lib/queries";
import { TextbookForm } from "./TextbookForm";
import { cancelTextbookOrder, receiveTextbookOrder } from "./actions";
import { catalogOf, orderTermsOf, textbookCatalogQueries } from "./_lib/order-terms";
import { OrderSteps } from "@/components/my/OrderSteps";

export const metadata: Metadata = {
  title: "불라방 교재주문",
  robots: { index: false },
};

type PayTo = { account_id: number | null; bank_name: string | null; account_no: string | null; holder: string | null; label: string | null; amount: number };
type OrderedItem = { id: number; name: string; price: number };

export default async function TextbookPage() {
  // 불라방 수강생(예비등록생 포함)이 아니면 기능 대신 잠금 안내를 보여준다 — 잠금 판정과 데이터를 함께 받는다 (loadGated)
  const supabase = await createClient();
  const g = await loadGated("textbook", () =>
    Promise.all([
      requireUser("/my/textbook"),
      getMyOrders(),
      getMyTextbookOrders(),
      // 교재 · 입금 계좌 · 배송비 — 서버 액션도 같은 조회로 주문할 교재를 다시 정한다
      textbookCatalogQueries(supabase),
      // 학원에서 받을 수 있는 날 — 오늘부터 60일 안의 수업일과 그 날 트랙 (2026-10-26 Alan, 반 편성 달력대로)
      supabase.rpc("textbook_pickup_days"),
    ]),
  );
  if (g.locked) return g.locked;
  const [{ profile }, orders, myOrders, catalogRows, pickupDayRows] = g.data;

  // 학생이 받았다고 누른(배송완료) 주문은 내역에서 뺀다 — 지난 주문에서 받은 교재(ownedItemIds)는 그대로 센다
  const visibleOrders = myOrders.filter((o) => !o.received_at);
  // 현장수령 날짜는 수업이 있는 날 중에서 고른다 — 못 읽으면(배포 사이 · 잠깐의 오류) null: 화면이 현장수령을 잠그고 서버 액션도 받지 않는다
  const pickupDays = pickupDayRows.error ? null : pickupDaysFrom(pickupDayRows.data ?? []);
  // 주문할 교재 — 내 반 교재 그대로, 고르는 칸이 없다 (2026-10-27 Alan — "이제는 자동시스템이니 선택할 수 없게, 본인 레벨에 맞는 교재만 딱 보이도록").
  // 교재 목록을 못 읽었으면 "등록하지 않았어요" 로 잘못 말하지 않고 다시 열라고 한다
  const catalog = catalogOf(catalogRows);
  const formTerms = catalog ? await orderTermsOf(supabase, orders, myOrders, catalog) : [];

  return (
    <div className="space-y-8">
      <PageHeader
        icon="textbook"
        title="불라방 교재주문"
        description={`불라방 수강생은 교재를 택배로 받거나 ${PICKUP_PLACE}에 와서 직접 받을 수 있어요(현장수령 — 배송비 없음). 내 반에 맞춘 교재를 확인하고, 안내된 계좌로 입금한 뒤 주문하세요.`}
      />

      {!catalog ? (
        <Alert kind="warning" title="교재 목록을 불러오지 못했어요">
          잠시 뒤 이 화면을 다시 열어 주세요. 계속 안 되면 강사님께 문의해 주세요.
        </Alert>
      ) : formTerms.length === 0 ? (
        <EmptyState
          icon="textbook"
          title="불라방 수강생만 주문할 수 있어요"
          description="현장 수강생은 개강일에 강의실에서 교재를 받습니다. 불라방으로 등업되면 개강 전에도 여기서 주문할 수 있어요."
          action={{ href: "/my", label: "내 등록 현황 보기" }}
        />
      ) : (
        <Reveal className="card p-5 sm:p-7">
          <h2 className="mb-4 text-base font-black text-ink">교재 주문</h2>
          <TextbookForm
            terms={formTerms}
            accounts={catalog.accounts}
            settings={catalog.settings}
            defaults={{ recipient_name: profile?.name ?? "", phone: profile?.phone ?? "" }}
            pickupDays={pickupDays}
          />
        </Reveal>
      )}

      <Reveal delay={100}>
        <section aria-labelledby="orders-title" className="card p-5 sm:p-6">
          <h2 id="orders-title" className="text-base font-black text-ink">내 교재주문 내역</h2>
          {visibleOrders.length === 0 ? (
            <p className="mt-3 text-sm text-slate">
              {myOrders.length === 0 ? "아직 주문한 교재가 없어요." : "주문한 교재를 모두 받았어요. 받은 주문은 내역에서 사라져요."}
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {visibleOrders.map((o) => {
                const pickup = isPickup(o);
                const st = textbookStatus(o.status, pickup);
                const hint = orderHint(o);
                const ordered = (Array.isArray(o.items) ? o.items : []) as OrderedItem[];
                const payTo = (Array.isArray(o.pay_to) ? o.pay_to : []) as PayTo[];
                return (
                  <li key={o.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        {o.status === "cancelled" && <span className="rounded-full bg-line px-2.5 py-0.5 text-xs font-black text-slate">{st.label}</span>}
                        <span className="font-bold text-ink">{o.section ? `${termLabel(o.section.term)} · ${o.section.course?.name ?? "강좌"}` : "반 정보 없음"}</span>
                        {o.total_amount > 0 && <span className="font-black tabular-nums text-ink">{formatWon(o.total_amount)}</span>}
                      </div>
                      {/* 주문완료 → 배송확인(강사 금액확인) → 배송시작(조교 배송완료) — 2026-10-02 Alan. 현장수령은 입금확인 → 수령완료 */}
                      <OrderSteps status={o.status} pickup={pickup} />
                      {o.status !== "cancelled" && hint && <p className="mt-2 text-xs font-bold text-brand-700">{hint}</p>}
                      {ordered.length > 0 && <p className="mt-2 text-ink">{ordered.map((i) => i.name).join(" · ")}</p>}
                      {o.status === "requested" && payTo.length > 0 && (
                        <p className="mt-1 text-xs text-slate">
                          입금 안내: {payTo.map((p) => `${p.bank_name ?? ""} ${p.account_no ?? ""} (예금주 ${p.holder ?? ""}) ${formatWon(p.amount)}`).join(" · ")}
                          {o.depositor_name ? ` · 입금자 ${o.depositor_name}` : ""}
                        </p>
                      )}
                      {pickup ? (
                        // 현장수령 (2026-10-07) — 주소 대신 받으러 올 날짜 · 시각
                        <p className="mt-1 text-slate">
                          <span className="mr-1.5 inline-block rounded-full bg-brand-50 px-2 py-0.5 align-middle text-xs font-black text-brand-700">현장수령</span>
                          {o.pickup_date && o.pickup_time ? `${pickupLabel(o.pickup_date, o.pickup_time)} ${PICKUP_PLACE}에서` : `${PICKUP_PLACE}에서`} · {o.recipient_name}
                        </p>
                      ) : (
                        <p className="mt-1 text-slate">
                          {o.recipient_name} · {o.address}
                          {o.address_detail ? ` ${o.address_detail}` : ""}
                        </p>
                      )}
                      <p className="text-xs text-mist">
                        {formatDate(o.created_at, { year: "numeric", month: "long", day: "numeric" })} 주문
                        {o.tracking_no ? ` · 송장번호 ${o.tracking_no}` : ""}
                      </p>
                    </div>
                    {o.status === "requested" && (
                      <form action={cancelTextbookOrder}>
                        <input type="hidden" name="id" value={o.id} />
                        <button type="submit" className="btn-ghost !px-3 !py-2 text-xs">
                          <Icon name="warning" size={16} />
                          주문 취소
                        </button>
                      </form>
                    )}
                    {/* 받았으면 학생이 누른다 — 이 주문이 내역에서 사라진다 (기록은 남고 선생님 화면에는 '학생 수령 확인').
                        현장수령은 조교가 건네며 수령완료를 누를 때 함께 사라져 보통은 이 버튼이 서지 않는다 */}
                    {o.status === "shipped" && (
                      <form action={receiveTextbookOrder} className="shrink-0">
                        <input type="hidden" name="id" value={o.id} />
                        <button type="submit" className="btn-primary w-full !px-4 !py-2 text-sm sm:w-auto">{pickup ? "확인" : "배송완료"}</button>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </Reveal>
    </div>
  );
}
