import "server-only";

import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { studentPushMessage, type StudentPushRow } from "@/lib/student-push";

/**
 * 웹 푸시. 알림은 기기마다 "알림 받기"를 눌러 둔 곳으로만 간다.
 * - 관리자 알림(`notifyStaff` · `notifyUser`): 강사·관리자 — 종류마다 알림 설정으로 끈다
 * - 학생 알림(`pushStudentMessages`, 2026-10-15): 숙제 미제출 · 불라방 시작만 — 학생 알림함 줄을 그대로 휴대폰으로 (`student-push.ts`)
 * 발송 실패는 사용자 동작을 막지 않도록 삼키고 로그만 남긴다. 404/410 구독은 지운다.
 */

type SettingsRow = Database["public"]["Tables"]["notification_settings"]["Row"];
export type NotificationKind = keyof Pick<SettingsRow, "verification" | "textbook_order" | "contact" | "naver_reservation" | "daily_digest" | "live_detected">;

export const NOTIFICATION_KINDS: { key: NotificationKind; label: string; desc: string }[] = [
  { key: "naver_reservation", label: "네이버 예약", desc: "예약이 들어오거나 바뀌면 날짜·시각을 바로 알려줘요" },
  { key: "live_detected", label: "내 유튜브 자동 연결", desc: "Zoom 에서 유튜브로 송출한 내 방송이 잡혀 불라방 링크·다시보기로 연결되면 (내 것만)" },
  { key: "verification", label: "등업신청 접수", desc: "수강생이 수강증을 올리면 바로" },
  { key: "textbook_order", label: "불라방 교재주문", desc: "교재 배송 신청이 들어오면 바로" },
  { key: "contact", label: "연락하기 문의", desc: "새 문의가 오면 바로" },
  { key: "daily_digest", label: "하루 요약", desc: "매일 밤 9시쯤 스터디 신청·숙제업로드·신규 가입 수 · 개강이 다가오는데 비대면 스터디를 아직 안 열었으면 그것부터" },
];

/** ttl — 기기가 꺼져 있을 때 푸시 서비스가 들고 있는 시간(초). 기본 하루 */
export type PushMessage = { title: string; body: string; url?: string; tag?: string; ttl?: number };
export type PushResult = { sent: number; failed: number; removed: number };

const EMPTY: PushResult = { sent: 0, failed: 0, removed: 0 };

/** 알림 키(VAPID)가 다 있나 — 없으면 보내지 못하므로 학생 알림 대기열을 가져가지 않는다 (가져가면 표시만 되고 사라진다) */
export function pushConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);
}

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
          TTL: message.ttl ?? 60 * 60 * 24,
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

/** 한 번에 함께 보내는 알림 수 — 숙제 미제출을 한 레벨(300명까지)에 보내도 함수 시간 안에 끝나게 나눠 보낸다 */
const STUDENT_PUSH_BATCH = 20;

/**
 * 학생 알림함 줄을 그 학생의 기기로 보낸다 (숙제 미제출 · 불라방 시작 — `src/lib/student-push.ts`).
 * 줄은 `/api/cron/student-push` 가 DB 에서 가져온 것이다(`claim_student_pushes`). 알림을 켠 기기가 없는 학생은 건너뛴다.
 * 학생에게는 종류별 끄기가 없다 — 휴대폰 알림을 끄면(이 기기 알림 끄기) 둘 다 안 온다. 숙제 미제출은 '알림 안 받기' 가 줄 자체를 막는다.
 */
export async function pushStudentMessages(rows: StudentPushRow[]): Promise<PushResult & { messages: number }> {
  const items = rows.flatMap((row) => {
    const message = studentPushMessage(row);
    return message ? [{ userId: row.user_id, message }] : [];
  });
  if (items.length === 0) return { ...EMPTY, messages: 0 };
  try {
    const admin = createAdminClient();
    const userIds = [...new Set(items.map((i) => i.userId))];
    const subsOf = new Map<string, SubscriptionRow[]>();
    for (let i = 0; i < userIds.length; i += 200) {
      const { data, error } = await admin.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth").in("user_id", userIds.slice(i, i + 200));
      if (error) throw error;
      for (const s of data ?? []) subsOf.set(s.user_id, [...(subsOf.get(s.user_id) ?? []), s]);
    }
    const total: PushResult = { ...EMPTY };
    const ready = items.filter((i) => subsOf.has(i.userId));
    for (let i = 0; i < ready.length; i += STUDENT_PUSH_BATCH) {
      const results = await Promise.all(ready.slice(i, i + STUDENT_PUSH_BATCH).map((it) => deliver(subsOf.get(it.userId) ?? [], it.message)));
      for (const r of results) {
        total.sent += r.sent;
        total.failed += r.failed;
        total.removed += r.removed;
      }
    }
    return { ...total, messages: ready.length };
  } catch (error) {
    console.error("[push] pushStudentMessages", error);
    return { ...EMPTY, messages: 0 };
  }
}
