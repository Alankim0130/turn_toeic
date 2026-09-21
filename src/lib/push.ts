import "server-only";

import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

/**
 * 관리자 웹 푸시. 알림은 스태프(강사·관리자)가 기기마다 "알림 받기"를 눌러 둔 곳으로만 간다.
 * 발송 실패는 사용자 동작을 막지 않도록 삼키고 로그만 남긴다. 404/410 구독은 지운다.
 */

type SettingsRow = Database["public"]["Tables"]["notification_settings"]["Row"];
export type NotificationKind = keyof Pick<SettingsRow, "verification" | "textbook_order" | "contact" | "naver_reservation" | "daily_digest" | "live_detected">;

export const NOTIFICATION_KINDS: { key: NotificationKind; label: string; desc: string }[] = [
  { key: "naver_reservation", label: "네이버 예약", desc: "예약이 들어오거나 바뀌면 날짜·시각을 바로 알려줘요" },
  { key: "live_detected", label: "내 불라방 자동 연결", desc: "내 유튜브 방송이 잡혀 불라방 링크가 저절로 들어가면 (내 것만)" },
  { key: "verification", label: "등업신청 접수", desc: "수강생이 수강증을 올리면 바로" },
  { key: "textbook_order", label: "불라방 교재주문", desc: "교재 배송 신청이 들어오면 바로" },
  { key: "contact", label: "연락하기 문의", desc: "새 문의가 오면 바로" },
  { key: "daily_digest", label: "하루 요약", desc: "매일 밤 9시쯤 스터디 신청·숙제업로드·신규 가입 수" },
];

export type PushMessage = { title: string; body: string; url?: string; tag?: string };
export type PushResult = { sent: number; failed: number; removed: number };

const EMPTY: PushResult = { sent: 0, failed: 0, removed: 0 };

function configure() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) {
    console.warn("[push] VAPID 설정이 없어 알림을 보내지 않습니다");
    return false;
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

type SubscriptionRow = { id: number; endpoint: string; p256dh: string; auth: string };

async function deliver(rows: SubscriptionRow[], message: PushMessage): Promise<PushResult> {
  if (rows.length === 0 || !configure()) return EMPTY;
  const payload = JSON.stringify({ title: message.title, body: message.body, url: message.url ?? "/admin", tag: message.tag });
  const delivered: number[] = [];
  const gone: number[] = [];
  let failed = 0;

  await Promise.all(
    rows.map(async (row) => {
      try {
        await webpush.sendNotification({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, payload, {
          TTL: 60 * 60 * 24,
          urgency: "high",
          timeout: 10_000,
        });
        delivered.push(row.id);
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) gone.push(row.id);
        else {
          failed++;
          console.error("[push] 발송 실패", status ?? "", (error as Error).message);
        }
      }
    }),
  );

  const admin = createAdminClient();
  if (gone.length) await admin.from("push_subscriptions").delete().in("id", gone);
  if (delivered.length) await admin.from("push_subscriptions").update({ last_sent_at: new Date().toISOString() }).in("id", delivered);
  return { sent: delivered.length, failed, removed: gone.length };
}

/** 해당 알림을 켜 둔 스태프 모두에게 보낸다. 설정 행이 없으면 켜진 것으로 본다 */
export async function notifyStaff(kind: NotificationKind, message: PushMessage): Promise<PushResult> {
  try {
    const admin = createAdminClient();
    const { data: staff } = await admin.from("profiles").select("id").in("role", ["instructor", "admin"]);
    const staffIds = (staff ?? []).map((s) => s.id);
    if (staffIds.length === 0) return EMPTY;

    const { data: settings } = await admin.from("notification_settings").select("*").in("user_id", staffIds);
    const mutedIds = new Set((settings ?? []).filter((s) => s[kind] === false).map((s) => s.user_id));
    const targets = staffIds.filter((id) => !mutedIds.has(id));
    if (targets.length === 0) return EMPTY;

    const { data: subs } = await admin.from("push_subscriptions").select("id, endpoint, p256dh, auth").in("user_id", targets);
    return await deliver(subs ?? [], message);
  } catch (error) {
    console.error("[push] notifyStaff", error);
    return EMPTY;
  }
}

/** 한 사람에게만 보낸다 — 그 사람이 그 알림을 꺼 두었으면 보내지 않는다 (내 불라방 자동 연결 확인 등) */
export async function notifyUser(userId: string, kind: NotificationKind, message: PushMessage): Promise<PushResult> {
  try {
    const admin = createAdminClient();
    const { data: settings } = await admin.from("notification_settings").select("*").eq("user_id", userId).maybeSingle();
    if (settings && settings[kind] === false) return EMPTY;
    const { data: subs } = await admin.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", userId);
    return await deliver(subs ?? [], message);
  } catch (error) {
    console.error("[push] notifyUser", error);
    return EMPTY;
  }
}

/** 한 사람의 모든 기기로 보낸다 (테스트 알림) */
export async function pushToUser(userId: string, message: PushMessage): Promise<PushResult> {
  try {
    const admin = createAdminClient();
    const { data: subs } = await admin.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", userId);
    return await deliver(subs ?? [], message);
  } catch (error) {
    console.error("[push] pushToUser", error);
    return EMPTY;
  }
}
