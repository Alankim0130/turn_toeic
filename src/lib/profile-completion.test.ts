import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COMPLETE_PROFILE_PATH, isProfileIncomplete } from "./auth";

/**
 * 구글 로그인 뒤 가입 정보 입력 (2026-09-17). 판정이 어긋나면 구글로 들어온 회원이
 * 실명 없이 등업신청까지 가거나(수강증 대조 실패), 반대로 완성된 계정이 입력 화면에 갇힌다.
 */
describe("가입 정보 완성 판정 — 구글로 들어온 계정", () => {
  it("실명과 휴대폰이 다 있어야 완성이다", () => {
    expect(isProfileIncomplete({ name: "김민수", phone: "01012345678" })).toBe(false);
  });

  it("구글로 처음 들어온 계정(이름 빈 문자열 · 휴대폰 없음)은 미완성", () => {
    expect(isProfileIncomplete({ name: "", phone: null })).toBe(true);
  });

  it("이름만 있고 휴대폰이 없어도 미완성 (휴대폰은 필수)", () => {
    expect(isProfileIncomplete({ name: "김민수", phone: null })).toBe(true);
  });

  it("공백만 있는 이름은 빈 이름이다", () => {
    expect(isProfileIncomplete({ name: "   ", phone: "01012345678" })).toBe(true);
  });

  it("프로필 행이 없어도 미완성 — complete_profile 이 행을 만든다", () => {
    expect(isProfileIncomplete(null)).toBe(true);
    expect(isProfileIncomplete(undefined)).toBe(true);
  });

  it("입력 화면 주소는 /signup/complete 이고, 화면 파일이 있다", () => {
    expect(COMPLETE_PROFILE_PATH).toBe("/signup/complete");
    const page = readFileSync("src/app/(auth)/signup/complete/page.tsx", "utf8");
    // 되돌이 방지: 이 화면이 requireUser 를 가져다 쓰면 미완성 계정이 자기 자신으로 무한히 튕긴다 (주석은 무시하고 import 만 본다)
    expect(page).not.toMatch(/import\s*\{[^}]*\brequireUser\b/);
    expect(page.includes("isProfileIncomplete(")).toBe(true);
  });

  it("가입 트리거는 우리 가입 폼(provider=email)의 메타데이터만 믿는다", () => {
    // 구글이 넣는 name 은 표시 이름이라 실명이 아니다 — 이 조건이 빠지면 구글 이름이 잠긴 실명이 된다
    const sql = readFileSync("supabase/migrations/20260917113000_google_signin_profile_completion.sql", "utf8");
    expect(sql).toMatch(/raw_app_meta_data ->> 'provider'.*= 'email'/);
    expect(sql).toMatch(/create or replace function public\.complete_profile/);
  });
});
