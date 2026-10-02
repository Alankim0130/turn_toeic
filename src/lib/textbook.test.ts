import { describe, expect, it } from "vitest";
import {
  booksForSections,
  bookLabel,
  defaultAccount,
  guideReady,
  itemsForBooks,
  itemsForLevels,
  orderPreset,
  ownedItemIds,
  textbookGuide,
  textbookNotice,
  textbookNoticeMessage,
  textbookOrderError,
  textbookQuote,
  type BookSection,
  type TextbookAccount,
  type TextbookItem,
} from "./textbook";

const LC: TextbookAccount = { id: 1, bank_name: "신한", account_no: "110-1", holder: "이혜영", label: "LC", active: true, sort_order: 0 };
const RC: TextbookAccount = { id: 2, bank_name: "국민", account_no: "220-2", holder: "이영수", label: "RC", active: true, sort_order: 1 };
const item = (id: number, over: Partial<TextbookItem> = {}): TextbookItem => ({
  id,
  name: `교재${id}`,
  level: 650,
  price: 10000,
  account_id: null,
  note: null,
  active: true,
  sort_order: id,
  subject: null,
  book_set: null,
  ...over,
});

describe("학생이 보는 교재 — 내 레벨 + 모든 레벨", () => {
  const all = [item(1, { level: 650 }), item(2, { level: 750 }), item(3, { level: null }), item(4, { level: 650, active: false })];
  it("650 학생은 650 교재와 모든 레벨 교재만 (쓰지 않는 교재는 빼고)", () => {
    expect(itemsForLevels(all, [650]).map((i) => i.id)).toEqual([1, 3]);
  });
  it("속성반처럼 두 레벨이면 둘 다", () => {
    expect(itemsForLevels(all, [650, 850]).map((i) => i.id)).toEqual([1, 3]);
    expect(itemsForLevels(all, [750, 850]).map((i) => i.id)).toEqual([2, 3]);
  });
});

describe("기본 계좌", () => {
  it("설정의 계좌가 쓰는 중이면 그것", () => {
    expect(defaultAccount([LC, RC], { shipping_fee: 0, default_account_id: 2, notice: null })?.id).toBe(2);
  });
  it("설정이 비었거나 그 계좌를 안 쓰면 쓰는 중인 첫 계좌", () => {
    expect(defaultAccount([LC, RC], null)?.id).toBe(1);
    expect(defaultAccount([LC, { ...RC, active: false }], { shipping_fee: 0, default_account_id: 2, notice: null })?.id).toBe(1);
  });
  it("계좌가 하나도 없으면 null", () => {
    expect(defaultAccount([], null)).toBeNull();
  });
});

describe("합계와 계좌별 입금액 (DB 함수 create_textbook_order 와 같은 규칙)", () => {
  const settings = { shipping_fee: 3000, default_account_id: 1, notice: null };

  it("계좌가 하나면 교재 + 배송비가 한 줄", () => {
    const q = textbookQuote([item(1), item(2, { price: 6000 })], [LC], settings);
    expect(q).toMatchObject({ itemsTotal: 16000, shipping: 3000, total: 19000, missingAccount: false });
    expect(q.lines).toEqual([{ account: LC, amount: 19000 }]);
  });

  it("교재마다 계좌가 다르면 계좌별로 나누고 배송비는 기본 계좌로", () => {
    const q = textbookQuote([item(1, { account_id: 1 }), item(2, { price: 8000, account_id: 2 })], [LC, RC], settings);
    expect(q.lines).toEqual([
      { account: LC, amount: 13000 },
      { account: RC, amount: 8000 },
    ]);
  });

  it("쓰지 않는 계좌를 가리키는 교재는 기본 계좌로 간다", () => {
    const q = textbookQuote([item(1, { account_id: 2 })], [LC, { ...RC, active: false }], settings);
    expect(q.lines).toEqual([{ account: LC, amount: 13000 }]);
  });

  it("아무것도 안 고르면 배송비도 없다", () => {
    expect(textbookQuote([], [LC], settings)).toMatchObject({ total: 0, shipping: 0, lines: [] });
  });

  it("낼 돈이 있는데 계좌가 없으면 주문을 받을 수 없다", () => {
    expect(textbookQuote([item(1)], [], settings).missingAccount).toBe(true);
  });

  it("무료 교재만이면 계좌가 없어도 된다", () => {
    expect(textbookQuote([item(1, { price: 0 })], [], { shipping_fee: 0, default_account_id: null, notice: null }).missingAccount).toBe(false);
  });
});

