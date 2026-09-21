"use client";

import { useActionState, useState } from "react";
import { submitTextbookOrder, type TextbookState } from "./actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Alert";
import { cn, formatWon } from "@/lib/utils";
import { textbookQuote, type TextbookAccount, type TextbookItem, type TextbookSettings } from "@/lib/textbook";

export type OrderTerm = { id: number; label: string; items: TextbookItem[]; ordered: boolean };

/** 계좌번호 복사 — 누르면 "복사됨" 으로 잠깐 바뀐다 */
function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn-ghost !px-2.5 !py-1 text-xs"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          // 복사가 막힌 브라우저 — 번호는 화면에 그대로 있다
        }
      }}
    >
      {done ? "복사됨" : "복사"}
    </button>
  );
}

/**
 * 불라방 교재 주문 (2026-09-21). 교재·계좌·배송비는 강사가 등록한 것을 쓴다.
 * 합계와 계좌별 입금액은 **미리보기** 다 — 주문에 박히는 금액은 DB 함수가 같은 규칙으로 다시 계산한다.
 */
export function TextbookForm({
  terms,
  accounts,
  settings,
  defaults,
}: {
  terms: OrderTerm[];
  accounts: TextbookAccount[];
  settings: TextbookSettings | null;
  defaults: { recipient_name: string; phone: string };
}) {
  const [state, action] = useActionState<TextbookState, FormData>(submitTextbookOrder, {});
  const v: Record<string, string | undefined> = { ...defaults, ...(state.values ?? {}) };
  const open = terms.filter((t) => !t.ordered);
  const [termId, setTermId] = useState<number>(Number(v.term_id) || open[0]?.id || 0);
  const term = terms.find((t) => t.id === termId) ?? open[0];
  const [picked, setPicked] = useState<Set<number>>(() => new Set(term && term.items.length === 1 ? [term.items[0].id] : []));
  const [recipient, setRecipient] = useState(v.recipient_name ?? "");
  // 입금자명은 받는 분 이름으로 미리 채운다 (첫토익과 같다) — 부모님 이름으로 보내면 고친다
  const [depositor, setDepositor] = useState(v.depositor_name ?? v.recipient_name ?? "");

  const chosen = (term?.items ?? []).filter((i) => picked.has(i.id));
  const quote = textbookQuote(chosen, accounts, settings);
  const missing =
    chosen.length === 0 ? "교재를 하나 이상 골라 주세요" : quote.missingAccount ? "입금 계좌가 아직 없어요" : !depositor.trim() ? "입금자명을 적어 주세요" : null;

  if (state.ok) {
    return (
      <Alert kind="success" title="교재주문이 접수됐어요">
        안내한 계좌로 입금하시면 강사님이 통장과 대조해 확인한 뒤 발송해요. 진행 상태는 아래 내역에서 볼 수 있어요.
      </Alert>
    );
  }
  if (!term) {
    return <Alert kind="info">이 달 교재는 이미 주문했어요. 아래 내역에서 진행 상태를 확인하세요.</Alert>;
  }

  return (
    <form action={action} className="space-y-6">
      {state.error && <Alert kind="warning">{state.error}</Alert>}

      {open.length > 1 ? (
        <div>
          <label htmlFor="term_id" className="label">주문할 달</label>
          <select
            id="term_id"
            name="term_id"
            className="input"
            value={term.id}
            onChange={(e) => {
              const next = terms.find((t) => t.id === Number(e.target.value));
              setTermId(Number(e.target.value));
              setPicked(new Set(next && next.items.length === 1 ? [next.items[0].id] : []));
            }}
          >
            {open.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div>
          <input type="hidden" name="term_id" value={term.id} />
          <p className="label">주문할 반</p>
          <p className="rounded-xl bg-surface px-4 py-3 text-sm font-bold text-ink">{term.label}</p>
        </div>
      )}

      <fieldset>
        <legend className="label">교재 고르기</legend>
        {term.items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line px-4 py-5 text-center text-sm text-slate">
            강사님이 이 레벨 교재를 아직 등록하지 않았어요. 등록되면 여기에서 고를 수 있어요.
          </p>
        ) : (
          <ul className="space-y-2">
            {term.items.map((i) => {
              const on = picked.has(i.id);
              return (
                <li key={i.id}>
                  <label className={cn("flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition", on ? "border-brand-400 bg-brand-50/60" : "border-line hover:border-brand-200")}>
                    <input
                      type="checkbox"
                      name="item_id"
                      value={i.id}
                      checked={on}
                      onChange={(e) => {
                        const next = new Set(picked);
                        if (e.target.checked) next.add(i.id);
                        else next.delete(i.id);
                        setPicked(next);
                      }}
                      className="mt-1 h-4 w-4 accent-brand-500"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <span className="font-bold text-ink">{i.name}</span>
                        <span className="font-black tabular-nums text-ink">{formatWon(i.price)}</span>
                      </span>
                      {i.note && <span className="mt-0.5 block text-xs text-slate">{i.note}</span>}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </fieldset>

      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="recipient_name" className="label">받는 분</label>
            <input
              id="recipient_name"
              name="recipient_name"
              required
              maxLength={30}
              className="input"
              value={recipient}
              onChange={(e) => {
                // 입금자명을 따로 고치지 않았으면 받는 분 이름을 따라간다
                if (depositor === recipient) setDepositor(e.target.value);
                setRecipient(e.target.value);
              }}
            />
          </div>
          <div>
            <label htmlFor="phone" className="label">휴대폰 번호</label>
            <input id="phone" name="phone" type="tel" inputMode="numeric" required className="input" placeholder="01012345678" defaultValue={v.phone} />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
          <div>
            <label htmlFor="postal_code" className="label">우편번호 <span className="font-normal text-mist">(선택)</span></label>
            <input id="postal_code" name="postal_code" inputMode="numeric" maxLength={5} className="input" placeholder="12345" defaultValue={v.postal_code} />
          </div>
          <div>
            <label htmlFor="address" className="label">주소</label>
            <input id="address" name="address" required maxLength={200} className="input" placeholder="도로명 주소" defaultValue={v.address} />
          </div>
        </div>
        <div>
          <label htmlFor="address_detail" className="label">상세 주소 <span className="font-normal text-mist">(선택)</span></label>
          <input id="address_detail" name="address_detail" maxLength={100} className="input" placeholder="동·호수, 공동현관 비밀번호 등" defaultValue={v.address_detail} />
        </div>
        <div>
          <label htmlFor="memo" className="label">요청사항 <span className="font-normal text-mist">(선택)</span></label>
          <input id="memo" name="memo" maxLength={200} className="input" placeholder="배송 시 요청사항" defaultValue={v.memo} />
        </div>
      </div>

      <section aria-labelledby="pay-title" className="rounded-xl2 border border-brand-200 bg-brand-50/50 p-4 sm:p-5">
        <h3 id="pay-title" className="font-black text-ink">입금 안내</h3>
        <dl className="mt-3 space-y-1 text-sm">
          <div className="flex justify-between"><dt className="text-slate">교재</dt><dd className="tabular-nums text-ink">{formatWon(quote.itemsTotal)}</dd></div>
          {quote.shipping > 0 && <div className="flex justify-between"><dt className="text-slate">배송비</dt><dd className="tabular-nums text-ink">{formatWon(quote.shipping)}</dd></div>}
          <div className="flex justify-between border-t border-brand-100 pt-2 text-base"><dt className="font-black text-ink">합계</dt><dd className="font-black tabular-nums text-brand-700">{formatWon(quote.total)}</dd></div>
        </dl>

        {chosen.length === 0 ? (
          <p className="mt-3 text-sm text-slate">교재를 고르면 입금할 계좌와 금액이 나와요.</p>
        ) : quote.missingAccount ? (
          <p className="mt-3 text-sm font-bold text-amber-800">입금 계좌가 아직 등록되지 않았어요. 강사님께 문의해 주세요.</p>
        ) : (
          quote.lines.length > 0 && (
            <ul className="mt-3 space-y-2">
              {quote.lines.map((l) => (
                <li key={l.account?.id ?? "none"} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-3 py-2.5">
                  <div className="min-w-0 text-sm">
                    <p className="font-bold text-ink">
                      {l.account?.bank_name} {l.account?.account_no}
                      {l.account?.label ? <span className="ml-1.5 text-xs font-normal text-slate">{l.account.label}</span> : null}
                    </p>
                    <p className="text-xs text-slate">예금주 {l.account?.holder} · {formatWon(l.amount)}</p>
                  </div>
                  {l.account && <CopyButton text={l.account.account_no} />}
                </li>
              ))}
            </ul>
          )
        )}
        {quote.lines.length > 1 && <p className="mt-2 text-xs text-slate">계좌가 둘이라 계좌마다 적힌 금액을 따로 입금해 주세요.</p>}
        {settings?.notice && <p className="mt-3 text-xs text-slate">{settings.notice}</p>}

        <div className="mt-4">
          <label htmlFor="depositor_name" className="label">입금자명</label>
          <input
            id="depositor_name"
            name="depositor_name"
            required
            maxLength={30}
            className="input"
            value={depositor}
            onChange={(e) => setDepositor(e.target.value)}
            placeholder="통장에 찍히는 이름"
          />
          <p className="mt-1 text-xs text-slate">부모님 이름으로 입금하면 그 이름을 적어 주세요. 강사님이 통장과 대조해요.</p>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pendingText="주문하는 중…" disabled={!!missing}>
          {quote.total > 0 ? `${formatWon(quote.total)} 입금하고 주문하기` : "주문하기"}
        </SubmitButton>
        {/* 버튼이 왜 잠겼는지 적는다 — 잠긴 버튼만 있으면 무엇을 해야 할지 모른다 */}
        {missing && <p className="text-sm font-bold text-slate">{missing}</p>}
      </div>
    </form>
  );
}
