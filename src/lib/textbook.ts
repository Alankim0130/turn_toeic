/**
 * 불라방 교재주문 (2026-09-21 Alan — "교재비를 받는 계좌번호와 교재 과목 등록은 강사가 직접").
 *
 * **금액의 진짜 계산은 DB 함수 `public.create_textbook_order` 한곳이다** — 주문에 품목·금액·입금 계좌를 박아 둔다.
 * 이 파일은 주문 화면이 **제출 전에 미리 보여 주는** 합계와 계좌별 금액을 같은 규칙으로 만든다.
 * 규칙을 바꾸면 SQL 함수와 `textbook.test.ts` 를 같이 고칠 것 — 어긋나면 화면의 금액과 주문의 금액이 달라진다.
 *
 * 규칙: 교재는 제 계좌로(계좌가 없거나 쓰지 않으면 기본 계좌), 배송비는 기본 계좌로. 기본 계좌가 비면 쓰는 중인 첫 계좌.
 */

export type TextbookAccount = { id: number; bank_name: string; account_no: string; holder: string; label: string | null; active: boolean; sort_order: number };
export type TextbookItem = { id: number; name: string; level: number | null; price: number; account_id: number | null; note: string | null; active: boolean; sort_order: number };
export type TextbookSettings = { shipping_fee: number; default_account_id: number | null; notice: string | null };
export type PayLine = { account: TextbookAccount | null; amount: number };

const bySort = <T extends { sort_order: number; id: number }>(a: T, b: T) => a.sort_order - b.sort_order || a.id - b.id;

/** 이 학생이 볼 교재: 쓰는 중이고 내 레벨이거나 모든 레벨 */
export function itemsForLevels(items: TextbookItem[], levels: number[]): TextbookItem[] {
  return items.filter((i) => i.active && (i.level === null || levels.includes(i.level))).sort(bySort);
}

/** 기본 계좌 — 설정의 계좌가 쓰는 중이면 그것, 아니면 쓰는 중인 첫 계좌 */
export function defaultAccount(accounts: TextbookAccount[], settings: TextbookSettings | null): TextbookAccount | null {
  const active = accounts.filter((a) => a.active).sort(bySort);
  return active.find((a) => a.id === settings?.default_account_id) ?? active[0] ?? null;
}

/** 합계와 계좌별 입금액 (미리보기) */
export function textbookQuote(chosen: TextbookItem[], accounts: TextbookAccount[], settings: TextbookSettings | null) {
  const fallback = defaultAccount(accounts, settings);
  const accountOf = (item: TextbookItem) => accounts.find((a) => a.id === item.account_id && a.active) ?? fallback;
  const itemsTotal = chosen.reduce((n, i) => n + i.price, 0);
  const shipping = chosen.length > 0 ? Math.max(0, settings?.shipping_fee ?? 0) : 0;

  const sums = new Map<number | null, number>();
  const add = (account: TextbookAccount | null, amount: number) => sums.set(account?.id ?? null, (sums.get(account?.id ?? null) ?? 0) + amount);
  for (const i of chosen) add(accountOf(i), i.price);
  if (shipping > 0) add(fallback, shipping);

  const lines: PayLine[] = [...sums.entries()]
    .filter(([, amount]) => amount > 0)
    .map(([id, amount]) => ({ account: accounts.find((a) => a.id === id) ?? null, amount }))
    .sort((a, b) => (a.account && b.account ? bySort(a.account, b.account) : a.account ? -1 : 1));

  return {
    itemsTotal,
    shipping,
    total: itemsTotal + shipping,
    lines,
    /** 낼 돈이 있는데 받을 계좌가 없다 — 주문을 받을 수 없다 (강사가 계좌부터 등록해야 한다) */
    missingAccount: itemsTotal + shipping > 0 && lines.some((l) => !l.account),
  };
}

/** DB 함수가 던지는 오류 → 학생에게 보이는 말 */
export function textbookOrderError(message: string | undefined): string {
  const m = message ?? "";
  if (m.includes("duplicate")) return "이 달 교재는 이미 주문했어요. 바꾸려면 아래 내역에서 취소하고 다시 주문해 주세요.";
  if (m.includes("not_eligible")) return "이 달 불라방으로 등록된 반이 없어요. 불라방 수강생만 교재를 주문할 수 있어요.";
  if (m.includes("invalid_items")) return "고른 교재를 다시 확인해 주세요. 목록이 바뀌었을 수 있어요.";
  if (m.includes("no_account")) return "입금 계좌가 아직 등록되지 않았어요. 강사님께 문의해 주세요.";
  if (m.includes("recipient")) return "받는 분 이름을 확인해 주세요.";
  if (m.includes("phone")) return "휴대폰 번호를 확인해 주세요.";
  if (m.includes("postal")) return "우편번호는 숫자 5자리예요.";
  if (m.includes("address")) return "배송 주소를 확인해 주세요.";
  if (m.includes("memo")) return "요청사항은 200자까지예요.";
  if (m.includes("depositor")) return "입금자명을 적어 주세요. 통장에 찍히는 이름이에요.";
  if (m.includes("login_required")) return "로그인이 필요해요.";
  return "주문하지 못했어요. 잠시 뒤 다시 시도해 주세요.";
}

export const TEXTBOOK_STATUS: Record<string, { label: string; hint: string }> = {
  requested: { label: "입금 확인 중", hint: "입금하시면 강사님이 통장과 대조해 확인해요" },
  confirmed: { label: "입금 확인", hint: "곧 발송해요" },
  shipped: { label: "발송 완료", hint: "송장번호로 배송을 확인할 수 있어요" },
  cancelled: { label: "취소", hint: "" },
};
