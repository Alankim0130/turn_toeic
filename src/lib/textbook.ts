/**
 * 불라방 교재주문 (2026-09-21 Alan — "교재비를 받는 계좌번호와 교재 과목 등록은 강사가 직접").
 *
 * **금액의 진짜 계산은 DB 함수 `public.create_textbook_order` 한곳이다** — 주문에 품목·금액·입금 계좌를 박아 둔다.
 * 이 파일은 주문 화면이 **제출 전에 미리 보여 주는** 합계와 계좌별 금액을 같은 규칙으로 만든다.
 * 규칙을 바꾸면 SQL 함수와 `textbook.test.ts` 를 같이 고칠 것 — 어긋나면 화면의 금액과 주문의 금액이 달라진다.
 *
 * 규칙: 교재는 제 계좌로(계좌가 없거나 쓰지 않으면 기본 계좌), 배송비는 기본 계좌로. 기본 계좌가 비면 쓰는 중인 첫 계좌.
 * **현장수령은 배송비가 없다** (2026-10-07 Alan — "불라방 현장수령도 있어. 현장수령시 택배비가 없어") — 아래 "현장수령".
 *
 * **내 반 교재**(2026-10-02 Alan — "주5일은 4권이라서 4만원이고, 주3일과 주5일 60분이면 2권이야")는 아래 `booksForSections` 한곳이 정한다.
 */

import { formatWon } from "./utils";

export type TextbookAccount = { id: number; bank_name: string; account_no: string; holder: string; label: string | null; active: boolean; sort_order: number };
export type TextbookItem = {
  id: number;
  name: string;
  level: number | null;
  price: number;
  account_id: number | null;
  note: string | null;
  active: boolean;
  sort_order: number;
  /** 이 교재를 쓰는 과목 · 과정 (2026-10-02). 둘 다 있으면 그 시간을 듣는 학생에게 미리 골라진다. 비면 학생이 직접 고르는 교재 */
  subject: string | null;
  book_set: string | null;
};
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

