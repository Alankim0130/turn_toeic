import "server-only";
import type { createAdminClient } from "./supabase/admin";
import type { Json } from "./supabase/database.types";
import { todayKST } from "./utils";
import {
  booksForSections,
  ownedItemIds,
  textbookGuide,
  textbookNotice,
  textbookNoticeMessage,
  type BookSection,
  type TextbookAccount,
  type TextbookItem,
  type TextbookNotice,
  type TextbookSettings,
} from "./textbook";
import { isTwoWeek } from "./two-week";

/** 학생 화면(세션)과 승인 길(서버) 둘 다 부른다 — `fetchOpenEnrollSections` 와 같은 꼴 */
type Client = Pick<ReturnType<typeof createAdminClient>, "from" | "rpc">;

export const TEXTBOOK_ITEM_COLS = "id, name, level, price, account_id, note, active, sort_order, subject, book_set";
export const TEXTBOOK_ACCOUNT_COLS = "id, bank_name, account_no, holder, label, active, sort_order";

/** 직접 배정된 반 한 개 — 교재 칸(과목 · 과정)과 레벨 */
export type DirectBookSection = {
  id: number;
  term_id: number;
  subject: string | null;
  book_set: string | null;
  course: { target_score: number | null; program?: string | null } | null;
};

/**
 * 직접 반 → 함께 듣는 반(묶음 → 시간 단위, 속성반 → 함께 듣는 레벨의 시간 단위)과 그 반들의 교재 칸.
 * **품는 관계는 DB 가 정한다** (`term_section_includes` — security invoker 이고 반 목록은 공개라 학생 세션으로도 읽힌다).
 * 비공개(draft) 반은 넣지 않는다 — 학생 세션에는 안 보이는 반이라, 서버(service_role)로 읽을 때도 같은 답이 나오게 한다.
 * 못 읽으면 그 반은 묶음 그대로 남아 `booksForSections` 가 "정하지 못함" 으로 본다 — 짐작하지 않는다.
 */
export async function bookSectionsOf(client: Client, direct: readonly DirectBookSection[]) {
  const sections = new Map<number, BookSection>();
  for (const s of direct) sections.set(s.id, { id: s.id, level: s.course?.target_score ?? null, subject: s.subject, book_set: s.book_set });

  const includes = new Map<number, number[]>();
  const mine = new Set(direct.map((s) => s.id));
  // 2주완성(2026-10-05)은 교재 규칙을 아직 정하지 않았다 (앞 절반만 듣는다 — 몇 권 · 얼마인지 Alan 확인 전).
  // 품은 반으로 펼치지 않아 그 반 자신(과목 · 과정 없음)이 남고 "정하지 못함"(unknown)이 된다 — 안내를 보내지 않고 미리 고르지도 않는다
  const unsettled = new Set(direct.filter((s) => isTwoWeek(s.course?.program)).map((s) => s.id));
  const terms = [...new Set(direct.map((s) => s.term_id))];
  const pairs = await Promise.all(terms.map((t) => client.rpc("term_section_includes", { p_term_id: t })));
  for (const { data, error } of pairs) {
    if (error) {
      console.error(`[textbook] 함께 듣는 반을 읽지 못했어요: ${error.message}`);
      continue;
    }
    for (const p of data ?? []) {
      if (mine.has(p.section_id) && !unsettled.has(p.section_id)) includes.set(p.section_id, [...(includes.get(p.section_id) ?? []), p.included_id]);
    }
  }

  const need = [...new Set([...includes.values()].flat())].filter((id) => !sections.has(id));
  if (need.length > 0) {
    const { data, error } = await client.from("class_sections").select("id, subject, book_set, status, course:courses(target_score)").in("id", need);
    if (error) console.error(`[textbook] 함께 듣는 반의 교재 칸을 읽지 못했어요: ${error.message}`);
    for (const s of data ?? []) {
      if (s.status === "draft") continue;
      sections.set(s.id, { id: s.id, level: s.course?.target_score ?? null, subject: s.subject, book_set: s.book_set });
    }
  }
  for (const [id, inner] of includes) includes.set(id, inner.filter((x) => sections.has(x)));
  return { includes, sections };
}

