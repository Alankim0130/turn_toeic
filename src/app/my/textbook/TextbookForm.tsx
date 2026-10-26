"use client";

import { startTransition, useActionState, useState } from "react";
import { submitTextbookOrder, type TextbookState } from "./actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Alert";
import { CopyButton } from "@/components/ui/CopyButton";
import { cn, formatWon } from "@/lib/utils";
import {
  DELIVERY_LABEL,
  PICKUP_DAYS_AHEAD,
  PICKUP_PLACE,
  pickupDateLabel,
  pickupLabel,
  pickupRangeLabel,
  pickupTimeLabel,
  pickupTimesFor,
  textbookQuote,
  type DeliveryMethod,
  type PickupDay,
  type TextbookAccount,
  type TextbookItem,
  type TextbookSettings,
} from "@/lib/textbook";

export type OrderTerm = {
  id: number;
  label: string;
  items: TextbookItem[];
  ordered: boolean;
  /**
   * 내 반 교재 중 새로 살 것 (2026-10-02 Alan — "주5일은 4권 … 주3일과 주5일 60분이면 2권") — 처음부터 골라 둔다.
   * null = 내 반 교재를 정하지 못했다(학생이 직접 고른다). [] = 정했지만 지난 주문에서 다 받았다
   */
  recommended: number[] | null;
  /** 골라 둔 까닭 한 줄 (몇 권 · 지난 주문에서 뺀 것 · 아직 등록 안 된 교재) */
  note: string | null;
};

/** 처음 골라 둘 교재 — 내 반 교재. 정하지 못했으면 예전처럼 교재가 하나뿐일 때 그것 */
const initialPick = (t: OrderTerm | undefined) =>
  new Set(!t ? [] : t.recommended ?? (t.items.length === 1 ? [t.items[0].id] : []));

/**
 * 불라방 교재 주문 (2026-09-21). 교재·계좌·배송비는 강사가 등록한 것을 쓴다.
 * 합계와 계좌별 입금액은 **미리보기** 다 — 주문에 박히는 금액은 DB 함수가 같은 규칙으로 다시 계산한다.
 *
 * **받는 방법** (2026-10-07 Alan — "불라방 현장수령도 있어. 현장수령시 택배비가 없어 … 무슨날짜에 올껀지, 몇시쯤 올껀지 남겨주면 좋겠어"):
 * 택배면 배송지를, 현장수령이면 배송비 없이 받으러 올 날짜 · 시각을 받는다. 다른 쪽 칸은 숨기기만 하고 지우지 않는다 —
 * 학생이 방법을 바꿨다 되돌려도 적어 둔 주소가 남는다 (숨긴 칸은 `required` 를 끈다 — 켜 두면 브라우저가 제출을 막는다).
 *
 * **받으러 올 날 · 시각은 반 편성 달력대로** (2026-10-26 Alan — "월수금은 9:30-15:00 & 18-21시 선택가능하고 화목금은 9:30-15:00 까지 만"):
 * 날짜는 수업이 있는 날만 고르는 칸이고(달력 칸으로는 날을 막을 수 없다), 시각은 고른 날의 트랙으로 바뀐다 — 월수금 수업일은 낮 · 저녁,
 * 화목금 수업일은 낮만. 저녁에 받을 수 있는 날에는 날짜 옆에 '저녁 가능' 을 붙인다. 서버 액션이 같은 함수로 다시 본다.
 *
 * @param pickupDays 받으러 올 수 있는 날 (오늘부터 60일 안의 수업일 · 트랙, DB `textbook_pickup_days`). null = 읽지 못했다 — 현장수령을 잠근다
 */