describe("주문 오류 문구", () => {
  it("DB 함수의 오류 이름을 학생 말로 바꾼다", () => {
    expect(textbookOrderError('duplicate')).toContain("이미 주문");
    expect(textbookOrderError("not_eligible")).toContain("불라방");
    expect(textbookOrderError("no_account")).toContain("계좌");
    expect(textbookOrderError("depositor")).toContain("입금자명");
    expect(textbookOrderError(undefined)).toContain("다시 시도");
  });
});

// ─── 내 반 교재 (2026-10-02 Alan — "주5일은 4권이라서 4만원이고, 주3일과 주5일 60분이면 2권이야") ───
// 10월 편성 그대로 (CLAUDE.md 도메인 규칙 1 — 달이 바뀌면 과정 글자만 뒤집힌다):
//   650 10:00 = B 과정(월수금 RC · 화목금 LC) · 11:10 = A 과정(월수금 LC · 화목금 RC)
//   850 12:30 = B 과정(월수금 RC · 화목금 LC) · 13:50 = A 과정(월수금 LC · 화목금 RC)
describe("내 반 교재 — 시간 단위 반의 과목 × 과정에서 나온다", () => {
  const sec = (id: number, level: number | null, subject: string | null, book_set: string | null): BookSection => ({ id, level, subject, book_set });
  const S = new Map<number, BookSection>(
    [
      sec(101, 650, "rc", "B"), // 650 월수금 10:00~11:00
      sec(102, 650, "lc", "B"), // 650 화목금 10:00~11:00
      sec(103, 650, "lc", "A"), // 650 월수금 11:10~12:10
      sec(104, 650, "rc", "A"), // 650 화목금 11:10~12:10
      sec(105, 650, null, null), // 650 월수금 10:00~12:10 (묶음)
      sec(106, 650, null, null), // 650 화목금 10:00~12:10 (묶음)
      sec(201, 850, "rc", "B"), // 850 월수금 12:30~13:40
      sec(202, 850, "lc", "B"), // 850 화목금 12:30~13:40
      sec(301, 650, null, null), // 스파르타 650 월수금 10:00~13:40
      sec(302, 650, null, null), // 스파르타 650 화목금 10:00~13:40
      sec(401, 650, null, "A"), // 방학달 통짜 120분 — 두 과목을 이어 들어 과목 칸이 비어 있다
    ].map((s) => [s.id, s]),
  );
  const I = new Map<number, number[]>([
    [105, [101, 103]],
    [106, [102, 104]],
    [301, [101, 103, 201]],
    [302, [102, 104, 202]],
  ]);
  const books = (direct: number[], includes = I) => booksForSections(direct, includes, S);
  const labels = (direct: number[]) => books(direct).keys.map(bookLabel);

  it("주5일 120분 = 4권 (월수금 · 화목금 × 두 시간)", () => {
    expect(labels([105, 106])).toEqual(["650 LC A과정", "650 LC B과정", "650 RC A과정", "650 RC B과정"]);
    expect(books([105, 106]).unknown).toBe(false);
  });

  it("주3일 120분 = 2권 — 두 시간의 과정이 다르다", () => {
    expect(labels([105])).toEqual(["650 LC A과정", "650 RC B과정"]);
    expect(labels([106])).toEqual(["650 LC B과정", "650 RC A과정"]);
  });

  it("주5일 60분 = 2권 — 같은 시간, 같은 과정의 RC · LC", () => {
    expect(labels([101, 102])).toEqual(["650 LC B과정", "650 RC B과정"]);
    expect(labels([103, 104])).toEqual(["650 LC A과정", "650 RC A과정"]);
  });

  it("주3일 60분(단과)은 그 시간 한 권", () => {
    expect(labels([101])).toEqual(["650 RC B과정"]);
  });

  it("속성반은 함께 듣는 850 시간 교재까지 — 650 네 권 + 850 두 권", () => {
    expect(labels([301, 302])).toEqual(["650 LC A과정", "650 LC B과정", "650 RC A과정", "650 RC B과정", "850 LC B과정", "850 RC B과정"]);
  });

  it("같은 교재는 한 번만 센다 (묶음 반과 그 안의 시간 단위 반이 함께 배정돼 있어도)", () => {
    expect(labels([105, 101, 103])).toEqual(["650 LC A과정", "650 RC B과정"]);
  });

  it("과목 · 과정이 빈 반은 짐작하지 않는다 — 방학달 통짜 반 · 품은 반을 못 읽은 묶음 반", () => {
    expect(books([401])).toEqual({ keys: [], unknown: true });
    // 품는 관계를 읽지 못하면 묶음 반이 그대로 남는다 → 정하지 않는다 (60분 반은 그대로 센다)
    expect(books([105, 101], new Map())).toEqual({ keys: [{ level: 650, subject: "rc", set: "B" }], unknown: true });
    expect(books([999]).unknown).toBe(true);
  });
});