/** 그 학생의 불라방 반 — 등록이 예비 · 수강 중이고 종강 전 (교재 주문 자격 `private.has_live_enrollment` 와 같은 조건) */
async function liveSectionsOf(client: Client, userId: string) {
  const { data, error } = await client
    .from("enrollments")
    .select(
      `section_id, status, mode,
       order:enrollment_orders!enrollments_order_id_fkey(status),
       section:class_sections!enrollments_section_id_fkey(id, term_id, closes_at, subject, book_set, course:courses(target_score, program), term:terms(year, month))`,
    )
    .eq("student_id", userId)
    .eq("mode", "live")
    .eq("status", "active");
  if (error) throw new Error(`불라방 배정을 읽지 못했어요: ${error.message}`);
  const today = todayKST();
  return (data ?? []).flatMap((e) =>
    e.section && e.order && (e.order.status === "preliminary" || e.order.status === "active") && today <= e.section.closes_at ? [e.section] : [],
  );
}

/**
 * **불라방 교재비 안내** (2026-10-02 Alan — "수강증 업로드를 하고 나면 거기에 맞춰서 교재비 안내가 나가면 편할것 같아!").
 *
 * 수강증이 불라방으로 승인되면(OCR 자동 승인 · 스태프 승인 · 받아 둔 수강증 다시 맞추기 · 배정 수정) 그 달 내 반 교재 · 금액 · 입금 계좌를
 * 학생 알림함(`student_messages`, kind `textbook`)에 한 번 남긴다. 돌려준 안내는 수강증을 올린 그 자리의 팝업이 그대로 보여 준다.
 *
 * 보내지 않는 경우 — 하나라도 걸리면 null:
 *   - 그 달 안내를 이미 보냈다 (한 학생 · 한 달에 한 번) · 그 달 교재를 이미 주문했다
 *   - 그 달 불라방 배정이 없다 (현장 수강생은 강의실에서 교재를 받는다)
 *   - 내 반 교재를 다 정하지 못했다 · 강사가 그 교재를 아직 등록하지 않았다 · 받을 계좌가 없다 · 새로 살 교재가 없다 (`guideReady`)
 *     — 틀린 금액을 안내하느니 보내지 않는다. 주문 화면(`/my/textbook`)은 그때그때 다시 계산해 늘 맞다.
 *
 * 서버(service_role)로 부른다 — 알림함 쓰기 정책은 스태프 세션뿐이다. 실패해도 던지지 않는다 (승인을 망치면 안 된다).
 */
export async function sendTextbookNotice(admin: Client, userId: string, termId: number): Promise<TextbookNotice | null> {
  try {
    const [{ data: sent, error: sentError }, { data: orders, error: orderError }, live] = await Promise.all([
      admin.from("student_messages").select("id").eq("user_id", userId).eq("kind", "textbook").filter("related->>term_id", "eq", String(termId)).limit(1),
      admin.from("textbook_orders").select("status, term_id, items").eq("user_id", userId),
      liveSectionsOf(admin, userId),
    ]);
    // 못 읽으면 보내지 않는다 — 같은 안내가 두 번 가는 것보다 낫다
    if (sentError || orderError) {
      console.error(`[textbook] 교재비 안내를 보낼지 확인하지 못했어요: ${(sentError ?? orderError)?.message}`);
      return null;
    }
    if ((sent ?? []).length > 0) return null;
    if ((orders ?? []).some((o) => o.term_id === termId && o.status !== "cancelled")) return null;
    const mine = live.filter((s) => s.term_id === termId);
    const month = mine[0]?.term?.month;
    if (mine.length === 0 || !month) return null;

    const [{ includes, sections }, { data: items }, { data: accounts }, { data: settings }] = await Promise.all([
      bookSectionsOf(admin, mine),
      admin.from("textbook_items").select(TEXTBOOK_ITEM_COLS).eq("active", true),
      admin.from("textbook_accounts").select(TEXTBOOK_ACCOUNT_COLS).eq("active", true),
      admin.from("textbook_settings").select("shipping_fee, default_account_id, notice").maybeSingle(),
    ]);
    const guide = textbookGuide({
      books: booksForSections(mine.map((s) => s.id), includes, sections),
      items: (items ?? []) as TextbookItem[],
      accounts: (accounts ?? []) as TextbookAccount[],
      settings: (settings ?? null) as TextbookSettings | null,
      ownedItemIds: ownedItemIds(orders ?? [], termId),
    });
    const notice = textbookNotice(month, guide);
    if (!notice) return null;

    const message = textbookNoticeMessage(notice);
    const { error } = await admin.from("student_messages").insert({
      user_id: userId,
      sender_name: "",
      kind: "textbook",
      title: message.title,
      body: message.body,
      related: { term_id: termId } as Json,
    });
    // 남기지 못해도 안내는 돌려준다 — 그 자리의 팝업은 보여 준다
    if (error) console.error(`[textbook] 교재비 안내를 알림함에 남기지 못했어요: ${error.message}`);
    return notice;
  } catch (err) {
    console.error("[textbook] 교재비 안내 실패", err);
    return null;
  }
}
