import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isSocialProvider, NO_SOCIAL_LOGINS, SOCIAL_PROVIDERS } from "./social";

/** 간편 로그인(구글·카카오). 서버 액션이 폼에서 넘어온 provider 를 그대로 Supabase 에 넘기지 않게 지킨다 */
describe("간편 로그인 provider", () => {
  it("구글·카카오만 받는다 — 카카오가 먼저다 (버튼 순서)", () => {
    expect([...SOCIAL_PROVIDERS]).toEqual(["kakao", "google"]);
  });

  it("목록에 없는 값은 거부한다", () => {
    for (const v of ["github", "email", "", "Google", null, undefined, 1, {}]) expect(isSocialProvider(v), String(v)).toBe(false);
    for (const p of SOCIAL_PROVIDERS) expect(isSocialProvider(p)).toBe(true);
  });

  it("설정을 못 읽으면 전부 꺼진 것으로 본다", () => {
    expect(Object.keys(NO_SOCIAL_LOGINS).sort()).toEqual([...SOCIAL_PROVIDERS].sort());
    expect(Object.values(NO_SOCIAL_LOGINS).every((v) => v === false)).toBe(true);
  });

  it("서버 액션이 provider 를 검사하고, 켜져 있는지도 본다", () => {
    const src = readFileSync("src/app/(auth)/actions.ts", "utf8");
    const body = src.slice(src.indexOf("export async function signInWithSocial"));
    expect(body).toContain("isSocialProvider(provider)");
    expect(body).toContain("getSocialLogins()");
  });
});
