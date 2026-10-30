import "server-only";

import { createPrivateKey, sign, type KeyObject } from "node:crypto";

/**
 * 애플 개발자 계정의 키 (.p8) — **Apple 로 로그인**(`apple-auth.ts`)과 **애플 푸시 APNs**(`apns.ts`)가 같은 키를 쓴다 (2026-10-30 아이폰 앱).
 * 애플 개발자 사이트 Certificates, Identifiers & Profiles → Keys 에서 키 하나에 두 기능(Apple Push Notifications service ·
 * Sign in with Apple)을 켜고 만든다. .p8 파일은 **한 번만 받을 수 있다** — 잃어버리면 새 키를 만들고 환경변수를 바꾼다.
 *
 * Vercel 환경변수 (서버 전용 — 저장소 · 브라우저에 두지 않는다. mobile/README.md · docs/HANDOVER.md 부록):
 *   APPLE_TEAM_ID      팀 ID (10자 — Membership 화면)
 *   APPLE_KEY_ID       키 ID (10자 — 키를 만든 화면)
 *   APPLE_PRIVATE_KEY  .p8 파일 내용 전체 (-----BEGIN PRIVATE KEY----- 부터. 줄바꿈을 \n 으로 적어도 된다)
 * 하나라도 없으면 Apple 로그인의 토큰 저장 · 앱 푸시는 조용히 꺼진다 (웹 푸시 · 다른 로그인은 그대로).
 */

export type AppleKey = { teamId: string; keyId: string; privateKey: KeyObject };

let cached: { source: string; key: AppleKey | null } | null = null;

/** .p8 내용 — 줄바꿈을 \n 으로 적은 값 · 머리줄 없이 본문만 넣은 값도 받는다 */
export function normalizePrivateKey(raw: string): string {
  const text = raw.replace(/\\n/g, "\n").trim();
  if (text.includes("BEGIN PRIVATE KEY")) return text;
  const body = text.replace(/\s+/g, "");
  return `-----BEGIN PRIVATE KEY-----\n${body.match(/.{1,64}/g)?.join("\n") ?? body}\n-----END PRIVATE KEY-----`;
}

export function appleKey(): AppleKey | null {
  const teamId = process.env.APPLE_TEAM_ID?.trim() ?? "";
  const keyId = process.env.APPLE_KEY_ID?.trim() ?? "";
  const raw = process.env.APPLE_PRIVATE_KEY ?? "";
  const source = `${teamId}|${keyId}|${raw}`;
  if (cached?.source === source) return cached.key;
  let key: AppleKey | null = null;
  if (teamId && keyId && raw.trim()) {
    try {
      key = { teamId, keyId, privateKey: createPrivateKey(normalizePrivateKey(raw)) };
    } catch (error) {
      console.error("[apple] APPLE_PRIVATE_KEY 를 읽지 못했어요", (error as Error).message);
    }
  }
  cached = { source, key };
  return key;
}

const b64url = (value: string | Buffer) => Buffer.from(value).toString("base64url");

/** ES256 JWT — 애플 푸시의 제공자 토큰 · Apple 로그인의 client_secret 이 이 모양이다 */
export function signAppleJwt(key: AppleKey, payload: Record<string, unknown>): string {
  const input = `${b64url(JSON.stringify({ alg: "ES256", kid: key.keyId }))}.${b64url(JSON.stringify(payload))}`;
  const signature = sign("sha256", Buffer.from(input), { key: key.privateKey, dsaEncoding: "ieee-p1363" });
  return `${input}.${b64url(signature)}`;
}

/** 앱의 번들 ID — 앱 푸시의 주제(apns-topic) · 앱 Apple 로그인의 client_id. mobile/ios 의 PRODUCT_BUNDLE_IDENTIFIER 와 같아야 한다 */
export function appleBundleId(): string {
  return process.env.APPLE_BUNDLE_ID?.trim() || "com.winnertoeic.app";
}
