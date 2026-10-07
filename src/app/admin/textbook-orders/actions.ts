"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isStaff, requireCrew, requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const BASE = "/admin/textbook-orders";
const STATUSES = new Set(["requested", "confirmed", "shipped", "cancelled"]);

/** 처리 뒤 돌아갈 주소 — 교재주문 화면 안만 */
function backOf(formData: FormData): string {
  const back = String(formData.get("back") ?? BASE);
  return back.startsWith(BASE) ? back : BASE;
}

function go(back: string, query: string): never {
  redirect(`${back}${back.includes("?") ? "&" : "?"}${query}`);
}

function orderIdOf(formData: FormData): number | null {
  const id = Number(formData.get("order_id"));
  return Number.isInteger(id) && id > 0 ? id : null;
}

const trackingOf = (formData: FormData) => String(formData.get("tracking_no") ?? "").trim().slice(0, 60) || null;

function refresh() {
  revalidatePath("/admin");
  revalidatePath(BASE);
  revalidatePath("/my/textbook");
}

/*
 * 배송 단계 (2026-10-02 Alan — "학생이 주문완료하면, 강사가 금액확인을 하고 금액확인 버튼을 눌러주면, 조교들이 배송을 진행할거야.
 * 그럼 조교들이 배송을 완료하면 배송완료 버튼을 눌러주면 좋겠어"): requested → **금액확인**(강사 · 관리자) → confirmed → **배송완료**(조교도) → shipped.
 * 학생 화면에는 같은 상태가 주문완료 → 배송확인 → 배송시작 으로 보인다 (`TEXTBOOK_STATUS`).
 *
 * 쓰기는 **로그인한 사람의 세션으로만** 한다 — RLS(`textbook_orders: 스태프·조교 처리`)와 조교의 금액확인을 막는 DB 트리거
 * (`guard_textbook_order_update`)가 한 번 더 본다. 예전에는 막히면 서비스 롤로 다시 썼는데, 그러면 그 트리거를 비껴간다.
 * 바꿀 줄이 없으면(이미 처리됐거나 학생이 취소) 성공이라고 하지 않는다 — `.select()` 로 바뀐 줄을 센다.
 */

/** **금액확인** — 입금자명을 통장과 대조하고 누른다. 강사 · 관리자만 (교재비가 강사 통장으로 들어와 조교는 대조할 수 없다) */
export async function confirmTextbookPayment(formData: FormData) {
  await requireStaff();
  const back = backOf(formData);
  const id = orderIdOf(formData);
  if (!id) go(back, "error=invalid");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("textbook_orders")
    .update({ status: "confirmed", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "requested")
    .select("id");
  if (error) go(back, "error=save");
  if (!data || data.length === 0) go(back, "error=stale");

  refresh();
  go(back, `ok=${id}&did=confirmed`);
}

/** **배송완료** — 금액확인된 주문을 보낸 뒤 누른다. 조교도. 송장번호는 있으면 적는다 (학생 화면에 보인다) */
export async function markTextbookShipped(formData: FormData) {
  await requireCrew();
  const back = backOf(formData);
  const id = orderIdOf(formData);
  if (!id) go(back, "error=invalid");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("textbook_orders")
    .update({ status: "shipped", tracking_no: trackingOf(formData), updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "confirmed")
    .select("id");
  if (error) go(back, "error=save");
  if (!data || data.length === 0) go(back, "error=stale");

  refresh();
  go(back, `ok=${id}&did=shipped`);
}

/**
 * **수령완료** — 현장수령 주문(2026-10-07)을 학원에서 건넨 뒤 누른다. 조교도.
 * 상태는 택배의 배송완료와 같은 shipped 이고, 학생이 그 자리에서 받았으니 `received_at` 도 함께 찍는다 — 그 주문은 학생 내역에서 사라진다
 * (택배는 학생이 받고 직접 누른다). 금액확인된 현장수령 주문만 — 조교의 금액확인 건너뛰기는 DB 트리거도 막는다.
 */
export async function markTextbookPickedUp(formData: FormData) {
  await requireCrew();
  const back = backOf(formData);
  const id = orderIdOf(formData);
  if (!id) go(back, "error=invalid");

  const supabase = await createClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("textbook_orders")
    .update({ status: "shipped", received_at: now, tracking_no: null, updated_at: now })
    .eq("id", id)
    .eq("status", "confirmed")
    .eq("delivery_method", "pickup")
    .select("id");
  if (error) go(back, "error=save");
  if (!data || data.length === 0) go(back, "error=stale");

  refresh();
  go(back, `ok=${id}&did=picked`);
}

/**
 * 상태 직접 바꾸기 — 잘못 누른 것 되돌리기 · 취소 · 송장번호 고치기. 조교도 한다.
 * 단 **금액확인 전(또는 취소) → 배송 대기 · 배송완료** 는 강사 · 관리자만이다 — 배송완료로 바로 건너뛰면 금액확인을 비껴간다
 * (위 금액확인과 같은 규칙 — DB 트리거도 막는다).
 */
export async function updateTextbookOrder(formData: FormData) {
  const { profile } = await requireCrew();
  const back = backOf(formData);
  const id = orderIdOf(formData);
  const status = String(formData.get("status") ?? "");
  if (!id || !STATUSES.has(status)) go(back, "error=invalid");

  const supabase = await createClient();
  if ((status === "confirmed" || status === "shipped") && !isStaff(profile.role)) {
    const { data: current } = await supabase.from("textbook_orders").select("status").eq("id", id).maybeSingle();
    if (current?.status !== "confirmed" && current?.status !== "shipped") go(back, "error=staff");
  }

  const { data, error } = await supabase
    .from("textbook_orders")
    .update({ status, tracking_no: trackingOf(formData), updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id");
  if (error) go(back, error.message.includes("confirm_staff_only") ? "error=staff" : "error=save");
  if (!data || data.length === 0) go(back, "error=save");

  refresh();
  go(back, `ok=${id}`);
}
