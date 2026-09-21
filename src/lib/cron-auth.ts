import "server-only";
import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const same = (got: string, secret: string) => {
  const a = Buffer.from(got);
  const b = Buffer.from(secret);
  // 길이가 다르면 timingSafeEqual 이 던지므로 먼저 본다 (길이는 비밀이 아니다)
  return a.length === b.length && timingSafeEqual(a, b);
};

let cachedSecret: { value: string; at: number } | null = null;

/** DB 금고의 app_cron_secret (마이그레이션 20260921100500 이 DB 안에서 만든 값). 10분 동안 기억한다 */
async function appCronSecret(fresh: boolean): Promise<string | null> {
  if (!fresh && cachedSecret && Date.now() - cachedSecret.at < 10 * 60_000) return cachedSecret.value;
  const { data, error } = await createAdminClient().rpc("app_cron_secret");
  if (error || typeof data !== "string" || data.length < 32) {
    console.error("[cron-auth] app_cron_secret 을 못 읽었어요", error?.message ?? "");
    return null;
  }
  cachedSecret = { value: data, at: Date.now() };
  return data;
}

/**
 * DB 크론(pg_cron → pg_net)이 부른 것인지 확인한다 — 네이버 예약 확인 · 유튜브 불라방 감지.
 * DB 가 `x-app-cron-secret` 헤더에 금고의 비밀을 붙여 보낸다 (`private.call_app`). **비밀을 못 읽으면 거절한다**(fail-closed).
 * 손으로 부를 때를 위해 Vercel 크론과 같은 `Authorization: Bearer <CRON_SECRET>` 도 받는다.
 */
export async function authorizedAppCall(req: NextRequest): Promise<boolean> {
  if (authorizedCron(req)) return true;
  const got = (req.headers.get("x-app-cron-secret") ?? "").trim();
  if (!got) return false;
  const secret = await appCronSecret(false);
  if (secret && same(got, secret)) return true;
  // 금고의 값을 바꿨을 수 있다 — 기억한 지 1분이 넘었으면 한 번만 다시 읽는다 (틀린 헤더로 DB 를 두들기지 못하게)
  if (cachedSecret && Date.now() - cachedSecret.at > 60_000) {
    const again = await appCronSecret(true);
    return !!again && same(got, again);
  }
  return false;
}

/**
 * Vercel Cron 이 부른 것인지 확인한다. **비밀이 없으면 무조건 거절한다**(fail-closed) —
 * 환경변수를 빠뜨린 배포에서 크론 주소가 누구에게나 열리면 안 된다.
 *
 * 비교는 `timingSafeEqual` 로 한 번에 한다. 글자를 하나씩 비교하면 맞는 글자가 늘수록
 * 응답이 미세하게 느려져, 그 시간차로 비밀을 한 글자씩 알아낼 수 있다.
 * (네이버 웹훅도 같은 방식이다 — 도메인 규칙 8)
 */
export function authorizedCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  return same(token, secret);
}
