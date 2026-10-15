import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 기기의 푸시 구독 저장 · 지우기 — 관리자 알림 설정(`/admin/notifications`)과 학생 알림(`/my/notifications`, 2026-10-15)이 함께 쓴다.
 * 표(`push_subscriptions`)는 쓰기가 서버(서비스 롤)만이라 **부르는 쪽이 먼저 로그인한 사람을 확인하고** 그 id 를 넘긴다.
 * 같은 기기(endpoint)를 다른 계정이 쓰던 경우 지금 계정으로 옮긴다 — 한 기기는 한 계정의 알림만 받는다.
 */

export type SubscriptionInput = { endpoint: string; p256dh: string; auth: string; userAgent?: string };
export type SubscriptionResult = { ok: true } | { ok: false; error: string };

export async function saveSubscription(userId: string, input: SubscriptionInput): Promise<SubscriptionResult> {
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
      { user_id: userId, endpoint: endpoint.href, p256dh, auth, user_agent: String(input?.userAgent ?? "").slice(0, 300) || null },
      { onConflict: "endpoint" },
    );
  if (error) return { ok: false, error: "저장하지 못했어요. 잠시 후 다시 시도해 주세요." };
  return { ok: true };
}

/** 내 기기만 지운다 (다른 계정으로 옮겨 간 기기는 건드리지 않는다) */
export async function deleteSubscription(userId: string, endpoint: string): Promise<void> {
  await createAdminClient().from("push_subscriptions").delete().eq("endpoint", String(endpoint ?? "")).eq("user_id", userId);
}
