"use server";

import { revalidatePath } from "next/cache";
import { requireCrew } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { pushToUser } from "@/lib/push";
import { deleteSubscription, ownsSubscription, saveSubscription, type SubscriptionInput } from "@/lib/push-subscription";

/**
 * 새 교재주문 알림 — 조교가 교재주문 화면에서 이 기기 알림을 켜고 끈다 (2026-10-27 Alan — "○○○(조교)인데 불라방 교재주문을 담당하는
 * 사람이야. 이 사람이 불라방 교재주문 알림 푸시를 받을 수 있도록 설정이 되어있는지 확인쫌 부탁해").
 *
 * 그전에는 조교가 받을 길이 없었다 — `notifyStaff` 가 강사 · 관리자만 골랐고 알림 설정 화면도 조교에게 닫혀 있다.
 * 켜면 이 기기를 내 기기로 저장하고 내 알림 설정의 교재주문(`notification_settings.textbook_order`)을 켠다 — `notifyStaff("textbook_order")` 는
 * 조교 중 **켠 사람에게만** 보낸다 (`CREW_ALERT_KINDS` — 교재주문을 맡지 않은 조교에게는 가지 않는다). 끄면 이 기기를 지우고 교재주문을 끈다.
 * 기기 저장은 관리자 · 학생 알림과 같은 규칙이다 (`push-subscription.ts` — 내 기기만 · 푸시 서비스 주소만 · 한 사람 10대).
 * 맨 위 `requireCrew()` — 화면은 조교에게만 이 카드를 그린다 (강사 · 관리자는 알림 설정 화면을 쓴다).
 */

export type OrderPushResult = { ok: true; message?: string } | { ok: false; error: string };

/** 내 알림 설정의 교재주문만 바꾼다 — 다른 종류는 그대로 (행이 없으면 만든다). 가드 뒤에서 내 행만 쓴다 */
async function setOrderAlert(userId: string, on: boolean): Promise<boolean> {
  const { error } = await createAdminClient()
    .from("notification_settings")
    .upsert({ user_id: userId, textbook_order: on, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) console.error("[push] 교재주문 알림 설정", error.message);
  return !error;
}

export async function saveOrderPushSubscription(input: SubscriptionInput): Promise<OrderPushResult> {
  const { user } = await requireCrew();
  const result = await saveSubscription(user.id, input);
  if (!result.ok) return result;
  if (!(await setOrderAlert(user.id, true))) return { ok: false, error: "알림 설정을 저장하지 못했어요. 잠시 뒤 다시 눌러 주세요." };
  revalidatePath("/admin/textbook-orders");
  return { ok: true };
}

export async function deleteOrderPushSubscription(endpoint: string): Promise<OrderPushResult> {
  const { user } = await requireCrew();
  await deleteSubscription(user.id, endpoint);
  await setOrderAlert(user.id, false);
  revalidatePath("/admin/textbook-orders");
  return { ok: true };
}

/** 이 기기가 내 기기로 저장돼 있고 교재주문 알림을 켰는가 — 둘 다여야 '받고 있어요' (학생 알림함에서 켠 기기라도 교재주문을 안 켰으면 꺼짐) */
export async function ownsOrderPushDevice(endpoint: string): Promise<boolean> {
  const { user } = await requireCrew();
  const supabase = await createClient();
  const [mine, { data: setting }] = await Promise.all([
    ownsSubscription(endpoint),
    supabase.from("notification_settings").select("textbook_order").eq("user_id", user.id).maybeSingle(),
  ]);
  return mine && setting?.textbook_order === true;
}

export async function sendOrderTestPush(): Promise<OrderPushResult> {
  const { user } = await requireCrew();
  const result = await pushToUser(user.id, {
    title: "역전토익 테스트 알림",
    body: "이 기기에서 새 교재주문 알림을 받을 수 있어요.",
    url: "/admin/textbook-orders",
    tag: "order-test",
  });
  if (result.sent === 0) {
    return {
      ok: false,
      error: result.removed ? "만료된 기기라 지웠어요. '이 기기에서 알림 받기' 를 다시 눌러 주세요." : "알림을 받을 기기가 없어요.",
    };
  }
  return { ok: true, message: "테스트 알림을 보냈어요. 휴대폰 알림을 확인해 보세요." };
}
