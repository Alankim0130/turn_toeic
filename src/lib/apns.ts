import "server-only";

import { createHash } from "node:crypto";
import http2 from "node:http2";
import { appleBundleId, appleKey, signAppleJwt } from "@/lib/apple-key";
import { parseApnsEndpoint } from "@/lib/push-endpoint";

/**
 * 아이폰 앱 알림 — 애플 푸시(APNs) (2026-10-30). 앱 화면(WKWebView)에는 웹 푸시가 없어서 앱 기기는 애플 푸시로 받는다.
 * 기기 주소는 웹 푸시와 같은 표(`push_subscriptions`)에 `apns://production/<토큰>` 꼴로 있고(`src/lib/native-app.ts`), 보낼 때만 여기로 갈린다 (`push.ts` 의 `deliver`).
 * 그래서 누구에게 보내나(관리자 알림 · 학생 숙제 미제출 · 불라방 시작 · 테스트)는 웹 푸시와 똑같다.
 *
 * 애플 개발자 계정의 .p8 키 하나로 보낸다(`apple-key.ts` — Apple 로 로그인과 같은 키). 키가 없으면 앱 알림은 조용히 꺼진다(웹 푸시는 그대로).
 * - 제공자 토큰(JWT)은 50분 동안 다시 쓴다 — 애플은 20분보다 자주 새로 만들거나 60분보다 오래 쓰면 거절한다
 * - Xcode 에서 바로 설치한 앱은 개발용 서버(sandbox), TestFlight · App Store 앱은 운영 서버 — 기기 주소에 적혀 있다
 * - 410(Unregistered) · 400 BadDeviceToken 이면 그 기기 줄을 지운다 (웹 푸시의 404 · 410 과 같다)
 */

const ORIGINS = { production: "https://api.push.apple.com", sandbox: "https://api.sandbox.push.apple.com" } as const;
const TOKEN_REUSE_SECONDS = 50 * 60;

export function apnsConfigured(): boolean {
  return appleKey() !== null;
}

let cached: { value: string; at: number; source: string } | null = null;

/** 애플에 나를 밝히는 토큰 (ES256 JWT — iss 팀 ID · iat). force = 애플이 만료라고 했을 때 새로 */
export function providerToken(force = false): string | null {
  const key = appleKey();
  if (!key) return null;
  const now = Math.floor(Date.now() / 1000);
  const source = `${key.teamId}|${key.keyId}`;
  if (!force && cached && cached.source === source && now - cached.at < TOKEN_REUSE_SECONDS) return cached.value;
  cached = { value: signAppleJwt(key, { iss: key.teamId, iat: now }), at: now, source };
  return cached.value;
}

export type ApnsMessage = { title: string; body: string; url?: string; tag?: string; ttl?: number };
type Row = { id: number; endpoint: string };
type Reply = { status: number; reason?: string };

/** 알림 묶음 이름(apns-collapse-id)은 64바이트까지 — 길면 해시로 줄인다 (같은 tag 는 같은 이름 — 새 알림이 옛 알림을 갈아 끼운다) */
export function collapseId(tag: string | undefined): string | null {
  if (!tag) return null;
  return Buffer.byteLength(tag) <= 64 ? tag : createHash("sha256").update(tag).digest("hex");
}

/** 애플에 보내는 내용 — 4KB 안. 누르면 갈 주소는 `url` (앱의 `NativeAppBridge` 가 읽는다) */
export function apnsPayload(message: ApnsMessage): string {
  return JSON.stringify({
    aps: { alert: { title: message.title.slice(0, 200), body: message.body.slice(0, 1000) }, sound: "default" },
    url: message.url ?? "/admin",
  });
}

/** 애플이 이 기기 주소를 더는 받지 않는다 — 그 줄을 지운다 */
export function isGoneReply(r: Reply): boolean {
  return r.status === 410 || (r.status === 400 && r.reason === "BadDeviceToken");
}

function post(session: http2.ClientHttp2Session, deviceToken: string, headers: Record<string, string>, payload: string): Promise<Reply> {
  return new Promise((resolve) => {
    let status = 0;
    let body = "";
    let done = false;
    const finish = (r: Reply) => {
      if (done) return;
      done = true;
      resolve(r);
    };
    try {
      const req = session.request({ ":method": "POST", ":path": `/3/device/${deviceToken}`, ...headers });
      req.setEncoding("utf8");
      req.on("response", (h) => {
        status = Number(h[":status"] ?? 0);
      });
      req.on("data", (chunk: string) => {
        body += chunk;
      });
      req.on("end", () => {
        let reason: string | undefined;
        try {
          reason = (JSON.parse(body) as { reason?: string }).reason;
        } catch {
          reason = undefined;
        }
        finish({ status, reason });
      });
      req.on("error", (error) => finish({ status: 0, reason: error.message }));
      req.setTimeout(10_000, () => {
        req.close(http2.constants.NGHTTP2_CANCEL);
        finish({ status: 0, reason: "timeout" });
      });
      req.end(payload);
    } catch (error) {
      finish({ status: 0, reason: (error as Error).message });
    }
  });
}

/**
 * 앱 기기들로 보낸다 — 운영 · 개발용 서버마다 연결 하나로. 애플이 제공자 토큰이 만료됐다고 하면(403 ExpiredProviderToken) 한 번 새로 만들어 다시 보낸다.
 * origins 는 테스트가 바꾼다 (평소에는 애플 주소).
 */
export async function sendApns(
  rows: readonly Row[],
  message: ApnsMessage,
  opts: { origins?: { production: string; sandbox: string } } = {},
): Promise<{ delivered: number[]; gone: number[]; failed: number }> {
  const out = { delivered: [] as number[], gone: [] as number[], failed: 0 };
  const targets = rows.flatMap((row) => {
    const parsed = parseApnsEndpoint(row.endpoint);
    return parsed ? [{ ...parsed, id: row.id }] : [];
  });
  if (targets.length === 0) return out;
  if (!providerToken()) {
    out.failed += targets.length;
    return out;
  }

  const payload = apnsPayload(message);
  const base: Record<string, string> = {
    "apns-topic": appleBundleId(),
    "apns-push-type": "alert",
    "apns-priority": "10",
    "apns-expiration": String(Math.floor(Date.now() / 1000) + (message.ttl ?? 60 * 60 * 24)),
  };
  const collapse = collapseId(message.tag);
  if (collapse) base["apns-collapse-id"] = collapse;
  const origins = opts.origins ?? ORIGINS;

  for (const sandbox of [false, true]) {
    const group = targets.filter((t) => t.sandbox === sandbox);
    if (group.length === 0) continue;
    let session: http2.ClientHttp2Session;
    try {
      session = http2.connect(sandbox ? origins.sandbox : origins.production);
    } catch (error) {
      console.error("[apns] 연결하지 못했어요", (error as Error).message);
      out.failed += group.length;
      continue;
    }
    session.on("error", (error) => console.error("[apns] 연결 오류", error.message));
    try {
      for (const t of group) {
        let reply = await post(session, t.token, { ...base, authorization: `bearer ${providerToken()}` }, payload);
        if (reply.status === 403 && reply.reason === "ExpiredProviderToken") {
          reply = await post(session, t.token, { ...base, authorization: `bearer ${providerToken(true)}` }, payload);
        }
        if (reply.status === 200) out.delivered.push(t.id);
        else if (isGoneReply(reply)) out.gone.push(t.id);
        else {
          out.failed++;
          console.error("[apns] 발송 실패", reply.status, reply.reason ?? "");
        }
      }
    } finally {
      session.close();
    }
  }
  return out;
}
