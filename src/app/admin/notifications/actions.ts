"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { pushToUser } from "@/lib/push";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };
export type SubscriptionInput = { endpoint: string; p256dh: string; auth: string; userAgent?: string };

/** 이 기기의 푸시 구독 저장. 같은 기기(endpoint)를 다른 계정이 쓰던 경우 지금 계정으로 옮긴다 */
export async function savePushSubscription(input: SubscriptionInput): Promise<ActionResult> {
  const { user } = await requireStaff();
  let endpoint: URL;
  try {
    endpoint = new URL(String(input?.endpoint ?? ""));
  } catch {
    return { ok: false, error: "구독 정보가 올바르지 않아요. 다시 시도해 주세요." };
  }
  if (endpoint.protocol !== "https:") return { ok: false, error: "안전하지 않은 구독 주소예요." };
  const p256dh = String(input?.p256dh ?? "");
  const auth = String(input?.auth ?? "");
  if (!p256dh || !auth || p256dh.length > 200 || auth.length > 100) return { ok: false, error: "구독 키가 올바르지 않아요." };

  const { error } = await createAdminClient()
    .from("push_subscriptions")
    .upsert(
      { user_id: user.id, endpoint: endpoint.href, p256dh, auth, user_agent: String(input?.userAgent ?? "").slice(0, 300) || null },
      { onConflict: "endpoint" },
    );
  if (error) return { ok: false, error: "저장하지 못했어요. 잠시 후 다시 시도해 주세요." };
  revalidatePath("/admin/notifications");
  return { ok: true };
}

export async function deletePushSubscription(endpoint: string): Promise<ActionResult> {
  const { user } = await requireStaff();
  await createAdminClient().from("push_subscriptions").delete().eq("endpoint", String(endpoint ?? "")).eq("user_id", user.id);
  revalidatePath("/admin/notifications");
  return { ok: true };
}

export async function removeDevice(formData: FormData) {
  const { user } = await requireStaff();
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return;
  await createAdminClient().from("push_subscriptions").delete().eq("id", id).eq("user_id", user.id);
  revalidatePath("/admin/notifications");
}

export async function sendTestPush(): Promise<ActionResult> {
  const { user } = await requireStaff();
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
  const { user } = await requireStaff();
  const on = (key: string) => formData.get(key) === "on";
  const { error } = await createAdminClient()
    .from("notification_settings")
    .upsert(
      {
        user_id: user.id,
        naver_reservation: on("naver_reservation"),
        verification: on("verification"),
        textbook_order: on("textbook_order"),
        contact: on("contact"),
        daily_digest: on("daily_digest"),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
  if (error) return { error: "저장하지 못했어요. 잠시 후 다시 시도해 주세요." };
  revalidatePath("/admin/notifications");
  return { ok: true };
}