export function TextbookForm({
  terms,
  accounts,
  settings,
  defaults,
  pickupDays,
}: {
  terms: OrderTerm[];
  accounts: TextbookAccount[];
  settings: TextbookSettings | null;
  defaults: { recipient_name: string; phone: string };
  pickupDays: PickupDay[] | null;
}) {
  const [state, action] = useActionState<TextbookState, FormData>(submitTextbookOrder, {});
  const v: Record<string, string | undefined> = { ...defaults, ...(state.values ?? {}) };
  const open = terms.filter((t) => !t.ordered);
  const [termId, setTermId] = useState<number>(Number(v.term_id) || open[0]?.id || 0);
  const term = terms.find((t) => t.id === termId) ?? open[0];
  const [picked, setPicked] = useState<Set<number>>(() => initialPick(term));
  const [recipient, setRecipient] = useState(v.recipient_name ?? "");
  // 입금자명은 받는 분 이름으로 미리 채운다 (첫토익과 같다) — 부모님 이름으로 보내면 고친다
  const [depositor, setDepositor] = useState(v.depositor_name ?? v.recipient_name ?? "");
  const [delivery, setDelivery] = useState<DeliveryMethod>(v.delivery === "pickup" ? "pickup" : "parcel");
  const [pickupDate, setPickupDate] = useState(v.pickup_date ?? "");
  const [pickupTime, setPickupTime] = useState(v.pickup_time ?? "");
  const pickup = delivery === "pickup";

  const chosen = (term?.items ?? []).filter((i) => picked.has(i.id));
  const quote = textbookQuote(chosen, accounts, settings, { pickup });
  const shippingFee = Math.max(0, settings?.shipping_fee ?? 0);
  // 고른 날 · 그 날 고를 수 있는 시각 — 목록에 없는 날(예전에 적어 둔 값)이면 고르지 않은 것으로 본다
  const pickupDay = pickupDays?.find((d) => d.date === pickupDate) ?? null;
  const pickupTimes = pickupDay ? pickupTimesFor(pickupDay.track) : [];
  const pickupTimeOk = pickupTimes.includes(pickupTime);
  const missing =
    chosen.length === 0
      ? "교재를 하나 이상 골라 주세요"
      : pickup && pickupDays === null
        ? "학원에서 받을 수 있는 날을 불러오지 못했어요"
        : pickup && pickupDays?.length === 0
          ? "학원에서 받을 수 있는 날이 아직 없어요"
          : pickup && !pickupDay
            ? "받으러 올 날짜를 골라 주세요"
            : pickup && !pickupTimeOk
              ? "몇 시쯤 올지 골라 주세요"
              : quote.missingAccount
              ? "입금 계좌가 아직 없어요"
              : !depositor.trim()
                ? "입금자명을 적어 주세요"
                : null;

  if (state.ok) {
    return (
      <Alert kind="success" title="교재주문이 접수됐어요">
        {state.pickup
          ? `안내한 계좌로 입금하시면 강사님이 통장과 대조해 금액을 확인해요(입금확인). ${state.pickup} ${PICKUP_PLACE}에서 교재를 받아 가세요. 진행 상태는 아래 내역에서 볼 수 있어요.`
          : "안내한 계좌로 입금하시면 강사님이 통장과 대조해 금액을 확인하고(배송확인) 교재를 보내 드려요(배송시작). 진행 상태는 아래 내역에서 볼 수 있어요."}
      </Alert>
    );
  }
  if (!term) {
    return <Alert kind="info">이 달 교재는 이미 주문했어요. 아래 내역에서 진행 상태를 확인하세요.</Alert>;
  }

  return (
    <form
      action={action}
      // 보내기는 직접 한다 (2026-10-07 확인). `<form action>` 으로만 보내면 React 19 가 action 이 끝난 뒤 폼을 초기화(form.reset())해서
      // 교재 체크 · 받는 방법 · 시각 칸이 처음 그린 모양으로 돌아간다 — 분홍 카드 · 합계는 고른 그대로인데 실제로 보내는 값은 비어,
      // 휴대폰 번호 오타 같은 오류 뒤 고쳐 다시 누르면 "주문할 교재를 하나 이상 골라 주세요" 가 떴다. 같은 이벤트 안에서 전환을 열면
      // React 는 초기화하지 않고 버튼의 '주문하는 중…'(useFormStatus)은 그대로 켠다. 자바스크립트가 아직 없을 때는 위 action 으로 보낸다
      onSubmit={(e) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        startTransition(() => action(formData));
      }}
      className="space-y-6"
    >
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
              setPicked(initialPick(next));
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
        {/* 내 반 교재를 골라 둔 까닭 (2026-10-02) — 몇 권인지 · 지난 주문에서 뺀 것. 바꾸고 싶으면 체크를 고친다 */}
        {term.note && <p className="mb-2 rounded-xl bg-brand-50 px-3 py-2 text-sm font-bold text-ink">{term.note}</p>}
        {term.items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line px-4 py-5 text-center text-sm text-slate">
            강사님이 이 레벨 교재를 아직 등록하지 않았어요. 등록되면 여기에서 고를 수 있어요.
          </p>
        ) : (
          <ul className="space-y-2">
            {term.items.map((i) => {
              const on = picked.has(i.id);
              const mine = term.recommended?.includes(i.id) ?? false;
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
                      {/* 가격은 늘 오른쪽 — 좁은 화면에서는 '내 반 교재' 표가 이름 아래로 접힌다 */}
                      <span className="flex items-baseline justify-between gap-x-3">
                        <span className="min-w-0 font-bold text-ink">
                          {i.name}
                          {mine && <span className="ml-1.5 inline-block rounded-full bg-brand-500 px-2 py-0.5 align-middle text-[10px] font-black text-white">내 반 교재</span>}
                        </span>
                        <span className="shrink-0 font-black tabular-nums text-ink">{formatWon(i.price)}</span>
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

      {/* 받는 방법 (2026-10-07 Alan) — 택배 · 현장수령. 현장수령은 배송비가 없다 */}
      <fieldset>
        <legend className="label">받는 방법</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {(
            [
              { value: "parcel", title: "택배로 받기", place: null, sub: shippingFee > 0 ? `집으로 보내 드려요 · 배송비 ${formatWon(shippingFee)}` : "집으로 보내 드려요" },
              // 받는 곳까지 이름에 적는다 (2026-10-26 Alan — "학원 데스크 수령이 아니라 학원에서 받기 (ybm 어학원 3층 303호)")
              { value: "pickup", title: "학원에서 받기", place: PICKUP_PLACE, sub: shippingFee > 0 ? "배송비 없음 · 받으러 올 날짜 · 시각만 남겨요" : "받으러 올 날짜 · 시각만 남겨요" },
            ] as const
          ).map((o) => {
            const on = delivery === o.value;
            return (
              <label
                key={o.value}
                className={cn("flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition", on ? "border-brand-400 bg-brand-50/60" : "border-line hover:border-brand-200")}
              >
                <input
                  type="radio"
                  name="delivery"
                  value={o.value}
                  checked={on}
                  onChange={() => setDelivery(o.value)}
                  className="mt-1 h-4 w-4 accent-brand-500"
                />
                <span className="min-w-0">
                  <span className="block font-bold text-ink">
                    {o.title}
                    {/* 좁은 화면에서 받는 곳이 가운데서 갈리지 않게 괄호째 한 덩어리로 내린다 */}
                    {o.place && <> <span className="whitespace-nowrap">({o.place})</span></>}
                  </span>
                  <span className="mt-0.5 block text-xs text-slate">{o.sub}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="recipient_name" className="label">{pickup ? "받으러 올 분" : "받는 분"}</label>
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

        {/* 택배 — 배송지는 주소 + 상세 주소 둘 다 (2026-10-07 Alan — "우편번호 필요없고 본인 주소만 기입하게 해줘. 그리고 상세주소는 선택이 아니라
            필수로 들어가야해. 그래야지 배송을 할 수 있지"). 우편번호 칸은 없앴다. 현장수령이면 숨기기만 한다 (적어 둔 주소가 남게 — 숨긴 칸은 required 를 끈다) */}
        <div className={cn("space-y-4", pickup && "hidden")}>
          <div>
            <label htmlFor="address" className="label">주소</label>
            <input id="address" name="address" required={!pickup} maxLength={200} className="input" placeholder="도로명 주소" defaultValue={v.address} />
          </div>
          <div>
            <label htmlFor="address_detail" className="label">상세 주소</label>
            <input
              id="address_detail"
              name="address_detail"
              required={!pickup}
              maxLength={100}
              className="input"
              placeholder="동·호수, 공동현관 비밀번호 등"
              defaultValue={v.address_detail}
            />
          </div>
        </div>

        {/* 현장수령 — 받으러 올 날짜 · 몇 시쯤 (2026-10-07 Alan "무슨날짜에 올껀지, 몇시쯤 올껀지").
            2026-10-26 부터 날은 수업이 있는 날만, 시각은 그 날 트랙대로 (월수금 수업일 낮 · 저녁, 화목금 수업일 낮) */}
        <div className={cn("space-y-2", !pickup && "hidden")}>
          {pickupDays === null || pickupDays.length === 0 ? (
            // 날을 못 읽었거나 앞으로 60일 안에 수업일이 없다 — 고를 칸 대신 까닭 (주문 버튼은 위 missing 이 잠근다)
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">
              {pickupDays === null
                ? "학원에서 받을 수 있는 날을 불러오지 못했어요. 잠시 뒤 다시 열거나 택배로 받아 주세요."
                : `앞으로 ${PICKUP_DAYS_AHEAD}일 안에 학원에서 받을 수 있는 수업일이 아직 없어요. 택배로 받아 주세요.`}
            </p>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="pickup_date" className="label">받으러 올 날짜</label>
                  <select
                    id="pickup_date"
                    name="pickup_date"
                    required={pickup}
                    className="input"
                    value={pickupDay ? pickupDate : ""}
                    onChange={(e) => {
                      const next = pickupDays.find((d) => d.date === e.target.value);
                      setPickupDate(e.target.value);
                      // 바꾼 날에 없는 시각이면 비운다 — 월수금 저녁을 고른 채 화목금 날로 바꾸는 경우
                      if (!next || !pickupTimesFor(next.track).includes(pickupTime)) setPickupTime("");
                    }}
                  >
                    <option value="">날짜 고르기</option>
                    {pickupDays.map((d) => (
                      <option key={d.date} value={d.date}>
                        {pickupDateLabel(d.date)}
                        {d.track === "mwf" ? " · 저녁 가능" : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="pickup_time" className="label">몇 시쯤</label>
                  <select
                    id="pickup_time"
                    name="pickup_time"
                    required={pickup}
                    disabled={!pickupDay}
                    className="input disabled:bg-surface disabled:text-mist"
                    value={pickupTimeOk ? pickupTime : ""}
                    onChange={(e) => setPickupTime(e.target.value)}
                  >
                    <option value="">{pickupDay ? "시각 고르기" : "날짜부터 골라 주세요"}</option>
                    {pickupTimes.map((t) => (
                      <option key={t} value={t}>
                        {pickupTimeLabel(t)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {/* 고른 날 · 시각을 한 줄로 — 날을 고르면 그 날 받을 수 있는 때를 먼저 알려 준다 */}
              <p className={cn("rounded-xl px-3 py-2 text-sm", pickupDay && pickupTimeOk ? "bg-brand-50 font-bold text-ink" : "bg-surface text-slate")}>
                {pickupDay && pickupTimeOk ? (
                  // 받는 곳은 한 덩어리로 — 좁은 화면에서 "YBM" 과 "어학원" 이 갈리지 않게
                  <>
                    {pickupLabel(pickupDate, pickupTime)} <span className="whitespace-nowrap">{PICKUP_PLACE}에서</span> 받아요
                  </>
                ) : pickupDay ? (
                  `${pickupDateLabel(pickupDate)}에는 ${pickupRangeLabel(pickupDay.track)} 사이에 받을 수 있어요. 몇 시쯤 올지 골라 주세요.`
                ) : (
                  `수업이 있는 날만 고를 수 있어요. '저녁 가능' 이 붙은 날은 저녁에도 받아요. 강사님이 입금을 확인하면 그 날 ${PICKUP_PLACE}에서 받아 가요.`
                )}
              </p>
            </>
          )}
        </div>
        {/* 요청사항 칸은 없앴다 (2026-10-07 Alan "요청사항도 없애줘") — 예전 주문의 메모는 강사 · 조교 화면에 그대로 보인다 */}
      </div>

      <section aria-labelledby="pay-title" className="rounded-xl2 border border-brand-200 bg-brand-50/50 p-4 sm:p-5">
        <h3 id="pay-title" className="font-black text-ink">입금 안내</h3>
        <dl className="mt-3 space-y-1 text-sm">
          <div className="flex justify-between"><dt className="text-slate">교재</dt><dd className="tabular-nums text-ink">{formatWon(quote.itemsTotal)}</dd></div>
          {quote.shipping > 0 && <div className="flex justify-between"><dt className="text-slate">배송비</dt><dd className="tabular-nums text-ink">{formatWon(quote.shipping)}</dd></div>}
          {/* 현장수령으로 아낀 배송비를 보여 준다 — 배송비가 원래 없으면 적지 않는다 */}
          {pickup && shippingFee > 0 && chosen.length > 0 && (
            <div className="flex justify-between"><dt className="text-slate">배송비</dt><dd className="text-ink">없음 ({DELIVERY_LABEL.pickup})</dd></div>
          )}
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
