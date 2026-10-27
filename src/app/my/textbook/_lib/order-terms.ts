import "server-only";
import type { createClient } from "@/lib/supabase/server";
import {
  booksForSections,
  itemsForLevels,
  orderPlan,
  ownedItemIds,
  textbookGuide,
  type OrderTerm,
  type TextbookAccount,
  type TextbookItem,
  type TextbookSettings,
} from "@/lib/textbook";
import { bookSectionsOf, TEXTBOOK_ACCOUNT_COLS, TEXTBOOK_ITEM_COLS } from "@/lib/textbook-guide";
import { TRACK_LABEL } from "@/lib/utils";
import { collapseWeek5, studentTrackLabel, week5SectionIds } from "@/lib/week5";
import { getMyTextbookTerms, termLabel, type MyOrder, type MyTextbookOrder, type MyTextbookTerm } from "../../_lib/queries";

type Client = Awaited<ReturnType<typeof createClient>>;

/** "2026년 10월 · 650+ 왕기초반 주5일 10:00~12:10" — 주5일은 한 줄로 합친다 */
function termOrderLabel(t: MyTextbookTerm) {
  const week5 = week5SectionIds(t.sections);
  const rows = collapseWeek5(t.sections, (s) => s, week5);
  const classes = rows.map((s) => [s.course?.name ?? "강좌", studentTrackLabel(s, week5, TRACK_LABEL), s.time_block].filter(Boolean).join(" "));
  return `${termLabel(t.term)} · ${classes.join(" · ")}`;
}

/** 교재 · 입금 계좌 · 배송비 — 로그인한 사람의 세션으로 읽는다 (crew + 불라방 배정 학생만 열린다) */
export function textbookCatalogQueries(supabase: Client) {
  return Promise.all([
    supabase.from("textbook_items").select(TEXTBOOK_ITEM_COLS).eq("active", true),
    supabase.from("textbook_accounts").select(TEXTBOOK_ACCOUNT_COLS).eq("active", true),
    supabase.from("textbook_settings").select("shipping_fee, default_account_id, notice").maybeSingle(),
  ]);
}
export type TextbookCatalog = { items: TextbookItem[]; accounts: TextbookAccount[]; settings: TextbookSettings | null };

/** 위 세 조회의 결과 → 목록. 하나라도 못 읽었으면 null — "교재가 없다" 로 잘못 말하지 않게 */
export function catalogOf([items, accounts, settings]: Awaited<ReturnType<typeof textbookCatalogQueries>>): TextbookCatalog | null {
  if (items.error || accounts.error || settings.error) return null;
  return {
    items: (items.data ?? []) as TextbookItem[],
    accounts: (accounts.data ?? []) as TextbookAccount[],
    settings: (settings.data ?? null) as TextbookSettings | null,
  };
}

/**
 * 주문할 수 있는 달마다 **주문할 교재** — 주문 화면(page)과 서버 액션이 같은 것을 쓴다 (2026-10-27 Alan — "이제는 자동시스템이니 선택할 수 없게").
 * 내 반 교재 = 내 불라방 반이 듣는 시간의 과목 × 과정 (함께 듣는 반은 DB `term_section_includes`), 지난 주문에서 받은 것은 뺀다 (`orderPlan`).
 * 화면은 이 목록을 그대로 보여 주고, 서버 액션은 화면이 보낸 교재가 이것과 같은지 본다 — 둘이 따로 계산하면 갈라진다.
 */
export async function orderTermsOf(supabase: Client, orders: MyOrder[], myOrders: readonly MyTextbookOrder[], catalog: TextbookCatalog): Promise<OrderTerm[]> {
  const terms = await getMyTextbookTerms(orders);
  const orderedTerms = new Set(myOrders.filter((o) => o.status !== "cancelled" && o.term_id).map((o) => o.term_id));
  // 내 반 교재 (2026-10-02 Alan — "주5일은 4권 … 주3일과 주5일 60분이면 2권") — 함께 듣는 반은 DB 가 정한다 (term_section_includes)
  const { includes, sections } = await bookSectionsOf(supabase, terms.flatMap((t) => t.sections));
  return terms.map((t) => {
    const levelItems = itemsForLevels(catalog.items, t.levels);
    const guide = textbookGuide({
      books: booksForSections(t.sections.map((s) => s.id), includes, sections),
      items: levelItems,
      accounts: catalog.accounts,
      settings: catalog.settings,
      ownedItemIds: ownedItemIds(myOrders, t.termId),
    });
    return { id: t.termId, label: termOrderLabel(t), ordered: orderedTerms.has(t.termId), ...orderPlan(guide, levelItems) };
  });
}
