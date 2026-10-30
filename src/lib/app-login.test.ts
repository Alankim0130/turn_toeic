import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { APP_CALLBACK_PARAMS, APP_LOGIN_START, appCallbackPath, appCallbackUrl, appLoginTarget } from "@/lib/app-login";
import { APP_AUTH_CALLBACK, APP_CALLBACK_SCHEME } from "@/lib/native-app";

/**
 * 아이폰 앱의 카카오 · 구글 로그인 (2026-10-30). 앱 화면에서는 구글이 로그인을 막아 앱 안 브라우저 창으로 열고,
 * PKCE 검증값은 앱 화면에 둔 채 code 만 앱 주소(winnertoeic://)로 돌려받아 앱 화면의 `/auth/callback` 에서 세션으로 바꾼다.
 */
const SUPA = "https://grldodnbvznnnwpuunnt.supabase.co";
const authorize = (provider: string, extra = "") =>
  `${SUPA}/auth/v1/authorize?provider=${provider}&redirect_to=${encodeURIComponent("https://winnertoeic.com/auth/app-callback?next=/my")}&code_challenge=abc&code_challenge_method=s256${extra}`;

describe("로그인 창을 여는 우리 주소 (/auth/app-start) — 우리 Supabase 의 카카오 · 구글 로그인으로만 보낸다", () => {
  it("카카오 · 구글 로그인 주소는 그대로", () => {
    expect(appLoginTarget(authorize("kakao"), SUPA)).toBe(new URL(authorize("kakao")).toString());
    expect(appLoginTarget(authorize("google"), `${SUPA}/`)).toBe(new URL(authorize("google")).toString());
  });

  it("다른 곳 · 다른 경로 · 다른 로그인은 막는다 (아무 곳으로나 보내는 길이 되지 않게)", () => {
    expect(appLoginTarget("https://evil.example/auth/v1/authorize?provider=kakao", SUPA)).toBeNull();
    expect(appLoginTarget(`${SUPA}.evil.example/auth/v1/authorize?provider=kakao`, SUPA)).toBeNull();
    expect(appLoginTarget(`${SUPA}/auth/v1/token?provider=kakao`, SUPA)).toBeNull();
    expect(appLoginTarget(authorize("apple"), SUPA)).toBeNull();
    expect(appLoginTarget(authorize("github"), SUPA)).toBeNull();
    expect(appLoginTarget(`${SUPA}/auth/v1/authorize`, SUPA)).toBeNull();
    expect(appLoginTarget("javascript:alert(1)", SUPA)).toBeNull();
    expect(appLoginTarget("", SUPA)).toBeNull();
    expect(appLoginTarget(authorize("kakao"), undefined)).toBeNull();
    expect(appLoginTarget(authorize("kakao", `&x=${"a".repeat(4000)}`), SUPA)).toBeNull();
  });
});

describe("앱으로 넘기는 주소 (/auth/app-callback → winnertoeic://auth-callback)", () => {
  it("code · next · 실패 사유만 넘긴다", () => {
    const url = appCallbackUrl(new URLSearchParams({ code: "C1", next: "/my/live", state: "x", error_description: "Error getting user email" }));
    expect(url.startsWith(`${APP_AUTH_CALLBACK}?`)).toBe(true);
    const back = new URL(url).searchParams;
    expect([...back.keys()].every((k) => (APP_CALLBACK_PARAMS as readonly string[]).includes(k))).toBe(true);
    expect(back.get("code")).toBe("C1");
    expect(back.get("state")).toBeNull();
  });

  it("앱 화면이 그 주소를 `/auth/callback` 으로 — 실패 안내는 그 라우트가 웹과 똑같이 한다", () => {
    expect(appCallbackPath(`${APP_AUTH_CALLBACK}?code=C1&next=%2Fmy%2Flive`)).toBe("/auth/callback?code=C1&next=%2Fmy%2Flive");
    expect(appCallbackPath(`${APP_AUTH_CALLBACK}?error=access_denied&error_description=email`)).toBe("/auth/callback?error=access_denied&error_description=email");
    expect(appCallbackPath(APP_AUTH_CALLBACK)).toBe("/auth/callback");
  });

  it("우리 앱 주소가 아니면 열지 않는다", () => {
    expect(appCallbackPath(`${APP_AUTH_CALLBACK}x?code=1`)).toBeNull();
    expect(appCallbackPath("https://winnertoeic.com/auth/callback?code=1")).toBeNull();
    expect(appCallbackPath("other://auth-callback?code=1")).toBeNull();
    expect(appCallbackPath(null)).toBeNull();
  });

  it("주고받는 길이 한 바퀴 돈다", () => {
    const url = appCallbackUrl(new URLSearchParams({ code: "C9", next: "/my" }));
    expect(appCallbackPath(url)).toBe("/auth/callback?code=C9&next=%2Fmy");
  });
});

describe("앱 쪽과 같은 이름", () => {
  const swift = fs.readFileSync("mobile/ios/App/App/WinnerToeicPlugin.swift", "utf8");

  it("로그인 창의 돌아오는 주소 앞부분(winnertoeic)이 Swift 의 기본값과 같다", () => {
    expect(APP_CALLBACK_SCHEME).toBe("winnertoeic");
    expect(swift).toContain(`call.getString("scheme") ?? "${APP_CALLBACK_SCHEME}"`);
  });

  it("서버 액션이 로그인 창을 우리 주소에서 연다 · 라우트가 있다", () => {
    expect(fs.readFileSync("src/app/(auth)/actions.ts", "utf8")).toContain("`${origin}${APP_LOGIN_START}?to=${encodeURIComponent(data.url)}`");
    expect(fs.existsSync(`src/app${APP_LOGIN_START}/route.ts`)).toBe(true);
    expect(fs.existsSync("src/app/auth/app-callback/route.ts")).toBe(true);
    // Supabase 가 돌려보내는 곳은 app-callback — 허용 목록 `https://winnertoeic.com/**` 안이다
    expect(fs.readFileSync("src/app/(auth)/actions.ts", "utf8")).toContain("`${origin}/auth/app-callback?next=${encodeURIComponent(next)}`");
  });
});
