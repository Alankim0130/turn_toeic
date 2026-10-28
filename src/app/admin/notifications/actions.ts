"use server";

import { revalidatePath } from "next/cache";
import { isStaff, requireCrew } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { editableAlertKinds, pushToUser, type NotificationKind } from "@/lib/push";
import { deleteSubscription, ownsSubscription, saveSubscription, type SubscriptionInput } from "@/lib/push-subscription";

/*
 * 알림 설정 — 강사 · 관리자, 그리고 **조교**(2026-10-28 Alan — "여기 알림설정 페이지를 접근할 수 있게 하면 쉽지 않을까? 다만
 * '등업신청'과 '불라방 교재주문' 이 두가지만 설정할 수 있도록 하고 나머지는 작동안되게"). 그래서 함수마다 맨 위 `requireCrew()` 이고,
 * 기기는 누구든 내 기기만 저장 · 지운다. 알림 종류는 조교면 `CREW_ALERT_KINDS` 두 칸만 쓴다 — 화면이 잠근 나머지 종류를 화면을
 * 거치지 않고 보내도 받지 않는다 (조교에게는 어차피 안 가는 알림이지만 칸을 바꿔 두지 않는다 — 강사가 되면 그 값이 남는다).
 */

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };
export type { SubscriptionInput };

/** 이 기기의 푸시 구독 저장. 같은 기기(endpoint)를 다른 계정이 쓰던 경우 지금 계정으로 옮긴다 (학생 알림과 같은 저장 — push-subscription.ts) */
export async function savePushSubscription(input: SubscriptionInput): Promise<ActionResult> {
  const { user } = await requireCrew();
  const result = await saveSubscription(user.id, input);
  if (!result.ok) return result;
  revalidatePath("/admin/notifications");
  return { ok: true };
}

export async function deletePushSubscription(endpoint: string): Promise<ActionResult> {
  const { user } = await requireCrew();
  await deleteSubscription(user.id, endpoint);
  revalidatePath("/admin/notifications");
  return { ok: true };
}

/** 브라우저가 기억하는 이 기기의 구독이 내 계정의 것인가 — 같은 휴대폰에서 다른 계정(학생 시험 계정 등)으로 켰으면 아니다 */
export async function ownsPushDevice(endpoint: string): Promise<boolean> {
  await requireCrew();
  return ownsSubscription(endpoint);
}

export async function removeDevice(formData: FormData) {
  const { user } = await requireCrew();
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return;
  await createAdminClient().from("push_subscriptions").delete().eq("id", id).eq("user_id", user.id);
  revalidatePath("/admin/notifications");
}

export async function sendTestPush(): Promise<ActionResult> {
  const { user } = await requireCrew();
  const result = await pushToUser(user.id, {
    title: "역전토익 테스트 알림",
    body: "이 기기에서 관리자 알림을 받을 수 있어요.",
    url: "/admin/notifications",
  });
  if (result.sent === 0) {
    return {
      ok: false,
      error: result.removed ? "만료된 기기라 목록에서 지웠어요. 이 기기에서 알림 받기를 다시 눌러 주세요." : "알림을 받을 기기가 없어요.",
    };
  }
  return { ok: true, message: `기기 ${result.sent}대로 테스트 알림을 보냈어요.` };
}

export type SettingsState = { ok?: boolean; error?: string };

export async function saveNotificationSettings(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const { user, profile } = await requireCrew();
  const on = (key: string) => formData.get(key) === "on";
  // 켜고 끌 수 있는 칸만 쓴다 (조교는 등업신청 접수 · 불라방 교재주문 — editableAlertKinds). 행이 없던 조교라면 나머지 칸은 표의 기본값으로 생기지만,
  // 조교에게는 그 알림이 가지 않는다 (notifyStaff)
  const values = Object.fromEntries(editableAlertKinds(isStaff(profile.role)).map((k) => [k, on(k)])) as Partial<Record<NotificationKind, boolean>>;
  const { error } = await createAdminClient()
    .from("notification_settings")
    .upsert({ user_id: user.id, ...values, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) return { error: "저장하지 못했어요. 잠시 후 다시 시도해 주세요." };
  revalidatePath("/admin/notifications");
  return { ok: true };
}
