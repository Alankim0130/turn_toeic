import "server-only";

import { headers } from "next/headers";
import { isAppUserAgent } from "@/lib/native-app";

/**
 * 이 요청이 아이폰 앱(`mobile/`)에서 왔나 — 앱은 사용자 에이전트 끝에 `WinnerToeicApp/` 을 붙인다 (`native-app.ts`).
 * **이미 동적인 화면에서만 부른다** (로그인 · 가입 화면처럼 주소의 물음표 뒤를 읽는 곳) — `headers()` 를 부르면 그 화면은 미리 만들어 두지 못한다.
 * 정적인 화면(랜딩 등)에서 앱만 숨길 것은 CSS `.hide-in-app` 으로 한다.
 */
export async function isAppRequest(): Promise<boolean> {
  return isAppUserAgent((await headers()).get("user-agent"));
}
