import { generateKeyPairSync, verify } from "node:crypto";
import fs from "node:fs";
import http2 from "node:http2";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 아이폰 앱 알림 — 애플 푸시(APNs) (2026-10-30). 앱 화면에는 웹 푸시가 없어 앱 기기는 애플 푸시로 받는다.
 * 가짜 애플 서버(로컬 HTTP/2)를 띄워 실제로 보내 본다 — 머리(경로 · 주제 · 토큰) · 내용 · 410 이면 기기 지우기 · 만료된 토큰이면 한 번 다시.
 */

const { apnsPayload, collapseId, isGoneReply, providerToken, sendApns } = await import("@/lib/apns");
const { APNS_KEY_MARK, parseApnsEndpoint } = await import("@/lib/push-endpoint");
const { apnsEndpoint } = await import("@/lib/native-app");

const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const TOKEN_A = "a".repeat(64);
const TOKEN_B = "b".repeat(64);

type Seen = { origin: string; headers: http2.IncomingHttpHeaders; body: string };
const seen: Seen[] = [];
let reply: (s: Seen, n: number) => { status: number; reason?: string } = () => ({ status: 200 });

function server(name: string) {
  const s = http2.createServer();
  s.on("stream", (stream, headers) => {
    let body = "";
    stream.setEncoding("utf8");
    stream.on("data", (c: string) => (body += c));
    stream.on("end", () => {
      const entry = { origin: name, headers, body };
      seen.push(entry);
      const r = reply(entry, seen.length);
      stream.respond({ ":status": r.status, "content-type": "application/json" });
      stream.end(r.reason ? JSON.stringify({ reason: r.reason }) : "");
    });
  });
  return s;
}

const prod = server("production");
const sand = server("sandbox");
let origins: { production: string; sandbox: string };

beforeAll(async () => {
  await Promise.all([new Promise<void>((r) => prod.listen(0, "127.0.0.1", r)), new Promise<void>((r) => sand.listen(0, "127.0.0.1", r))]);
  origins = {
    production: `http://127.0.0.1:${(prod.address() as AddressInfo).port}`,
    sandbox: `http://127.0.0.1:${(sand.address() as AddressInfo).port}`,
  };
});
afterAll(() => {
  prod.close();
  sand.close();
});
beforeEach(() => {
  seen.length = 0;
  reply = () => ({ status: 200 });
  process.env.APPLE_TEAM_ID = "TEAM123456";
  process.env.APPLE_KEY_ID = "KEY1234567";
  process.env.APPLE_PRIVATE_KEY = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
  process.env.APPLE_BUNDLE_ID = "com.winnertoeic.app";
});
afterEach(() => {
  delete process.env.APPLE_TEAM_ID;
  delete process.env.APPLE_KEY_ID;
  delete process.env.APPLE_PRIVATE_KEY;
  delete process.env.APPLE_BUNDLE_ID;
});

const rows = [
  { id: 1, endpoint: apnsEndpoint(TOKEN_A, false) },
  { id: 2, endpoint: apnsEndpoint(TOKEN_B.toUpperCase(), true) },
  { id: 3, endpoint: "https://fcm.googleapis.com/fcm/send/x" },
];
const message = { title: "불라방이 시작됐어요", body: "10:00~11:00 · RC · 3회차 방송이 시작됐어요", url: "/my/live", tag: "live-12-2026-10-30", ttl: 3600 };

describe("기기 주소", () => {
  it("apns://production|sandbox/<소문자 16진수> — 앱이 만든 주소를 서버가 그대로 읽는다", () => {
    expect(apnsEndpoint(` ${TOKEN_B.toUpperCase()} `, true)).toBe(`apns://sandbox/${TOKEN_B}`);
    expect(parseApnsEndpoint(apnsEndpoint(TOKEN_A, false))).toEqual({ sandbox: false, token: TOKEN_A });
    expect(parseApnsEndpoint(`apns://sandbox/${TOKEN_A}`)).toEqual({ sandbox: true, token: TOKEN_A });
  });

  it("다른 꼴은 앱 기기가 아니다 (웹 푸시 주소 · 짧은 토큰 · 다른 서버 이름)", () => {
    expect(parseApnsEndpoint("https://web.push.apple.com/x")).toBeNull();
    expect(parseApnsEndpoint("apns://production/abc")).toBeNull();
    expect(parseApnsEndpoint(`apns://evil.example/${TOKEN_A}`)).toBeNull();
    expect(parseApnsEndpoint(`apns://production/${TOKEN_A}/x`)).toBeNull();
    expect(APNS_KEY_MARK).toBe("apns");
  });
});