/** 합계와 계좌별 입금액 (미리보기). `pickup` = 현장수령 — 배송비가 없다 (DB 함수도 0 으로 둔다) */
export type TextbookQuote = ReturnType<typeof textbookQuote>;
export function textbookQuote(chosen: TextbookItem[], accounts: TextbookAccount[], settings: TextbookSettings | null, opts: { pickup?: boolean } = {}) {
  const fallback = defaultAccount(accounts, settings);
  const accountOf = (item: TextbookItem) => accounts.find((a) => a.id === item.account_id && a.active) ?? fallback;
  const itemsTotal = chosen.reduce((n, i) => n + i.price, 0);
  const shipping = chosen.length > 0 && !opts.pickup ? Math.max(0, settings?.shipping_fee ?? 0) : 0;

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

// ─── 현장수령 (2026-10-07) ────────────────────────────────────────────────

/**
 * 받는 방법 (2026-10-07 Alan — "불라방 현장수령도 있어. 현장수령시 택배비가 없어. 그래서 불라방 교재 주문할때 현장 수령 선택시
 * 무슨날짜에 올껀지, 몇시쯤 올껀지 남겨주면 좋겠어"). `textbook_orders.delivery_method` 와 값이 같다 (DB check).
 *   - parcel 택배 — 예전 주문 전부. 배송지를 받고 배송비가 붙는다
 *   - pickup 현장수령 — 학원에 와서 직접 받는다. 배송비가 없고, 배송지 대신 받으러 올 날짜 · 시각("몇 시쯤")을 받는다
 * 입금 → 강사 금액확인은 같고, 조교가 건네면 "수령완료" 를 누른다 (그 주문은 학생 내역에서 사라진다).
 */
export type DeliveryMethod = "parcel" | "pickup";
export const DELIVERY_LABEL: Record<DeliveryMethod, string> = { parcel: "택배", pickup: "현장수령" };
export const isPickup = (o: { delivery_method?: string | null }) => o.delivery_method === "pickup";

/** 받으러 올 날짜는 오늘(KST)부터 이 날수 안 — DB 함수 `create_textbook_order` 의 `v_today + 60` 과 같다 (바꾸면 둘 다) */
export const PICKUP_DAYS_AHEAD = 60;

/**
 * "몇 시쯤" 고르는 칸 — 오전 10시부터 밤 8시까지 30분 간격 (2026-10-07 Alan "수령시간은 오전 10시부터 밤 8시까지 설정해줘").
 * 바꾸면 여기만 — DB 는 시각을 거르지 않고 서버 액션이 이 목록 안의 값만 받는다 (이미 들어온 주문의 시각은 범위 밖이어도 그대로 보인다)
 */
export const PICKUP_TIMES: readonly string[] = Array.from({ length: (20 - 10) * 2 + 1 }, (_, i) => {
  const minutes = 10 * 60 + i * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
});

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

/** "2026-10-12" → "10월 12일 (월)" */
export function pickupDateLabel(date: string): string {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  return `${m}월 ${d}일 (${WEEKDAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]})`;
}

/** "14:30" · "14:30:00"(DB time) → "오후 2시 30분", "09:00" → "오전 9시", "12:00" → "오후 12시" */
export function pickupTimeLabel(time: string): string {
  const [h, m] = time.split(":").map(Number);
  return `${h < 12 ? "오전" : "오후"} ${h % 12 === 0 ? 12 : h % 12}시${m ? ` ${m}분` : ""}`;
}

/** "10월 12일 (월) 오후 2시쯤" — 학생 내역 · 강사 · 조교 화면 · 새 주문 알림이 같은 말을 쓴다 */
export const pickupLabel = (date: string, time: string) => `${pickupDateLabel(date)} ${pickupTimeLabel(time)}쯤`;

// ─── 내 반 교재 (2026-10-02) ──────────────────────────────────────────────

export type BookSubject = "lc" | "rc";
export type BookSet = "A" | "B";
/** 교재 한 권의 자리 — 레벨 × 과목 × 과정 */
export type BookKey = { level: number; subject: BookSubject; set: BookSet };
/** 반 하나의 교재 칸. 시간 단위 반(60 · 70분)만 과목 · 과정이 있다 — 묶음 반 · 속성반 · 방학달 통짜 반은 비어 있다 */
export type BookSection = { id: number; level: number | null; subject: string | null; book_set: string | null };

const SUBJECT_ORDER: Record<BookSubject, number> = { lc: 0, rc: 1 };
export const bookKeyId = (k: BookKey) => `${k.level}-${k.subject}-${k.set}`;
/** "650 LC A과정" — 처음 넣어 둔 교재 이름과 같은 꼴 (마이그레이션 20261002233000) */
export const bookLabel = (k: BookKey) => `${k.level} ${k.subject.toUpperCase()} ${k.set}과정`;
const byBook = (a: BookKey, b: BookKey) => a.level - b.level || SUBJECT_ORDER[a.subject] - SUBJECT_ORDER[b.subject] || a.set.localeCompare(b.set);

function bookKeyOf(s: BookSection): BookKey | null {
  if (typeof s.level !== "number" || !Number.isInteger(s.level)) return null;
  if (s.subject !== "lc" && s.subject !== "rc") return null;
  if (s.book_set !== "A" && s.book_set !== "B") return null;
  return { level: s.level, subject: s.subject, set: s.book_set };
}

/**
 * **내 반 교재** (2026-10-02 Alan — "주5일은 4권이라서 4만원이고, 주3일과 주5일 60분이면 2권이야").
 *
 * 교재 한 권 = 레벨 × 과목(LC · RC) × 과정(A · B). **권수를 코드에 적지 않는다** — 학생이 앉아 있는 시간 단위 반마다
 * 그 시간의 과목(`subject`)과 과정(`book_set`)이 교재 한 권을 정하고, 같은 교재는 한 번만 센다 (9 · 10월 편성표로 실측):
 *   - 주5일 120분: 월수금 두 시간 + 화목금 두 시간 → 과목 둘 × 과정 둘 = **4권**
 *   - 주3일 120분: 한 트랙의 두 시간 → 시간마다 과정이 달라 **2권**
 *   - 주5일 60분: 두 트랙의 같은 시간 → 같은 과정의 RC · LC **2권**
 *   - 속성반: 함께 듣는 850 시간의 교재까지 (650 중급속성 = 650 네 권 + 850 두 권)
 *
 * `direct` 는 직접 배정된 반, `includes` 는 반 → 함께 듣는 반 (DB `term_section_includes` — 품는 관계를 앱에서 따로 계산하지 않는다).
 * 다른 반을 품는 반(묶음 · 속성반)은 품은 반들이, 아니면 그 반 자신이 교재를 갖는다.
 * 교재를 가져야 할 반에 과목이나 과정이 비어 있으면 **정하지 않는다**(`unknown`) — 방학달 통짜 반처럼 두 과목을 이어 듣는 반이거나
 * 시간표에서 아직 안 고른 것이다. 짐작해서 채우지 않는다 (그때는 학생이 직접 고른다).
 */
export function booksForSections(
  direct: readonly number[],
  includes: ReadonlyMap<number, readonly number[]>,
  sections: ReadonlyMap<number, BookSection>,
): { keys: BookKey[]; unknown: boolean } {
  const keys = new Map<string, BookKey>();
  let unknown = false;
  for (const id of new Set(direct)) {
    const inner = includes.get(id) ?? [];
    for (const leaf of inner.length > 0 ? inner : [id]) {
      const s = sections.get(leaf);
      const key = s ? bookKeyOf(s) : null;
      if (key) keys.set(bookKeyId(key), key);
      else unknown = true;
    }
  }
  return { keys: [...keys.values()].sort(byBook), unknown };
}

/** 교재 자리마다 등록된 교재 — 레벨 · 과목 · 과정이 같고 쓰는 중인 것. 강사가 아직 등록하지 않은 자리는 `missing` */
export function itemsForBooks(items: TextbookItem[], keys: readonly BookKey[]): { items: TextbookItem[]; missing: BookKey[] } {
  const found = new Map<number, TextbookItem>();
  const missing: BookKey[] = [];
  for (const k of keys) {
    const hit = items.filter((i) => i.active && i.level === k.level && i.subject === k.subject && i.book_set === k.set);
    if (hit.length === 0) missing.push(k);
    for (const i of hit) found.set(i.id, i);
  }
  return { items: [...found.values()].sort(bySort), missing };
}

export type TextbookGuide = {
  /** 내 반 교재 자리 */
  books: BookKey[];
  /** 미리 고를 교재 — 내 반 교재 중 지난 주문에서 받지 않은 것 */
  picked: TextbookItem[];
  /** 내 반 교재인데 지난 주문(다른 달)에서 이미 받은 것 — 과정 A · B 교재는 달이 바뀌어도 같은 책이다 */
  owned: TextbookItem[];
  /** 내 반 교재인데 강사가 아직 등록하지 않은 자리 */
  missing: BookKey[];
  /** 교재를 정하지 못한 반이 있다 */
  unknown: boolean;
  /** 택배로 받을 때 (배송비 포함) */
  quote: TextbookQuote;
  /** 학원에서 직접 받을 때 (현장수령 — 배송비 없음, 2026-10-07) */
  pickupQuote: TextbookQuote;
};

/**
 * 내 반 교재비 — 미리 고를 교재와 그 합계 · 계좌별 금액.
 * **지난 주문에서 받은 교재는 뺀다** — 과정 A · B 는 달마다 시간만 바뀌고 책은 같아서, 둘째 달 주5일 학생은 새로 살 책이 없고
 * 주3일 학생은 지난달과 반대 과정의 두 권만 산다. 빼지 않으면 가진 책 값을 또 안내한다.
 */
export function textbookGuide(input: {
  books: { keys: BookKey[]; unknown: boolean };
  items: TextbookItem[];
  accounts: TextbookAccount[];
  settings: TextbookSettings | null;
  ownedItemIds: ReadonlySet<number>;
}): TextbookGuide {
  const { items, missing } = itemsForBooks(input.items, input.books.keys);
  const picked = items.filter((i) => !input.ownedItemIds.has(i.id));
  const owned = items.filter((i) => input.ownedItemIds.has(i.id));
  return {
    books: input.books.keys,
    picked,
    owned,
    missing,
    unknown: input.books.unknown,
    quote: textbookQuote(picked, input.accounts, input.settings),
    pickupQuote: textbookQuote(picked, input.accounts, input.settings, { pickup: true }),
  };
}

/** 교재비 안내를 보낼 수 있나 — 내 반 교재를 다 정했고(빈 반 · 미등록 자리 없음), 새로 살 교재가 있고, 받을 계좌가 있다 */
export function guideReady(g: TextbookGuide): boolean {
  return !g.unknown && g.missing.length === 0 && g.picked.length > 0 && !g.quote.missingAccount;
}

/** 지난 주문들의 교재 번호 (취소한 주문 · 이 달 주문은 빼고) — `textbookGuide` 의 ownedItemIds */
export function ownedItemIds(orders: readonly { status: string; term_id: number | null; items: unknown }[], termId: number): Set<number> {
  const out = new Set<number>();
  for (const o of orders) {
    if (o.status === "cancelled" || o.term_id === termId || !Array.isArray(o.items)) continue;
    for (const i of o.items) {
      const id = Number((i as { id?: unknown } | null)?.id);
      if (Number.isInteger(id) && id > 0) out.add(id);
    }
  }
  return out;
}

/**
 * 주문 화면에 처음 골라 둘 교재와 그 까닭 한 줄.
 * 내 반 교재를 다 정하지 못했으면(`unknown`) 아무것도 골라 두지 않는다(null) — 몇 권만 골라 두면 그게 전부인 줄 안다.
 */
export function orderPreset(g: TextbookGuide): { recommended: number[] | null; note: string | null } {
  if (g.unknown || g.books.length === 0) {
    return { recommended: null, note: g.unknown ? "내 반 교재를 정하지 못했어요 — 필요한 교재를 직접 골라 주세요." : null };
  }
  const missing = g.missing.length > 0 ? ` 아직 등록되지 않은 교재: ${g.missing.map(bookLabel).join(" · ")}` : "";
  if (g.picked.length === 0) {
    return {
      recommended: [],
      note: g.owned.length > 0 ? `내 반 교재는 지난 주문에서 모두 받았어요. 더 필요한 교재가 있으면 골라 주세요.${missing}` : missing.trim() || null,
    };
  }
  return {
    recommended: g.picked.map((i) => i.id),
    note: `내 반 교재 ${g.picked.length}권을 골라 뒀어요.${g.owned.length > 0 ? ` 지난 주문에서 받은 ${g.owned.length}권은 뺐어요.` : ""}${missing}`,
  };
}

/**
 * 교재비 안내 한 장 — 수강증 승인 팝업과 알림함이 같은 것을 보여 준다 (화면으로 넘길 수 있는 값만).
 * 받는 방법은 주문할 때 고르므로 **두 가지 금액을 다 적는다** — 택배(배송비 포함)와 현장수령(배송비 없음, 2026-10-07).
 * 배송비가 0 이면 두 금액이 같아 하나만 적는다.
 */
export type TextbookNotice = {
  month: number;
  books: string[];
  itemsTotal: number;
  /** 택배 배송비 */
  shipping: number;
  /** 택배로 받을 때 합계 */
  total: number;
  /** 학원에서 직접 받을 때(현장수령) 합계 — 배송비가 없다 */
  pickupTotal: number;
  /** 계좌마다 택배일 때(`amount`) · 현장수령일 때(`pickupAmount`) 입금액 */
  pay: { bank: string; accountNo: string; holder: string; label: string | null; amount: number; pickupAmount: number }[];
  /** 지난 주문에서 받아 뺀 교재 수 */
  owned: number;
};

export function textbookNotice(month: number, g: TextbookGuide): TextbookNotice | null {
  if (!guideReady(g)) return null;
  const pickupBy = new Map(g.pickupQuote.lines.map((l) => [l.account?.id ?? null, l.amount]));
  return {
    month,
    books: g.picked.map((i) => i.name),
    itemsTotal: g.quote.itemsTotal,
    shipping: g.quote.shipping,
    total: g.quote.total,
    pickupTotal: g.pickupQuote.total,
    pay: g.quote.lines.flatMap((l) =>
      l.account
        ? [
            {
              bank: l.account.bank_name,
              accountNo: l.account.account_no,
              holder: l.account.holder,
              label: l.account.label,
              amount: l.amount,
              pickupAmount: pickupBy.get(l.account.id) ?? 0,
            },
          ]
        : [],
    ),
    owned: g.owned.length,
  };
}

/** 알림함에 남길 글 (student_messages — 제목 80자 · 본문 1,000자) */
export function textbookNoticeMessage(n: TextbookNotice): { title: string; body: string } {
  const both = n.shipping > 0;
  const lines = [
    "불라방 수강생은 교재를 택배로 받거나 학원에 와서 직접 받아요(현장수령 — 배송비 없음). 내 반에 맞춘 교재비를 안내해 드려요.",
    "",
    `교재 ${n.books.length}권 · ${formatWon(n.itemsTotal)}`,
    `(${n.books.join(" · ")})`,
    ...(both
      ? [`택배: 배송비 ${formatWon(n.shipping)} · 합계 ${formatWon(n.total)}`, `현장수령: 배송비 없이 합계 ${formatWon(n.pickupTotal)}`]
      : [`합계 ${formatWon(n.total)}`]),
    "",
    "입금 계좌",
    ...n.pay.map(
      (p) =>
        `${p.label ? `[${p.label}] ` : ""}${p.bank} ${p.accountNo} · 예금주 ${p.holder} · ` +
        (both ? `택배 ${formatWon(p.amount)} · 현장수령 ${formatWon(p.pickupAmount)}` : formatWon(p.amount)),
    ),
    "",
    "‘불라방 교재주문’에서 받는 방법(택배 · 현장수령)을 고르고 입금자명을 적어 주문해 주세요. 현장수령은 받으러 올 날짜와 시각을 함께 남겨요. 입금하시면 선생님이 통장과 대조해 확인한 뒤 보내 드리거나 학원에서 건네 드려요.",
    n.owned > 0 ? `지난 주문에서 받은 교재 ${n.owned}권은 뺐어요. 이미 가진 교재가 더 있으면 주문할 때 빼면 돼요.` : "이미 가진 교재가 있으면 주문할 때 빼면 돼요.",
  ];
  return { title: `${n.month}월 불라방 교재비 안내`, body: lines.join("\n").slice(0, 1000) };
}

/** DB 함수가 던지는 오류 → 학생에게 보이는 말 */
export function textbookOrderError(message: string | undefined): string {
  const m = message ?? "";
  // 배포 사이에 새 화면이 아직 바뀌지 않은 DB 함수를 부르면 "…(p_address, p_delivery, …) in the schema cache" 가 온다 — 칸 이름에 속지 않게 먼저 거른다
  if (m.includes("schema cache")) return "주문하지 못했어요. 잠시 뒤 다시 시도해 주세요.";
  if (m.includes("duplicate")) return "이 달 교재는 이미 주문했어요. 바꾸려면 아래 내역에서 취소하고 다시 주문해 주세요.";
  if (m.includes("not_eligible")) return "이 달 불라방으로 등록된 반이 없어요. 불라방 수강생만 교재를 주문할 수 있어요.";
  if (m.includes("invalid_items")) return "고른 교재를 다시 확인해 주세요. 목록이 바뀌었을 수 있어요.";
  if (m.includes("no_account")) return "입금 계좌가 아직 등록되지 않았어요. 강사님께 문의해 주세요.";
  if (m.includes("pickup_date")) return `받으러 올 날짜는 오늘부터 ${PICKUP_DAYS_AHEAD}일 안에서 골라 주세요.`;
  if (m.includes("pickup_time")) return `받으러 올 시각은 ${pickupTimeLabel(PICKUP_TIMES[0])} ~ ${pickupTimeLabel(PICKUP_TIMES[PICKUP_TIMES.length - 1])} 사이에서 골라 주세요.`;
  if (m.includes("delivery")) return "받는 방법(택배 · 현장수령)을 골라 주세요.";
  if (m.includes("recipient")) return "받는 분 이름을 확인해 주세요.";
  if (m.includes("phone")) return "휴대폰 번호를 확인해 주세요.";
  if (m.includes("postal")) return "우편번호는 숫자 5자리예요.";
  if (m.includes("address")) return "배송 주소를 확인해 주세요.";
  if (m.includes("memo")) return "요청사항은 200자까지예요.";
  if (m.includes("depositor")) return "입금자명을 적어 주세요. 통장에 찍히는 이름이에요.";
  if (m.includes("login_required")) return "로그인이 필요해요.";
  return "주문하지 못했어요. 잠시 뒤 다시 시도해 주세요.";
}

/**
 * 학생 화면의 주문 상태 (2026-10-02 Alan — "학생들 화면에는 배송확인 - 배송시작 이렇게 나오면 좋겠어").
 * 상태 값은 그대로이고 부르는 이름만 학생 쪽 말로 — 강사가 금액확인 → `배송확인`, 조교가 배송완료 → `배송시작`.
 * 강사 · 조교 화면은 `TEXTBOOK_ADMIN_STATUS` (같은 상태를 하는 일의 이름으로 부른다).
 */
export const TEXTBOOK_STATUS: Record<string, { label: string; hint: string }> = {
  requested: { label: "주문완료", hint: "입금하시면 강사님이 통장과 대조해 금액을 확인해요" },
  confirmed: { label: "배송확인", hint: "금액이 확인됐어요. 곧 교재를 보내 드려요" },
  shipped: { label: "배송시작", hint: "교재가 출발했어요. 받으셨으면 배송완료를 눌러 주세요 — 내역에서 사라져요" },
  cancelled: { label: "취소", hint: "" },
};

/**
 * 현장수령 주문의 학생 화면 이름 (2026-10-07) — 상태 값은 택배와 같고 이름만 다르다. 보내지 않으니 "배송" 이라고 부르지 않는다:
 * 강사가 금액확인 → `입금확인`(그 날짜에 받으러 오면 된다), 조교가 건네면 → `수령완료` (그 주문은 학생 내역에서 사라진다 — `received_at` 을 함께 찍는다).
 */
export const TEXTBOOK_PICKUP_STATUS: Record<string, { label: string; hint: string }> = {
  requested: { label: "주문완료", hint: "입금하시면 강사님이 통장과 대조해 금액을 확인해요" },
  confirmed: { label: "입금확인", hint: "금액이 확인됐어요. 고른 날짜에 학원에서 받아 가세요" },
  shipped: { label: "수령완료", hint: "교재를 받았어요. 확인을 누르면 내역에서 사라져요" },
  cancelled: { label: "취소", hint: "" },
};

/** 받는 방법에 맞는 학생 화면 이름 */
export const textbookStatus = (status: string, pickup: boolean): { label: string; hint: string } =>
  (pickup ? TEXTBOOK_PICKUP_STATUS : TEXTBOOK_STATUS)[status] ?? { label: status, hint: "" };

/** 학생 주문 카드의 안내 한 줄 — 현장수령은 금액이 확인되면 받으러 올 날짜 · 시각을 그대로 적는다 */
export function orderHint(o: { status: string; delivery_method?: string | null; pickup_date?: string | null; pickup_time?: string | null }): string {
  if (isPickup(o) && o.status === "confirmed" && o.pickup_date && o.pickup_time) {
    return `금액이 확인됐어요. ${pickupLabel(o.pickup_date, o.pickup_time)} 학원에서 받아 가세요`;
  }
  return textbookStatus(o.status, isPickup(o)).hint;
}

/** 학생 주문 카드의 단계 — 주문완료 → 배송확인 → 배송시작 (현장수령은 주문완료 → 입금확인 → 수령완료). 취소는 단계가 없다(-1) */
export const ORDER_STEPS = ["requested", "confirmed", "shipped"] as const;
export function orderStepIndex(status: string): number {
  return (ORDER_STEPS as readonly string[]).indexOf(status);
}

/**
 * 강사 · 조교 화면의 상태 이름 (2026-10-02 Alan — "강사가 금액확인을 하고 금액확인 버튼을 눌러주면, 조교들이 배송을 진행 …
 * 배송을 완료하면 배송완료 버튼"). 금액확인은 강사 · 관리자만 (DB 트리거 guard_textbook_order_update 도 본다).
 */
export const TEXTBOOK_ADMIN_STATUS: Record<string, string> = {
  requested: "금액확인 전",
  confirmed: "배송 대기",
  shipped: "배송완료",
  cancelled: "취소",
};

/** 현장수령 주문의 강사 · 조교 화면 이름 (2026-10-07) — 금액확인 뒤 받으러 오기를 기다리고, 건네면 수령완료 */
export const TEXTBOOK_PICKUP_ADMIN_STATUS: Record<string, string> = {
  requested: "금액확인 전",
  confirmed: "수령 대기",
  shipped: "수령완료",
  cancelled: "취소",
};

export const textbookAdminStatus = (status: string, pickup: boolean): string =>
  (pickup ? TEXTBOOK_PICKUP_ADMIN_STATUS : TEXTBOOK_ADMIN_STATUS)[status] ?? status;
