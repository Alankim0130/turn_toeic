import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isPushServiceEndpoint } from "@/lib/push-endpoint";

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
  // 브라우저 회사의 푸시 서비스 주소만 — 아무 주소나 받으면 우리 서버가 그 주소로 요청을 보내게 된다 (push-endpoint.ts)
  if (!isPushServiceEndpoint(endpoint.href)) return { ok: false, error: "이 브라우저의 알림 주소는 받을 수 없어요. 크롬 · 사파리(홈 화면 앱)에서 다시 켜 주세요." };
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

/**
 * 이 기기(endpoint)가 지금 로그인한 사람의 것으로 저장돼 있나 — 로그인한 사람의 세션으로 읽는다(정책 "본인 조회").
 * 브라우저는 구독을 기억하지만, 같은 휴대폰에서 다른 계정으로 켰거나(가족 · 강사의 시험 계정) 서버가 만료로 지웠으면
 * 그 구독은 지금 계정의 것이 아니다 — 화면이 '받고 있어요' 라고 하는데 알림이 안 오는 일을 막는다. 읽지 못하면 내 것으로 본다(예전처럼).
 */
export async function ownsSubscription(endpoint: string): Promise<boolean> {
  const forms = endpointForms(endpoint);
  if (forms.length === 0) return false;
  const supabase = await createClient();
  const { data, error } = await supabase.from("push_subscriptions").select("id").in("endpoint", forms).limit(1);
  if (error) return true;
  return (data ?? []).length > 0;
}

/** 내 기기만 지운다 (다른 계정으로 옮겨 간 기기는 건드리지 않는다) */
export async function deleteSubscription(userId: string, endpoint: string): Promise<void> {
  const forms = endpointForms(endpoint);
  if (forms.length === 0) return;
  await createAdminClient().from("push_subscriptions").delete().in("endpoint", forms).eq("user_id", userId);
}

/** 브라우저가 준 주소와 저장할 때 쓰는 모양(`new URL().href` — saveSubscription) 둘 다. 주소가 아니면 빈 목록 */
function endpointForms(endpoint: string): string[] {
  const raw = String(endpoint ?? "");
  try {
    return [...new Set([raw, new URL(raw).href])];
  } catch {
    return [];
  }
}