describe("보내기", () => {
  it("운영 · 개발용 서버로 나눠 — 경로 · 주제 · 알림 종류 · 묶음 이름 · ES256 토큰", async () => {
    const out = await sendApns(rows, message, { origins });
    expect(out).toEqual({ delivered: [1, 2], gone: [], failed: 0 });
    expect(seen.map((s) => [s.origin, s.headers[":path"]])).toEqual([
      ["production", `/3/device/${TOKEN_A}`],
      ["sandbox", `/3/device/${TOKEN_B}`],
    ]);
    const h = seen[0].headers;
    expect(h["apns-topic"]).toBe("com.winnertoeic.app");
    expect(h["apns-push-type"]).toBe("alert");
    expect(h["apns-priority"]).toBe("10");
    expect(h["apns-collapse-id"]).toBe(message.tag);
    expect(Number(h["apns-expiration"]) - Math.floor(Date.now() / 1000)).toBeGreaterThan(3500);
    const [head, body, sig] = String(h.authorization).replace(/^bearer /, "").split(".");
    expect(JSON.parse(Buffer.from(head, "base64url").toString())).toEqual({ alg: "ES256", kid: "KEY1234567" });
    expect(JSON.parse(Buffer.from(body, "base64url").toString())).toMatchObject({ iss: "TEAM123456" });
    expect(verify("sha256", Buffer.from(`${head}.${body}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(sig, "base64url"))).toBe(true);
    expect(JSON.parse(seen[0].body)).toEqual({ aps: { alert: { title: message.title, body: message.body }, sound: "default" }, url: "/my/live" });
  });

  it("410 · BadDeviceToken 이면 지울 기기, 그 밖의 실패는 센다 (다른 앱의 토큰이면 지우지 않는다 — 설정이 틀렸을 수 있다)", async () => {
    const plan = [{ status: 410, reason: "Unregistered" }, { status: 400, reason: "BadDeviceToken" }, { status: 400, reason: "DeviceTokenNotForTopic" }, { status: 500, reason: "InternalServerError" }];
    reply = (_s, n) => plan[n - 1];
    const four = [1, 2, 3, 4].map((id) => ({ id, endpoint: apnsEndpoint(String(id).repeat(64), false) }));
    expect(await sendApns(four, message, { origins })).toEqual({ delivered: [], gone: [1, 2], failed: 2 });
    expect(isGoneReply({ status: 410 })).toBe(true);
    expect(isGoneReply({ status: 400, reason: "DeviceTokenNotForTopic" })).toBe(false);
  });

  it("애플이 토큰이 만료됐다고 하면 한 번 새로 만들어 다시 보낸다", async () => {
    reply = (_s, n) => (n === 1 ? { status: 403, reason: "ExpiredProviderToken" } : { status: 200 });
    expect(await sendApns([rows[0]], message, { origins })).toEqual({ delivered: [1], gone: [], failed: 0 });
    expect(seen).toHaveLength(2);
  });

  it("키가 없으면 보내지 않고 실패로 센다 · 앱 기기가 아닌 줄은 건드리지 않는다", async () => {
    delete process.env.APPLE_PRIVATE_KEY;
    expect(await sendApns(rows, message, { origins })).toEqual({ delivered: [], gone: [], failed: 2 });
    expect(seen).toHaveLength(0);
    expect(await sendApns([rows[2]], message, { origins })).toEqual({ delivered: [], gone: [], failed: 0 });
  });

  it("서버가 없으면(연결 실패) 실패로 세고 멈추지 않는다", async () => {
    const out = await sendApns([rows[0]], message, { origins: { production: "http://127.0.0.1:1", sandbox: "http://127.0.0.1:1" } });
    expect(out).toEqual({ delivered: [], gone: [], failed: 1 });
  });
});

describe("내용 · 묶음 이름 · 토큰", () => {
  it("묶음 이름은 64바이트까지 — 길면 해시 (같은 tag 는 같은 이름)", () => {
    expect(collapseId("live-12")).toBe("live-12");
    const long = "숙제미제출-".repeat(10);
    expect(collapseId(long)).toMatch(/^[0-9a-f]{64}$/);
    expect(collapseId(long)).toBe(collapseId(long));
    expect(collapseId(undefined)).toBeNull();
  });

  it("4KB 안 — 본문은 1,000자까지 · 누르면 갈 주소가 없으면 관리자 첫 화면", () => {
    const p = JSON.parse(apnsPayload({ title: "t", body: "가".repeat(3000) }));
    expect(p.aps.alert.body).toHaveLength(1000);
    expect(p.url).toBe("/admin");
    expect(Buffer.byteLength(apnsPayload({ title: "가".repeat(500), body: "가".repeat(3000), url: "/my" }))).toBeLessThan(4096);
  });

  it("제공자 토큰은 50분 동안 다시 쓴다 (애플은 20분보다 자주 새로 만들면 거절한다)", () => {
    const a = providerToken(true);
    expect(providerToken()).toBe(a);
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 51 * 60 * 1000);
    expect(providerToken()).not.toBe(a);
    vi.useRealTimers();
  });
});

describe("웹 푸시와 같은 표 · 같은 길", () => {
  it("보낼 때만 갈린다 — deliver 가 앱 기기를 애플 푸시로", () => {
    const s = fs.readFileSync("src/lib/push.ts", "utf8");
    expect(s).toContain("const appRows = rows.filter((r) => parseApnsEndpoint(r.endpoint));");
    expect(s).toContain("await sendApns(appRows, message)");
    expect(s).toContain("return configure() || apnsConfigured();");
  });

  it("앱 기기 저장 — 애플 키가 없으면 켜지 않고, 웹 푸시 키 칸에는 표시만", () => {
    const s = fs.readFileSync("src/lib/push-subscription.ts", "utf8");
    expect(s).toContain("if (parseApnsEndpoint(raw)) {");
    expect(s).toContain("if (!apnsConfigured()) return { ok: false");
    expect(s).toContain("row = { endpoint: raw, p256dh: APNS_KEY_MARK, auth: APNS_KEY_MARK };");
  });

  it("앱이 알림 권한 · 토큰을 받고 개발용 서버인지도 앱이 알려 준다", () => {
    const client = fs.readFileSync("src/components/push/push-client.ts", "utf8");
    expect(client).toContain("apnsEndpoint(");
    expect(client).toContain("getInfo()");
    const plugin = fs.readFileSync("mobile/ios/App/App/WinnerToeicPlugin.swift", "utf8");
    expect(plugin).toContain("aps-environment");
    const entitlements = fs.readFileSync("mobile/ios/App/App/App.entitlements", "utf8");
    expect(entitlements).toContain("<key>aps-environment</key>");
  });
});
