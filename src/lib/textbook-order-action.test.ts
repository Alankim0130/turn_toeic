import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 불라방 교재 주문 서버 액션(`submitTextbookOrder`)을 가짜 DB 로 실제로 돌려 본다 (2026-10-27 Alan — "이제는 자동시스템이니 선택할 수 없게,
 * 본인 레벨에 맞는 교재만 딱 보이도록"). 화면에는 체크 칸이 없지만 주소를 바로 불러 다른 교재를 보낼 수 있으니 서버가 같은 계산으로 다시 본다:
 *   - 내 반 교재와 똑같으면 그 교재로 주문 함수를 부른다
 *   - 하나라도 다르면(더했다 · 뺐다 · 그 사이 강사가 교재를 바꿨다) 주문하지 않고 화면을 새로 그린다
 *   - 새로 살 교재가 없으면 주문하지 않는다
 *   - 내 반 교재를 정하지 못한 달(방학달 통짜 반 등)만 학생이 고른 교재를 그대로 보낸다
 */

const h = vi.hoisted(() => ({
  revalidated: [] as string[],
  rpcs: [] as { name: string; args: Record<string, unknown> }[],
  orders: [] as unknown[],
  myOrders: [] as unknown[],
  items: [] as unknown[],
  itemsError: null as { message: string } | null,
  removed: [] as string[],
  attachError: null as string | null,
}));

vi.mock("next/cache", () => ({ revalidatePath: (p: string) => void h.revalidated.push(p) }));
vi.mock("next/server", () => ({ after: () => undefined }));
vi.mock("@/lib/push", () => ({ notifyStaff: async () => undefined }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/supabase/server", () => {
  // 교재 · 계좌 · 배송비 조회와 RPC 만 흉내 낸다 (학생 세션 — 로그인한 사람의 것)
  const table = (name: string) => {
    const answer = () => {
      if (name === "textbook_items") return { data: h.itemsError ? null : h.items, error: h.itemsError };
      if (name === "textbook_accounts")
        return { data: [{ id: 7, bank_name: "하나은행", account_no: "000-000000-00000", holder: "이영수", label: null, active: true, sort_order: 0 }], error: null };
      if (name === "textbook_settings") return { data: { shipping_fee: 4500, default_account_id: null, notice: null }, error: null };
      if (name === "class_sections") return { data: [], error: null };
      throw new Error(`모르는 표 ${name}`);
    };
    const b = {
      select: () => b,
      eq: () => b,
      in: () => b,
      maybeSingle: () => Promise.resolve(answer()),
      then: (ok: (r: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(answer()).then(ok, bad),
    };
    return b;
  };
  const client = {
    from: table,
    // 이체 캡처 (2026-11-04 · 2026-11-05 필수) — 로그인한 사람 · 저장소 지우기
    auth: { getUser: async () => ({ data: { user: { id: "00000000-0000-0000-0000-000000000001" } } }) },
    storage: { from: () => ({ remove: async (paths: string[]) => void h.removed.push(...paths), list: async () => ({ data: [] }) }) },
    rpc: (name: string, args: Record<string, unknown> = {}) => {
      h.rpcs.push({ name, args });
      if (name === "term_section_includes") return Promise.resolve({ data: [], error: null });
      if (name === "create_textbook_order") return Promise.resolve({ data: 555, error: null });
      if (name === "textbook_pickup_days") return Promise.resolve({ data: [], error: null });
      if (name === "attach_textbook_transfer") return Promise.resolve(h.attachError ? { data: null, error: { message: h.attachError } } : { data: null, error: null });
      return Promise.resolve({ data: null, error: { message: `모르는 함수 ${name}` } });
    },
  };
  return { createClient: async () => client };
});
vi.mock("@/app/my/_lib/queries", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/my/_lib/queries")>()),
  getMyOrders: async () => h.orders,
  getMyTextbookOrders: async () => h.myOrders,
}));

const { submitTextbookOrder } = await import("@/app/my/textbook/actions");

const course = { name: "750+ 유형마스터", course_type: "full", target_score: 750, program: "score", includes_levels: [] };
const section = (id: number, track: string, subject: string | null, book_set: string | null, time_block = "10:00~11:00") => ({
  id,
  course_id: 2,
  term_id: 10,
  track,
  start_time: null,
  end_time: null,
  time_block,
  enrollment_opens_at: "2026-10-06",
  closes_at: "2099-12-31",
  status: "open",
  book_set,
  subject,
  recorded: false,
  live_to_replay: true,
  course,
  term: { year: 2026, month: 10 },
});
/** 750 주5일 60분 불라방 — 월수금 RC A · 화목금 LC A (2026-10-27 실제로 있던 등록의 모양) */
const week5Order = (sections = [section(101, "mwf", "rc", "A"), section(102, "ttf", "lc", "A")]) => [
  { id: 1, status: "active", activates_on: "2026-10-06", access_until: "2099-12-31", created_at: "2026-10-01", enrollments: sections.map((s, i) => ({ id: 11 + i, status: "active", mode: "live", section: s })) },
];
const book = (id: number, name: string, subject: string | null, set: string | null, level: number | null = 750) => ({
  id,
  name,
  level,
  price: 10000,
  account_id: null,
  note: null,
  active: true,
  sort_order: id,
  subject,
  book_set: set,
});

const UID = "00000000-0000-0000-0000-000000000001";
/** 이체 캡처 — 주문 폼이 저장소에 먼저 올리고 싣는 네 칸 (2026-11-05 부터 없으면 주문을 받지 않는다) */
const TRANSFER = { transfer_path: `${UID}/shot.png`, transfer_name: "shot.png", transfer_size: "1234", transfer_type: "image/png" };

function form(itemIds: number[], over: Record<string, string> = {}, transfer: Record<string, string> | null = TRANSFER) {
  const f = new FormData();
  const v = { term_id: "10", recipient_name: "가나다", phone: "01000000000", address: "부산 어딘가 1", address_detail: "101호", depositor_name: "가나다", delivery: "parcel", ...transfer, ...over };
  for (const [k, x] of Object.entries(v)) f.set(k, x);
  for (const id of itemIds) f.append("item_id", String(id));
  return f;
}
const orderCalls = () => h.rpcs.filter((r) => r.name === "create_textbook_order");
const attachCalls = () => h.rpcs.filter((r) => r.name === "attach_textbook_transfer");

beforeEach(() => {
  h.revalidated.length = 0;
  h.rpcs.length = 0;
  h.removed.length = 0;
  h.attachError = null;
  h.orders = week5Order();
  h.myOrders = [];
  h.items = [book(5, "750 RC A과정", "rc", "A"), book(6, "750 LC A과정", "lc", "A"), book(7, "750 LC B과정", "lc", "B"), book(9, "단어장", null, null, null)];
  h.itemsError = null;
});

describe("불라방 교재 주문 — 서버가 내 반 교재로 다시 본다 (2026-10-27)", () => {
  it("내 반 교재(주5일 60분 = RC A · LC A)와 똑같으면 그 교재로 주문하고, 이체 캡처를 그 주문에 붙인다", async () => {
    const r = await submitTextbookOrder({}, form([6, 5]));
    expect(r).toEqual({ ok: true, transfer: "attached" });
    expect(orderCalls()).toHaveLength(1);
    expect(orderCalls()[0].args).toMatchObject({ p_term_id: 10, p_item_ids: [5, 6], p_address: "부산 어딘가 1", p_address_detail: "101호" });
    expect(attachCalls()).toHaveLength(1);
    expect(attachCalls()[0].args).toEqual({ p_id: 555, p_path: `${UID}/shot.png`, p_type: "image/png", p_size: 1234, p_name: "shot.png" });
    expect(h.removed).toEqual([]);
  });

  it("2026-11-05 이체 캡처가 없으면 주문을 받지 않는다 (Alan '스크린샷을 올려야지 주문이 완료되도록') — 남의 폴더 · 사진 아닌 것도", async () => {
    const r = await submitTextbookOrder({}, form([6, 5], {}, null));
    expect(r.error).toBe("이체 화면 캡처를 올려 주세요. 캡처를 올려야 주문이 완료돼요.");
    expect((await submitTextbookOrder({}, form([6, 5], { transfer_path: "other/shot.png" }))).error).toContain("경로");
    expect((await submitTextbookOrder({}, form([6, 5], { transfer_type: "application/pdf", transfer_name: "a.pdf" }))).error).toContain("사진 파일");
    expect(orderCalls()).toHaveLength(0);
    expect(attachCalls()).toHaveLength(0);
  });

  it("주문은 됐는데 캡처를 못 붙이면 — 주문은 그대로, 올린 파일은 지우고 '다시 올려 주세요'", async () => {
    h.attachError = "not_requested";
    const r = await submitTextbookOrder({}, form([6, 5]));
    expect(r).toEqual({ ok: true, transfer: "failed" });
    expect(orderCalls()).toHaveLength(1);
    expect(h.removed).toEqual([`${UID}/shot.png`]);
  });

  it("교재를 더하거나 빼서 보내면 주문하지 않고 화면을 새로 그린다", async () => {
    for (const ids of [[5, 6, 7], [5], [5, 6, 9], [7, 9]]) {
      h.revalidated.length = 0;
      const r = await submitTextbookOrder({}, form(ids));
      expect(r.error).toBe("내 반 교재가 바뀌었어요. 바뀐 교재를 확인하고 다시 주문해 주세요.");
      expect(h.revalidated).toEqual(["/my/textbook"]);
    }
    expect(orderCalls()).toHaveLength(0);
  });

  it("지난 주문에서 다 받았으면 새로 주문할 교재가 없다", async () => {
    h.myOrders = [{ status: "shipped", term_id: 9, items: [{ id: 5 }, { id: 6 }] }];
    const r = await submitTextbookOrder({}, form([5, 6]));
    expect(r.error).toBe("새로 주문할 교재가 없어요.");
    expect(orderCalls()).toHaveLength(0);
  });

  it("지난 주문에서 받은 한 권은 빼고 나머지 한 권만 받는다", async () => {
    h.myOrders = [{ status: "confirmed", term_id: 9, items: [{ id: 5 }] }];
    expect((await submitTextbookOrder({}, form([5, 6]))).error).toBe("내 반 교재가 바뀌었어요. 바뀐 교재를 확인하고 다시 주문해 주세요.");
    expect(await submitTextbookOrder({}, form([6]))).toEqual({ ok: true, transfer: "attached" });
    expect(orderCalls().map((c) => c.args.p_item_ids)).toEqual([[6]]);
  });

  it("내 반 교재를 정하지 못한 달(과목 칸이 빈 방학달 통짜 반)은 학생이 고른 교재를 그대로 보낸다", async () => {
    h.orders = week5Order([section(201, "mwf", null, "A", "10:00~12:10"), section(202, "ttf", null, "A", "10:00~12:10")]);
    expect(await submitTextbookOrder({}, form([7, 9]))).toEqual({ ok: true, transfer: "attached" });
    expect(orderCalls()[0].args.p_item_ids).toEqual([7, 9]);
  });

  it("그 달 불라방 배정이 없으면 받지 않는다 · 교재 목록을 못 읽으면 주문하지 않는다", async () => {
    expect((await submitTextbookOrder({}, form([5, 6], { term_id: "99" }))).error).toBe("이 달 불라방으로 등록된 반이 없어요. 불라방 수강생만 교재를 주문할 수 있어요.");
    h.itemsError = { message: "boom" };
    expect((await submitTextbookOrder({}, form([5, 6]))).error).toBe("주문하지 못했어요. 잠시 뒤 다시 시도해 주세요.");
    expect(orderCalls()).toHaveLength(0);
  });
});
