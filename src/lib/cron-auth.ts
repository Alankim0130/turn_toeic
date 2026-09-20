import "server-only";
import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

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
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  // 길이가 다르면 timingSafeEqual 이 던지므로 먼저 본다 (길이는 비밀이 아니다)
  return a.length === b.length && timingSafeEqual(a, b);
}