describe("교재비 안내 — 등록 교재 · 지난 주문 · 계좌", () => {
  // 마이그레이션 20261002233000 이 넣는 처음 값과 같은 꼴: 레벨마다 LC A · LC B · RC A · RC B, 권당 10,000원
  const seeded: TextbookItem[] = [650, 750, 850].flatMap((level, li) =>
    (["lc", "rc"] as const).flatMap((subject, si) =>
      (["A", "B"] as const).map((set, bi) => {
        const id = li * 4 + si * 2 + bi + 1;
        return item(id, { name: `${level} ${subject.toUpperCase()} ${set}과정`, level, subject, book_set: set, price: 10000, sort_order: id });
      }),
    ),
  );
  // 저장소가 공개라 실제 계좌번호를 적지 않는다
  const ACC: TextbookAccount = { id: 7, bank_name: "하나은행", account_no: "000-000000-00000", holder: "이영수", label: null, active: true, sort_order: 0 };
  const settings = { shipping_fee: 4500, default_account_id: null, notice: null };
  const key = (level: number, subject: "lc" | "rc", set: "A" | "B") => ({ level, subject, set });
  const week5 = { keys: [key(650, "lc", "A"), key(650, "lc", "B"), key(650, "rc", "A"), key(650, "rc", "B")], unknown: false };

  it("주5일 = 4권 40,000원 + 배송비 4,500원", () => {
    const g = textbookGuide({ books: week5, items: seeded, accounts: [ACC], settings, ownedItemIds: new Set() });
    expect(g.picked.map((i) => i.name)).toEqual(["650 LC A과정", "650 LC B과정", "650 RC A과정", "650 RC B과정"]);
    expect(g.quote).toMatchObject({ itemsTotal: 40000, shipping: 4500, total: 44500 });
    expect(guideReady(g)).toBe(true);
  });

  it("주3일 · 주5일 60분 = 2권 20,000원 + 배송비", () => {
    const g = textbookGuide({ books: { keys: [key(650, "lc", "A"), key(650, "rc", "B")], unknown: false }, items: seeded, accounts: [ACC], settings, ownedItemIds: new Set() });
    expect(g.quote).toMatchObject({ itemsTotal: 20000, total: 24500 });
  });

  it("지난 주문에서 받은 교재는 뺀다 — 둘째 달 주5일은 새로 살 책이 없고, 주3일은 반대 과정 두 권만", () => {
    const all = ownedItemIds([{ status: "shipped", term_id: 9, items: seeded.slice(0, 4).map((i) => ({ id: i.id })) }], 10);
    const again = textbookGuide({ books: week5, items: seeded, accounts: [ACC], settings, ownedItemIds: all });
    expect(again.picked).toEqual([]);
    expect(again.owned).toHaveLength(4);
    expect(guideReady(again)).toBe(false);

    // 9월 주3일 월수금 = RC A · LC B 를 받았다 → 10월 주3일 월수금 = LC A · RC B 는 새로
    const sept = ownedItemIds([{ status: "confirmed", term_id: 9, items: [{ id: 3 }, { id: 2 }] }], 10);
    const oct = textbookGuide({ books: { keys: [key(650, "lc", "A"), key(650, "rc", "B")], unknown: false }, items: seeded, accounts: [ACC], settings, ownedItemIds: sept });
    expect(oct.picked.map((i) => i.id)).toEqual([1, 4]);
  });

  it("지난 주문 — 취소한 주문 · 이 달 주문 · 예전 꼴(교재 없음)은 세지 않는다", () => {
    const owned = ownedItemIds(
      [
        { status: "cancelled", term_id: 9, items: [{ id: 1 }] },
        { status: "requested", term_id: 10, items: [{ id: 2 }] },
        { status: "shipped", term_id: 8, items: [] },
        { status: "shipped", term_id: 8, items: null },
        { status: "shipped", term_id: 7, items: [{ id: 3 }, { name: "이름만" }] },
      ],
      10,
    );
    expect([...owned]).toEqual([3]);
  });

  it("강사가 아직 등록하지 않은 교재 · 정하지 못한 반 · 계좌가 없으면 안내를 보내지 않는다", () => {
    const noRcB = seeded.map((i) => (i.id === 4 ? { ...i, active: false } : i));
    const g1 = textbookGuide({ books: week5, items: noRcB, accounts: [ACC], settings, ownedItemIds: new Set() });
    expect(itemsForBooks(noRcB, week5.keys).missing).toEqual([key(650, "rc", "B")]);
    expect(guideReady(g1)).toBe(false);
    expect(guideReady(textbookGuide({ books: { ...week5, unknown: true }, items: seeded, accounts: [ACC], settings, ownedItemIds: new Set() }))).toBe(false);
    expect(guideReady(textbookGuide({ books: week5, items: seeded, accounts: [], settings, ownedItemIds: new Set() }))).toBe(false);
  });

  it("과목 · 과정을 안 고른 교재(학생이 직접 고르는 것)는 내 반 교재에 들지 않는다", () => {
    const vocab = item(99, { name: "단어장", level: null, price: 8000 });
    expect(itemsForBooks([...seeded, vocab], week5.keys).items.map((i) => i.id)).not.toContain(99);
  });

  it("안내 글 — 권수 · 금액 · 계좌를 적고 알림함 길이(제목 80 · 본문 1,000자)를 넘지 않는다", () => {
    const g = textbookGuide({ books: week5, items: seeded, accounts: [ACC], settings, ownedItemIds: new Set() });
    const n = textbookNotice(10, g)!;
    expect(n).toMatchObject({ month: 10, itemsTotal: 40000, shipping: 4500, total: 44500, owned: 0 });
    expect(n.pay).toEqual([{ bank: "하나은행", accountNo: "000-000000-00000", holder: "이영수", label: null, amount: 44500 }]);

    const m = textbookNoticeMessage(n);
    expect(m.title).toBe("10월 불라방 교재비 안내");
    expect(m.body).toContain("교재 4권 · 40,000원");
    expect(m.body).toContain("배송비 4,500원");
    expect(m.body).toContain("합계 44,500원");
    expect(m.body).toContain("하나은행 000-000000-00000 · 예금주 이영수 · 44,500원");

    // 가장 긴 경우 — 속성반 8권 + 계좌 둘
    const two = { ...ACC, id: 8, label: "배송비", account_no: "111-111111-11111" };
    const long = textbookNoticeMessage({ ...n, books: Array.from({ length: 8 }, (_, i) => `아주 긴 교재 이름을 적은 경우 ${i + 1}권째 교재`), pay: [n.pay[0], { ...n.pay[0], label: two.label, accountNo: two.account_no }], owned: 2 });
    expect(long.title.length).toBeLessThanOrEqual(80);
    expect(long.body.length).toBeLessThanOrEqual(1000);
    expect(long.body).toContain("[배송비]");
    expect(long.body).toContain("지난 주문에서 받은 교재 2권은 뺐어요");
  });

  it("보낼 수 없는 안내는 만들지 않는다", () => {
    expect(textbookNotice(10, textbookGuide({ books: week5, items: seeded, accounts: [], settings, ownedItemIds: new Set() }))).toBeNull();
  });
});

