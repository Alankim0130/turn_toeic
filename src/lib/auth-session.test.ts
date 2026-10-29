import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import { createRequire } from "node:module";

/**
 * 로그인 확인 (2026-10-29 점검) — 가짜 요청 머리 · 가짜 Supabase 로 실제로 부른다.
 *  1. 서버 액션(쓰기) 요청이면 로그인 서버에 묻는다(getUser). 관리자 서버 액션은 맨 위 requireStaff · requireCrew 만으로 권한을 보고
 *     서비스 롤로 쓰는데, 그 둘이 토큰 서명(getClaims)만 봐서 로그아웃한 기기의 토큰으로도 만료까지 쓰기가 됐다.
 *  2. 프로필을 **못 읽은 것**(DB 오류)을 행이 없는 것과 가른다 — 예전에는 가입을 마친 사람도 '가입 정보 입력' 으로 보냈다.
 */

const h = vi.hoisted(() => ({
  headers: new Headers(),
  calls: [] as string[],
  profile: { data: null as unknown, error: null as unknown },
}));

vi.mock("next/headers", () => ({ headers: async () => h.headers }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw Object.assign(new Error(`redirect:${to}`), { digest: `NEXT_REDIRECT;${to}` });
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => (h.calls.push("getUser"), { data: { user: { id: "u1", email: "a@b.c", user_metadata: {}, app_metadata: {} } } }),
      getClaims: async () => (h.calls.push("getClaims"), { data: { claims: { sub: "u1", email: "a@b.c" } } }),
    },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => h.profile }) }) }),
  }),
}));

const auth = await import("./auth");

beforeEach(() => {
  h.headers = new Headers();
  h.calls = [];
  h.profile = { data: { id: "u1", name: "김민수", phone: "01012345678", role: "student", merged_into: null }, error: null };
});

describe("getSessionUser — 쓰기는 로그인 서버에, 화면은 토큰 서명으로", () => {
  it("화면(머리 없음)은 getClaims 만", async () => {
    expect((await auth.getSessionUser())?.id).toBe("u1");
    expect(h.calls).toEqual(["getClaims"]);
  });

  it("서버 액션(Next-Action 머리)은 getUser", async () => {
    h.headers = new Headers({ "next-action": "7f0c" });
    expect((await auth.getSessionUser())?.id).toBe("u1");
    expect(h.calls).toEqual(["getUser"]);
  });

  it("자바스크립트 없이 낸 폼(multipart · urlencoded)도 서버 액션으로 본다", async () => {
    h.headers = new Headers({ "content-type": "multipart/form-data; boundary=x" });
    await auth.getSessionUser();
    h.headers = new Headers({ "content-type": "application/x-www-form-urlencoded" });
    await auth.getSessionUser();
    expect(h.calls).toEqual(["getUser", "getUser"]);
  });

  it("Next 가 headers() 에서 next-action 머리를 숨기지 않는다 — 숨기면 쓰기도 조용히 getClaims 로 돌아간다 (판을 올리면 다시 본다)", () => {
    const require = createRequire(import.meta.url);
    const src = fs.readFileSync(require.resolve("next/dist/server/async-storage/request-store.js"), "utf8");
    const hidden = src.slice(src.indexOf("const HIDDEN_REQUEST_HEADERS"), src.indexOf("function getHeaders"));
    expect(hidden.length).toBeGreaterThan(0);
    expect(hidden).not.toMatch(/ACTION_HEADER|next-action/i);
    const { FLIGHT_HEADERS, ACTION_HEADER } = require("next/dist/client/components/app-router-headers.js");
    expect(ACTION_HEADER).toBe("next-action");
    expect(FLIGHT_HEADERS).not.toContain(ACTION_HEADER);
  });

  it("관리자 서버 액션의 requireStaff 도 getUser 를 거친다", async () => {
    h.headers = new Headers({ "next-action": "7f0c" });
    h.profile = { data: { id: "u1", name: "이영수", phone: "01012345678", role: "instructor", merged_into: null }, error: null };
    await auth.requireStaff();
    expect(h.calls).toEqual(["getUser"]);
  });
});

describe("requireUser — 프로필을 못 읽으면 가입 정보 입력으로 보내지 않는다", () => {
  it("DB 오류면 오류 화면(던짐) — /signup/complete 로 가지 않는다", async () => {
    h.profile = { data: null, error: { message: "fetch failed" } };
    await expect(auth.requireUser("/my")).rejects.toThrow("profile_unreadable");
    expect(auth.PROFILE_UNREADABLE).toBe("profile_unreadable");
  });

  it("정말 미완성(행은 있는데 이름 · 휴대폰 없음)이면 예전처럼 입력 화면으로", async () => {
    h.profile = { data: { id: "u1", name: "", phone: null, role: "member", merged_into: null }, error: null };
    await expect(auth.requireUser("/my")).rejects.toThrow("redirect:/signup/complete?next=%2Fmy");
  });

  it("다 갖춘 계정은 그대로 통과", async () => {
    await expect(auth.requireUser("/my")).resolves.toMatchObject({ user: { id: "u1" } });
  });
});
