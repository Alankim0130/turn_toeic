import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Icon } from "@/components/ui/Icon";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { defaultAccount, type TextbookAccount, type TextbookSettings } from "@/lib/textbook";
import { cn, formatWon } from "@/lib/utils";
import {
  deleteTextbookAccount,
  deleteTextbookItem,
  saveTextbookAccount,
  saveTextbookItem,
  saveTextbookSettings,
  toggleTextbookAccount,
  toggleTextbookItem,
} from "./actions";

export const metadata: Metadata = { title: "교재·입금 계좌 설정", robots: { index: false } };

const OK_TEXT: Record<string, string> = { accounts: "입금 계좌를 저장했어요.", items: "교재를 저장했어요.", settings: "배송비·안내를 저장했어요." };

/**
 * 교재·입금 계좌 설정 (2026-09-21 Alan — "교재비를 받는 계좌번호와 교재 과목 등록은 강사가 직접").
 * 여기서 등록한 교재가 불라방 학생의 주문 화면에 레벨별로 나오고, 계좌와 금액이 입금 안내로 뜬다.
 * 이미 들어온 주문에는 그때의 교재·금액·계좌가 박혀 있어 여기서 바꿔도 지난 주문은 그대로다.
 */
export default async function TextbookSetupPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  // 강사·관리자만 — 조교는 주문 처리만 한다
  await requireStaff();
  const { ok, error } = await searchParams;
  const supabase = await createClient();
  const [{ data: accounts }, { data: items }, { data: settings }, { data: levels }] = await Promise.all([
    supabase.from("textbook_accounts").select("*").order("sort_order").order("id"),
    supabase.from("textbook_items").select("*").order("level", { ascending: true, nullsFirst: true }).order("sort_order").order("id"),
    supabase.from("textbook_settings").select("shipping_fee, default_account_id, notice").maybeSingle(),
    supabase.from("lc_levels").select("level").order("sort_order").order("level"),
  ]);
  const accs = (accounts ?? []) as TextbookAccount[];
  const active = accs.filter((a) => a.active);
  const fallback = defaultAccount(accs, (settings ?? null) as TextbookSettings | null);
  const accountName = (a: TextbookAccount) => `${a.label ? `${a.label} · ` : ""}${a.bank_name} ${a.account_no} (${a.holder})`;

  return (
    <>
      <PageHeader
        icon="textbook"
        title="교재·입금 계좌 설정"
        description="불라방 학생이 주문 화면에서 보는 교재와 입금 계좌예요. 바꾸면 바로 학생 화면에 반영되고, 이미 들어온 주문은 그대로예요."
      />
      <div className="mb-4">
        <Link href="/admin/textbook-orders" className="text-sm font-bold text-brand-600 hover:underline">
          ← 교재주문 목록
        </Link>
      </div>
      {ok && <Alert kind="success" className="mb-4">{OK_TEXT[ok] ?? "저장했어요."}</Alert>}
      {error && <Alert kind="warning" className="mb-4">{error === "save" ? "저장하지 못했어요. 다시 시도해 주세요." : error}</Alert>}

      <div className="space-y-6">
        {/* ─── 입금 계좌 ─── */}
        <section id="accounts" aria-labelledby="accounts-title" className="card scroll-mt-24 p-5">
          <h2 id="accounts-title" className="flex items-center gap-2 text-lg font-black text-ink">
            <Icon name="orders" size={26} />입금 계좌
          </h2>
          <p className="mt-1 text-sm text-slate">학생은 주문할 때 여기 계좌로 입금하고 입금자명을 적어요. 계좌가 하나면 모든 교재와 배송비가 그 계좌로 가요.</p>

          {accs.length > 0 && (
            <ul className="mt-4 space-y-3">
              {accs.map((a) => (
                <li key={a.id} className={cn("rounded-xl border p-3", a.active ? "border-line" : "border-dashed border-line bg-surface/60")}>
                  <form action={saveTextbookAccount} className="grid gap-2 sm:grid-cols-[1fr_1.4fr_1fr_1.2fr_4.5rem_auto]">
                    <input type="hidden" name="id" value={a.id} />
                    <input name="bank_name" defaultValue={a.bank_name} required maxLength={30} className="input !py-2 text-sm" aria-label="은행" />
                    <input name="account_no" defaultValue={a.account_no} required maxLength={40} className="input !py-2 text-sm" aria-label="계좌번호" />
                    <input name="holder" defaultValue={a.holder} required maxLength={30} className="input !py-2 text-sm" aria-label="예금주" />
                    <input name="label" defaultValue={a.label ?? ""} maxLength={40} className="input !py-2 text-sm" placeholder="이름표 (선택)" aria-label="이름표" />
                    <input name="sort_order" defaultValue={a.sort_order} inputMode="numeric" className="input !py-2 text-sm" aria-label="순서" />
                    <button type="submit" className="btn-secondary !py-2 text-xs">저장</button>
                  </form>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    {!a.active && <span className="rounded-full bg-line px-2 py-0.5 font-bold text-slate">쓰지 않음</span>}
                    {fallback?.id === a.id && <span className="rounded-full bg-brand-100 px-2 py-0.5 font-bold text-brand-700">기본 계좌</span>}
                    <form action={toggleTextbookAccount}>
                      <input type="hidden" name="id" value={a.id} />
                      <input type="hidden" name="active" value={a.active ? "false" : "true"} />
                      <button type="submit" className="btn-ghost !px-2.5 !py-1 text-xs">{a.active ? "쓰지 않기" : "다시 쓰기"}</button>
                    </form>
                    <form action={deleteTextbookAccount}>
                      <input type="hidden" name="id" value={a.id} />
                      <button type="submit" className="btn-ghost !px-2.5 !py-1 text-xs text-red-700">지우기</button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <form action={saveTextbookAccount} className="mt-4 grid gap-2 rounded-xl bg-brand-50/50 p-3 sm:grid-cols-[1fr_1.4fr_1fr_1.2fr_4.5rem_auto]">
            <input name="bank_name" required maxLength={30} className="input !py-2 text-sm" placeholder="은행 (예: 신한)" aria-label="새 계좌 은행" />
            <input name="account_no" required maxLength={40} className="input !py-2 text-sm" placeholder="계좌번호" aria-label="새 계좌번호" />
            <input name="holder" required maxLength={30} className="input !py-2 text-sm" placeholder="예금주" aria-label="새 계좌 예금주" />
            <input name="label" maxLength={40} className="input !py-2 text-sm" placeholder="이름표 (선택, 예: LC 교재비)" aria-label="새 계좌 이름표" />
            <input name="sort_order" defaultValue={accs.length} inputMode="numeric" className="input !py-2 text-sm" aria-label="새 계좌 순서" />
            <button type="submit" className="btn-primary !py-2 text-xs">계좌 더하기</button>
          </form>
        </section>

        {/* ─── 교재 ─── */}
        <section id="items" aria-labelledby="items-title" className="card scroll-mt-24 p-5">
          <h2 id="items-title" className="flex items-center gap-2 text-lg font-black text-ink">
            <Icon name="textbook" size={26} />교재
          </h2>
          <p className="mt-1 text-sm text-slate">
            학생은 자기 레벨 교재와 &ldquo;모든 레벨&rdquo; 교재만 봐요. 속성반은 두 레벨 교재가 다 보여요. 계좌를 안 고른 교재는 기본 계좌로 가요.
          </p>

          {(items ?? []).length > 0 && (
            <ul className="mt-4 space-y-3">
              {(items ?? []).map((i) => (
                <li key={i.id} className={cn("rounded-xl border p-3", i.active ? "border-line" : "border-dashed border-line bg-surface/60")}>
                  <form action={saveTextbookItem} className="grid gap-2 sm:grid-cols-[1.6fr_7rem_7rem_1.6fr_4.5rem_auto]">
                    <input type="hidden" name="id" value={i.id} />
                    <input name="name" defaultValue={i.name} required maxLength={60} className="input !py-2 text-sm" aria-label="교재 이름" />
                    <select name="level" defaultValue={i.level ?? ""} className="input !py-2 text-sm" aria-label="레벨">
                      <option value="">모든 레벨</option>
                      {(levels ?? []).map((l) => (
                        <option key={l.level} value={l.level}>{l.level}</option>
                      ))}
                    </select>
                    <input name="price" defaultValue={i.price} required inputMode="numeric" className="input !py-2 text-sm" aria-label="가격 (원)" />
                    <select name="account_id" defaultValue={i.account_id ?? ""} className="input !py-2 text-sm" aria-label="입금 계좌">
                      <option value="">기본 계좌</option>
                      {active.map((a) => (
                        <option key={a.id} value={a.id}>{accountName(a)}</option>
                      ))}
                    </select>
                    <input name="sort_order" defaultValue={i.sort_order} inputMode="numeric" className="input !py-2 text-sm" aria-label="순서" />
                    <button type="submit" className="btn-secondary !py-2 text-xs">저장</button>
                    <input name="note" defaultValue={i.note ?? ""} maxLength={200} className="input !py-2 text-sm sm:col-span-6" placeholder="설명 (선택, 예: 월수금반은 B, 화목금반은 A)" aria-label="설명" />
                  </form>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-bold text-ink">{i.level ?? "모든 레벨"} · {formatWon(i.price)}</span>
                    {!i.active && <span className="rounded-full bg-line px-2 py-0.5 font-bold text-slate">학생에게 안 보임</span>}
                    <form action={toggleTextbookItem}>
                      <input type="hidden" name="id" value={i.id} />
                      <input type="hidden" name="active" value={i.active ? "false" : "true"} />
                      <button type="submit" className="btn-ghost !px-2.5 !py-1 text-xs">{i.active ? "숨기기" : "다시 보이기"}</button>
                    </form>
                    <form action={deleteTextbookItem}>
                      <input type="hidden" name="id" value={i.id} />
                      <button type="submit" className="btn-ghost !px-2.5 !py-1 text-xs text-red-700">지우기</button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <form action={saveTextbookItem} className="mt-4 grid gap-2 rounded-xl bg-brand-50/50 p-3 sm:grid-cols-[1.6fr_7rem_7rem_1.6fr_4.5rem_auto]">
            <input name="name" required maxLength={60} className="input !py-2 text-sm" placeholder="교재 이름 (예: 650 LC 교재 A)" aria-label="새 교재 이름" />
            <select name="level" defaultValue="" className="input !py-2 text-sm" aria-label="새 교재 레벨">
              <option value="">모든 레벨</option>
              {(levels ?? []).map((l) => (
                <option key={l.level} value={l.level}>{l.level}</option>
              ))}
            </select>
            <input name="price" required inputMode="numeric" className="input !py-2 text-sm" placeholder="가격 (원)" aria-label="새 교재 가격" />
            <select name="account_id" defaultValue="" className="input !py-2 text-sm" aria-label="새 교재 입금 계좌">
              <option value="">기본 계좌</option>
              {active.map((a) => (
                <option key={a.id} value={a.id}>{accountName(a)}</option>
              ))}
            </select>
            <input name="sort_order" defaultValue={(items ?? []).length} inputMode="numeric" className="input !py-2 text-sm" aria-label="새 교재 순서" />
            <button type="submit" className="btn-primary !py-2 text-xs">교재 더하기</button>
            <input name="note" maxLength={200} className="input !py-2 text-sm sm:col-span-6" placeholder="설명 (선택)" aria-label="새 교재 설명" />
          </form>
        </section>

        {/* ─── 배송비 · 기본 계좌 · 안내 ─── */}
        <section id="settings" aria-labelledby="settings-title" className="card scroll-mt-24 p-5">
          <h2 id="settings-title" className="flex items-center gap-2 text-lg font-black text-ink">
            <Icon name="bolt" size={26} />배송비 · 기본 계좌 · 안내
          </h2>
          <form action={saveTextbookSettings} className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="shipping_fee" className="label">배송비 (원)</label>
              <input id="shipping_fee" name="shipping_fee" defaultValue={settings?.shipping_fee ?? 0} inputMode="numeric" className="input" />
              <p className="mt-1 text-xs text-slate">주문마다 한 번 더해져요. 무료면 0.</p>
            </div>
            <div>
              <label htmlFor="default_account_id" className="label">기본 계좌</label>
              <select id="default_account_id" name="default_account_id" defaultValue={settings?.default_account_id ?? ""} className="input">
                <option value="">순서가 가장 앞인 계좌</option>
                {active.map((a) => (
                  <option key={a.id} value={a.id}>{accountName(a)}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate">배송비와, 계좌를 안 고른 교재가 이 계좌로 가요.</p>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="notice" className="label">주문 화면 안내 문구 <span className="font-normal text-mist">(선택)</span></label>
              <textarea id="notice" name="notice" defaultValue={settings?.notice ?? ""} maxLength={300} rows={2} className="input" placeholder="예: 입금 확인 후 1~2일 안에 발송해요." />
            </div>
            <div className="sm:col-span-2">
              <button type="submit" className="btn-primary">저장</button>
            </div>
          </form>
        </section>
      </div>
    </>
  );
}