describe("주문 화면에 골라 둘 교재", () => {
  const books = [
    item(1, { name: "650 LC A과정", subject: "lc", book_set: "A" }),
    item(2, { name: "650 RC B과정", subject: "rc", book_set: "B" }),
  ];
  const keys = [
    { level: 650, subject: "lc" as const, set: "A" as const },
    { level: 650, subject: "rc" as const, set: "B" as const },
  ];
  const guide = (owned: number[], unknown = false, items = books) =>
    textbookGuide({ books: { keys, unknown }, items, accounts: [LC], settings: null, ownedItemIds: new Set(owned) });

  it("내 반 교재를 골라 두고 몇 권인지 말한다 — 지난 주문에서 받은 것은 빼고", () => {
    expect(orderPreset(guide([]))).toEqual({ recommended: [1, 2], note: "내 반 교재 2권을 골라 뒀어요." });
    expect(orderPreset(guide([1]))).toEqual({ recommended: [2], note: "내 반 교재 1권을 골라 뒀어요. 지난 주문에서 받은 1권은 뺐어요." });
  });

  it("다 받았으면 아무것도 골라 두지 않는다", () => {
    expect(orderPreset(guide([1, 2]))).toEqual({ recommended: [], note: "내 반 교재는 지난 주문에서 모두 받았어요. 더 필요한 교재가 있으면 골라 주세요." });
  });

  it("정하지 못했으면 골라 두지 않는다 (예전처럼 학생이 고른다) · 등록 안 된 교재는 이름을 적는다", () => {
    expect(orderPreset(guide([], true))).toEqual({ recommended: null, note: "내 반 교재를 정하지 못했어요 — 필요한 교재를 직접 골라 주세요." });
    expect(orderPreset(guide([], false, [books[0]]))).toEqual({ recommended: [1], note: "내 반 교재 1권을 골라 뒀어요. 아직 등록되지 않은 교재: 650 RC B과정" });
  });
});
