/**
 * 웹 푸시 구독 주소(endpoint) 검사 — 브라우저 회사의 푸시 서비스로 가는 주소만 받는다 (2026-10-15 학생 휴대폰 알림 점검).
 *
 * 알림을 보낼 때 우리 서버가 이 주소로 직접 요청을 보낸다. 2026-10-15 전에는 강사 · 관리자만 기기를 등록했는데,
 * 학생 휴대폰 알림이 생기며 **로그인한 누구나** 주소를 넣을 수 있게 됐다 — https 이기만 하면 받으면,
 * 아무 사이트 주소를 기기로 등록하고 '테스트 알림' 을 눌러 우리 서버가 그 주소로 요청을 보내게 만들 수 있다.
 * 그래서 실제 푸시 서비스 주소만 받는다:
 *   크롬 · 삼성 인터넷 · 웨일 · 엣지(안드로이드) · 오페라 → fcm.googleapis.com (옛 android.googleapis.com)
 *   아이폰 · 맥 사파리 → web.push.apple.com
 *   파이어폭스 → updates.push.services.mozilla.com
 *   윈도우 엣지 → *.notify.windows.com
 * 새 브라우저가 다른 주소를 쓰면 여기에 더한다 (그때까지 그 브라우저는 '구독 주소를 받을 수 없어요' 가 뜬다).
 */

import { createECDH } from "node:crypto";

const PUSH_SERVICE_HOSTS = ["fcm.googleapis.com", "android.googleapis.com", "push.apple.com", "push.services.mozilla.com", "notify.windows.com"];

/** 그 호스트거나 그 호스트의 하위 이름 (점으로 끊어서 — `evilpush.apple.com.example` 은 아니다) */
function hostMatches(host: string, suffix: string) {
  return host === suffix || host.endsWith(`.${suffix}`);
}

export function isPushServiceEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
  const host = url.hostname.toLowerCase();
  return PUSH_SERVICE_HOSTS.some((suffix) => hostMatches(host, suffix));
}

/**
 * 아이폰 앱(애플 푸시 APNs) 기기 주소 — `apns://production/<토큰>` · `apns://sandbox/<토큰>` (2026-10-30, `src/lib/native-app.ts` 의 `apnsEndpoint`).
 * 토큰은 애플이 준 기기 토큰의 16진수(소문자, 지금은 64자 — 길이는 애플이 바꿀 수 있어 200자까지). 이 꼴이 아니면 null.
 * 이 주소로는 우리 서버가 애플 서버(api.push.apple.com)에만 보낸다 — 아무 곳으로나 요청을 보내게 하는 길이 아니다 (`apns.ts`).
 */
export function parseApnsEndpoint(endpoint: string): { sandbox: boolean; token: string } | null {
  const m = /^apns:\/\/(production|sandbox)\/([0-9a-f]{64,200})$/.exec(String(endpoint ?? ""));
  return m ? { sandbox: m[1] === "sandbox", token: m[2] } : null;
}

/** 앱 기기 줄의 p256dh · auth 칸 — 웹 푸시 키가 없어서 이 글자를 둔다 (칸이 not null 이다) */
export const APNS_KEY_MARK = "apns";

/** URL 안전 base64 (브라우저가 주는 모양 — 끝의 = 는 있어도 된다) → 바이트. 다른 글자가 섞였으면 null */
function base64UrlBytes(value: string): Buffer | null {
  if (!/^[A-Za-z0-9_-]+={0,2}$/.test(value)) return null;
  return Buffer.from(value.replace(/=+$/, ""), "base64url");
}

/**
 * 구독 키가 브라우저가 만든 모양인가 (2026-10-16 점검). p256dh = P-256 곡선 위의 공개 키(65바이트, 0x04 로 시작),
 * auth = 16바이트 이상 (Web Push 규격 · web-push 가 보낼 때 보는 것과 같다).
 * 예전에는 길이만 봐서 아무 글자나 받았다 — 그런 기기는 보낼 때 **우리 서버 안에서** 실패해 푸시 서비스의 404 · 410 이 오지 않으므로
 * 줄이 지워지지 않고 쌓였다 (로그인한 누구나 끝없이 넣을 수 있었다). 곡선 위의 점인지는 실제로 키 합의를 해 보고 정한다.
 */
export function isPushKeyPair(p256dh: string, auth: string): boolean {
  const pub = base64UrlBytes(p256dh);
  const secret = base64UrlBytes(auth);
  if (!pub || pub.length !== 65 || pub[0] !== 0x04 || !secret || secret.length < 16) return false;
  try {
    const ecdh = createECDH("prime256v1");
    ecdh.generateKeys();
    ecdh.computeSecret(pub);
    return true;
  } catch {
    return false;
  }
}

/**
 * 한 사람이 알림을 받는 기기 수의 끝 — 넘으면 가장 오래전에 처음 켠 기기부터 지운다 (`push-subscription.ts`, 방금 켠 기기는 늘 남긴다).
 * 휴대폰 · 태블릿 · PC 브라우저 몇 개면 충분하다. 끝이 없으면 한 사람이 기기를 끝없이 넣어, 보낼 때마다 그만큼 요청이 나가고
 * 한 번에 읽는 기기 줄(1,000줄)을 혼자 채울 수 있었다 (2026-10-16 점검)
 */
export const DEVICES_PER_USER = 10;

/** 지울 기기 — 최근에 처음 켠 순(id 큰 것)으로 `limit` 개를 남긴다. 방금 켠 기기(`keep`)는 오래된 줄이어도 남긴다 */
export function devicesOverLimit(rows: readonly { id: number; endpoint: string }[], keep: string, limit = DEVICES_PER_USER): number[] {
  if (rows.length <= limit) return [];
  const kept = new Set<number>();
  const current = rows.find((r) => r.endpoint === keep);
  if (current) kept.add(current.id);
  for (const r of [...rows].sort((a, b) => b.id - a.id)) {
    if (kept.size >= limit) break;
    kept.add(r.id);
  }
  return rows.filter((r) => !kept.has(r.id)).map((r) => r.id);
}
