// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import fs from "node:fs";
import path from "node:path";
import { monthDay, orderBookCount, orderDeliveryText, orderMoneyText, type OrderCardInput } from "@/lib/textbook-order-card";
import type { AdminOrder } from "@/components/admin/textbook-orders/OrderParts";

/**
 * 교재주문 화면의 휴대폰 카드 (2026-10-27 Alan — "지금 배송페이지를 보면 화면을 오른쪽으로 많이 넘겨야지 보여. Pc에서는 저렇게 보여도 괜찮은데,
 * 모바일에서는 쫌 불편해. 한화면에서 직관적으로 처리하는게 안될까? 예를들면 학생의 교재주문신청을 간략하게 보여주고, 그 학생을 클릭하면 상세정보가 나오도록!").
 * 닫힌 카드의 글자 규칙 · 실제로 그린 카드(닫힘 → 열면 상세와 처리) · 화면 파일(휴대폰은 카드 · PC 는 표, 처리는 한 조각)을 본다.
 * 이름 · 번호 · 주소는 지어낸 것이다.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const base: OrderCardInput = {
  status: "requested",
  delivery_method: "parcel",
  items: [
    { id: 1, name: "750 LC A과정", price: 10000 },
    { id: 2, name: "750 RC A과정", price: 10000 },
  ],
  quantity: 2,
  total_amount: 24500,
  pickup_date: null,
  pickup_time: null,
  address: "테스트시 테스트구 테스트로 1",
  address_detail: "101동 202호",
  tracking_no: null,
  received_at: null,
};

describe("닫힌 카드의 글자 (src/lib/textbook-order-card.ts)", () => {
  it("주문한 날은 한국 날짜 '10/27' — 밤 11시 59분(한국)도 그 날이다 · 못 읽으면 빈 글자", () => {
    expect(monthDay("2026-10-27T05:34:00Z")).toBe("10/27");
    expect(monthDay("2026-10-27T14:59:00Z")).toBe("10/27");
    expect(monthDay("2026-10-27T15:01:00Z")).toBe("10/28");
    expect(monthDay("2026-01-05T00:00:00+09:00")).toBe("1/5");
    expect(monthDay("")).toBe("");
    expect(monthDay(null)).toBe("");
    expect(monthDay("엉터리")).toBe("");
  });

  it("교재 몇 권 · 합계 — 교재 목록이 없는 예전 주문은 권수로", () => {
    expect(orderBookCount(base)).toBe(2);
    expect(orderMoneyText(base)).toBe("교재 2권 · 24,500원");
    expect(orderBookCount({ items: [], quantity: 3 })).toBe(3);
    expect(orderMoneyText({ items: [], quantity: 1, total_amount: 0 })).toBe("교재 1권");
    expect(orderMoneyText({ items: null, quantity: 4, total_amount: 44500 })).toBe("교재 4권 · 44,500원");
  });

  it("택배 — 송장이 있으면 송장, 없으면 주소. 배송완료면 학생이 받았는지까지", () => {
    expect(orderDeliveryText(base)).toBe("택배 · 테스트시 테스트구 테스트로 1 101동 202호");
    expect(orderDeliveryText({ ...base, status: "confirmed", tracking_no: " 123456789012 " })).toBe("송장 123456789012");
    expect(orderDeliveryText({ ...base, status: "shipped", tracking_no: "123456789012" })).toBe("송장 123456789012 · 학생 수령 확인 전");
    expect(orderDeliveryText({ ...base, status: "shipped", tracking_no: "123456789012", received_at: "2026-10-29T03:00:00Z" })).toBe(
      "송장 123456789012 · 학생 수령 확인 10/29",
    );
    expect(orderDeliveryText({ ...base, status: "shipped" })).toBe("택배 · 학생 수령 확인 전");
    expect(orderDeliveryText({ ...base, address: null, address_detail: null })).toBe("택배 · 주소 없음");
    expect(orderDeliveryText({ ...base, address_detail: "  " })).toBe("택배 · 테스트시 테스트구 테스트로 1");
  });

  it("현장수령 — 받으러 올 날짜 · 시각, 건넸으면 받아 간 날", () => {
    const pickup = { ...base, delivery_method: "pickup", address: null, address_detail: null, pickup_date: "2026-10-28", pickup_time: "14:00:00" };
    expect(orderDeliveryText(pickup)).toBe("현장수령 · 10월 28일 (수) 오후 2시쯤");
    expect(orderDeliveryText({ ...pickup, status: "confirmed", pickup_time: "18:30" })).toBe("현장수령 · 10월 28일 (수) 오후 6시 30분쯤");
    expect(orderDeliveryText({ ...pickup, status: "shipped", received_at: "2026-10-28T05:10:00Z" })).toBe("현장수령 · 10/28 학원에서 받아 감");
    expect(orderDeliveryText({ ...pickup, status: "shipped" })).toBe("현장수령 · 건넴");
    expect(orderDeliveryText({ ...pickup, pickup_date: null })).toBe("현장수령 · 받으러 올 날짜 없음");
  });
});

// ─── 실제로 그린 카드 ───────────────────────────────────────────────

const h = vi.hoisted(() => ({ calls: [] as string[] }));
vi.mock("@/app/admin/textbook-orders/actions", () => ({
  confirmTextbookPayment: async () => void h.calls.push("confirm"),
  markTextbookShipped: async () => void h.calls.push("shipped"),
  markTextbookPickedUp: async () => void h.calls.push("picked"),
  updateTextbookOrder: async () => void h.calls.push("update"),
}));

const { OrderCard } = await import("@/components/admin/textbook-orders/OrderCard");

const order = (patch: Partial<AdminOrder> = {}): AdminOrder => ({
  id: 41,
  user_id: "00000000-0000-0000-0000-000000000001",
  status: "requested",
  delivery_method: "parcel",
  items: base.items as AdminOrder["items"],
  items_total: 20000,
  quantity: 2,
  shipping_fee: 4500,
  total_amount: 24500,
  depositor_name: "가나다",
  pay_to: [],
  recipient_name: "가나다",
  phone: "010-0000-0000",
  postal_code: null,
  address: "테스트시 테스트구 테스트로 1",
  address_detail: "101동 202호",
  memo: null,
  pickup_date: null,
  pickup_time: null,
  tracking_no: null,
  received_at: null,
  section_id: 5,
  section_ids: [5, 6],
  term_id: 3,
  created_at: "2026-10-27T05:34:00Z",
  updated_at: "2026-10-27T05:34:00Z",
  ...patch,
});

let root: Root | null = null;
let host: HTMLElement | null = null;

beforeEach(() => {
  h.calls = [];
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function render(o: AdminOrder, props: Partial<{ staff: boolean; open: boolean }> = {}) {
  act(() =>
    root!.render(
      createElement(
        "ul",
        null,
        createElement(OrderCard, {
          o,
          student: "가나다",
          classLines: [{ key: "5-6", label: "10월 · 750+ · 주5일 10:00~11:00", single: null }],
          classFallback: ["10월 · 750+ 유형마스터", "월수금 10:00~11:00"],
          staff: props.staff ?? true,
          back: "/admin/textbook-orders?status=requested",
          used: [],
          open: props.open,
        }),
      ),
    ),
  );
}
const details = () => host!.querySelector("details")!;
const summary = () => host!.querySelector("summary")!;
const content = () => details().querySelector(":scope > div")!;
const buttons = () => [...content().querySelectorAll("button")].map((b) => b.textContent?.trim());

describe("휴대폰 카드 (src/components/admin/textbook-orders/OrderCard.tsx)", () => {
  it("닫힌 채로 선다 — 이름 · 상태 · 교재 몇 권 · 합계 · 입금자 · 받는 방법 · 주문한 날만", () => {
    render(order());
    expect(details().open).toBe(false);
    const s = summary().textContent ?? "";
    expect(s).toContain("가나다");
    expect(s).toContain("금액확인 전");
    expect(s).toContain("교재 2권 · 24,500원 · 입금자 가나다");
    expect(s).toContain("택배 · 테스트시 테스트구 테스트로 1 101동 202호");
    expect(s).toContain("10/27");
    // 닫힌 줄에는 누르는 것을 넣지 않는다 — 줄 전체가 여닫는 곳이다
    expect(summary().querySelectorAll("a, button, input, form")).toHaveLength(0);
    // 카드의 주소는 표의 줄(order-41)과 다르다 — 둘 다 그려져 있다
    expect(host!.querySelector("li")!.id).toBe("order-m-41");
  });

  it("입금자를 안 적었으면 빨갛게 — 강사님이 통장과 대조하는 줄이다", () => {
    render(order({ depositor_name: null }));
    const red = summary().querySelector("b.text-red-700");
    expect(red?.textContent).toBe("입금자 미입력");
  });

  it("열면 상세 — 반 · 교재 · 받는 분 · 전화(누르면 걸린다) · 주소 · 주문일", () => {
    render(order({ tracking_no: null }), { open: true });
    expect(details().open).toBe(true);
    const c = content().textContent ?? "";
    for (const want of ["10월 · 750+ · 주5일 10:00~11:00", "750 LC A과정", "750 RC A과정", "배송비 4,500원", "합계 24,500원", "입금자 가나다", "101동 202호", "10월 27일"]) {
      expect(c).toContain(want);
    }
    expect(content().querySelector('a[href="tel:010-0000-0000"]')?.textContent).toBe("010-0000-0000");
  });

  it("금액확인 전 — 강사 · 관리자는 금액확인, 조교는 기다림 안내 (둘 다 상태 직접 바꾸기는 있다)", () => {
    render(order(), { staff: true });
    expect(buttons()).toContain("금액확인");
    expect(content().textContent).toContain("상태 직접 바꾸기");
    render(order(), { staff: false });
    expect(buttons()).not.toContain("금액확인");
    expect(content().textContent).toContain("강사님 금액확인을 기다려요");
  });

  it("배송 대기(택배) — 송장 칸 + QR 찍기 + 배송완료. 칸은 16px 라 아이폰이 누를 때 화면을 확대하지 않는다", () => {
    render(order({ status: "confirmed" }), { staff: false });
    expect(buttons()).toContain("배송완료");
    expect(buttons()).toContain("QR 찍기");
    const forms = [...content().querySelectorAll("form")];
    const ship = forms.find((f) => f.textContent?.includes("배송완료"))!;
    const input = ship.querySelector<HTMLInputElement>('input[name="tracking_no"]')!;
    expect(input).toBeTruthy();
    // 16px(.input 의 text-base) — text-xs 를 붙이면 아이폰이 칸을 누를 때 화면을 확대한다
    expect(input.className).not.toMatch(/\btext-xs\b/);
    expect(new FormData(ship).get("order_id")).toBe("41");
    expect(new FormData(ship).get("back")).toBe("/admin/textbook-orders?status=requested");
  });

  it("수령 대기(현장수령) — 수령완료만, 송장 칸 · QR 찍기는 없다", () => {
    render(order({ status: "confirmed", delivery_method: "pickup", address: null, address_detail: null, pickup_date: "2026-10-28", pickup_time: "14:00:00" }));
    expect(summary().textContent).toContain("수령 대기");
    expect(summary().textContent).toContain("현장수령 · 10월 28일 (수) 오후 2시쯤");
    expect(buttons()).toContain("수령완료");
    expect(buttons()).not.toContain("배송완료");
    expect(buttons()).not.toContain("QR 찍기");
  });

  it("배송완료 — 처리할 것은 상태 직접 바꾸기뿐, 받은 확인은 상세에도", () => {
    render(order({ status: "shipped", tracking_no: "123456789012", received_at: "2026-10-29T03:00:00Z" }));
    expect(summary().textContent).toContain("배송완료");
    expect(summary().textContent).toContain("송장 123456789012 · 학생 수령 확인 10/29");
    expect(buttons()).not.toContain("배송완료");
    expect(buttons()).not.toContain("금액확인");
    expect(content().textContent).toContain("학생 수령 확인 · 10. 29.");
  });
});

// ─── 화면 파일 ───────────────────────────────────────────────

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("교재주문 화면 — 목록 (src/components/admin/textbook-orders/OrderList.tsx) · 화면 파일", () => {
  const list = code("src/components/admin/textbook-orders/OrderList.tsx");
  const page = code("src/app/admin/textbook-orders/page.tsx");

  it("휴대폰 · 태블릿(lg 미만)은 카드, PC 는 표 — 둘 다 그리고 폭으로 하나를 숨긴다", () => {
    expect(list).toMatch(/<ul className="space-y-2 lg:hidden"[^>]*>\s*\{orders\.map\(\(e\) => \(\s*<OrderCard\b/);
    expect(list).toMatch(/<TableWrap className="hidden lg:block">/);
    expect(page).toMatch(/<OrderList orders=\{orders\} staff=\{staff\} back=\{back\} used=\{usedTracking\} openId=\{openId\} \/>/);
  });

  it("처리는 한 조각(OrderActions) — 표와 카드가 같은 폼을 쓴다. 목록 · 화면 파일이 서버 액션을 따로 부르지 않는다", () => {
    expect(list).toMatch(/<OrderActions o=\{o\} staff=\{staff\} back=\{back\} used=\{used\} className="min-w-\[15rem\]" \/>/);
    expect(read("src/components/admin/textbook-orders/OrderCard.tsx")).toMatch(/<OrderActions o=\{o\} staff=\{staff\} back=\{back\} used=\{used\} size="md" \/>/);
    for (const action of ["confirmTextbookPayment", "markTextbookShipped", "markTextbookPickedUp", "updateTextbookOrder"]) {
      expect(list, action).not.toContain(action);
      expect(page, action).not.toContain(action);
    }
  });

  it("현장수령 예정에서 누르면 휴대폰은 그 카드를 열어서, PC 는 표의 줄로 — 카드와 줄의 주소가 다르다", () => {
    const pickup = code("src/components/admin/textbook-orders/PickupSchedule.tsx");
    expect(pickup).toContain("href={`/admin/textbook-orders?status=${o.status}&open=${o.id}#order-m-${o.id}`} className={cn(\"flex lg:hidden\", row)}");
    expect(pickup).toContain("href={`/admin/textbook-orders?status=${o.status}#order-${o.id}`} className={cn(\"hidden lg:flex\", row)}");
    expect(list).toContain('<tr key={o.id} id={`order-${o.id}`}');
    expect(read("src/components/admin/textbook-orders/OrderCard.tsx")).toContain('<li id={`order-m-${o.id}`}');
    expect(page).toMatch(/const openId = Number\(openParam\) \|\| null;/);
  });

  it("카드는 팝업이 아니다 — 그 안의 QR 찍기가 카메라 창(팝업)을 연다", () => {
    const card = code("src/components/admin/textbook-orders/OrderCard.tsx");
    expect(card).toMatch(/<details className="group\/order"/);
    expect(card).not.toMatch(/createPortal|<Dialog\b|fixed inset-0/);
  });
});
