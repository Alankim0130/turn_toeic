import { describe, expect, it } from "vitest";
import { defaultAccount, itemsForLevels, textbookOrderError, textbookQuote, type TextbookAccount, type TextbookItem } from "./textbook";

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
