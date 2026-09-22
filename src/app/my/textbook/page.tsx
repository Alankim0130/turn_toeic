import { studentGate } from "@/components/student/StudentGate";
import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Reveal } from "@/components/ui/Reveal";
import { Icon } from "@/components/ui/Icon";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { itemsForLevels, TEXTBOOK_STATUS, type TextbookAccount, type TextbookItem, type TextbookSettings } from "@/lib/textbook";
import { cn, formatDate, formatWon, TRACK_LABEL } from "@/lib/utils";
import { collapseWeek5, studentTrackLabel, week5SectionIds } from "@/lib/week5";
import { getMyOrders, getMyTextbookOrders, getMyTextbookTerms, termLabel, type MyTextbookTerm } from "../_lib/queries";
import { TextbookForm, type OrderTerm } from "./TextbookForm";
import { cancelTextbookOrder } from "./actions";

export const metadata: Metadata = {
  title: "불라방 교재주문",
  robots: { index: false },
};

type PayTo = { account_id: number | null; bank_name: string | null; account_no: string | null; holder: string | null; label: string | null; amount: number };
type OrderedItem = { id: number; name: string; price: number };

/** "2026년 10월 · 650+ 왕기초반 주5일 10:00~12:10" — 주5일은 한 줄로 합친다 */
function termOrderLabel(t: MyTextbookTerm) {
  const week5 = week5SectionIds(t.sections);
  const rows = collapseWeek5(t.sections, (s) => s, week5);
  const classes = rows.map((s) => [s.course?.name ?? "강좌", studentTrackLabel(s, week5, TRACK_LABEL), s.time_block].filter(Boolean).join(" "));
  return `${termLabel(t.term)} · ${classes.join(" · ")}`;
}

export default async function TextbookPage() {
  // 불라방 수강생(예비등록생 포함)이 아니면 기능 대신 잠금 안내를 보여준다
  const locked = await studentGate("textbook");
  if (locked) return locked;

  const supabase = await createClient();
  const [{ profile }, orders, myOrders, { data: items }, { data: accounts }, { data: settings }] = await Promise.all([
    requireUser("/my/textbook"),
    getMyOrders(),
    getMyTextbookOrders(),
    supabase.from("textbook_items").select("id, name, level, price, account_id, note, active, sort_order").eq("active", true),
    supabase.from("textbook_accounts").select("id, bank_name, account_no, holder, label, active, sort_order").eq("active", true),
    supabase.from("textbook_settings").select("shipping_fee, default_account_id, notice").maybeSingle(),
  ]);

  const terms = await getMyTextbookTerms(orders);
  const orderedTerms = new Set(myOrders.filter((o) => o.status !== "cancelled" && o.term_id).map((o) => o.term_id));
  const formTerms: OrderTerm[] = terms.map((t) => ({
    id: t.termId,
    label: termOrderLabel(t),
    items: itemsForLevels((items ?? []) as TextbookItem[], t.levels),
    ordered: orderedTerms.has(t.termId),
  }));

  return (
    <div className="space-y-8">
      <PageHeader icon="textbook" title="불라방 교재주문" description="불라방 수강생은 교재를 집으로 받아볼 수 있어요. 교재를 고르고, 안내된 계좌로 입금한 뒤 주문하세요." />

      {formTerms.length === 0 ? (
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
            accounts={(accounts ?? []) as TextbookAccount[]}
            settings={(settings ?? null) as TextbookSettings | null}
            defaults={{ recipient_name: profile?.name ?? "", phone: profile?.phone ?? "" }}
          />
        </Reveal>
      )}

      <Reveal delay={100}>
        <section aria-labelledby="orders-title" className="card p-5 sm:p-6">
          <h2 id="orders-title" className="text-base font-black text-ink">내 교재주문 내역</h2>
          {myOrders.length === 0 ? (
            <p className="mt-3 text-sm text-slate">아직 주문한 교재가 없어요.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {myOrders.map((o) => {
                const st = TEXTBOOK_STATUS[o.status] ?? { label: o.status, hint: "" };
                const ordered = (Array.isArray(o.items) ? o.items : []) as OrderedItem[];
                const payTo = (Array.isArray(o.pay_to) ? o.pay_to : []) as PayTo[];
                return (
                  <li key={o.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-0.5 text-xs font-black",
                            o.status === "shipped"
                              ? "bg-brand-500 text-white"
                              : o.status === "cancelled"
                                ? "bg-line text-slate"
                                : o.status === "confirmed"
                                  ? "bg-ink text-white"
                                  : "bg-brand-100 text-brand-700",
                          )}
                        >
                          {st.label}
                        </span>
                        <span className="font-bold text-ink">{o.section ? `${termLabel(o.section.term)} · ${o.section.course?.name ?? "강좌"}` : "반 정보 없음"}</span>
                        {o.total_amount > 0 && <span className="font-black tabular-nums text-ink">{formatWon(o.total_amount)}</span>}
                      </div>
                      {ordered.length > 0 && <p className="mt-1 text-ink">{ordered.map((i) => i.name).join(" · ")}</p>}
                      {o.status === "requested" && payTo.length > 0 && (
                        <p className="mt-1 text-xs text-slate">
                          입금 안내: {payTo.map((p) => `${p.bank_name ?? ""} ${p.account_no ?? ""} (예금주 ${p.holder ?? ""}) ${formatWon(p.amount)}`).join(" · ")}
                          {o.depositor_name ? ` · 입금자 ${o.depositor_name}` : ""}
                        </p>
                      )}
                      <p className="mt-1 text-slate">
                        {o.recipient_name} · {o.address}
                        {o.address_detail ? ` ${o.address_detail}` : ""}
                      </p>
                      <p className="text-xs text-mist">
                        {formatDate(o.created_at, { year: "numeric", month: "long", day: "numeric" })} 주문
                        {o.tracking_no ? ` · 송장번호 ${o.tracking_no}` : st.hint ? ` · ${st.hint}` : ""}
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
