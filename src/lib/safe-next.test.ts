import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { safeNextPath } from "./safe-next";

describe("safeNextPath — 로그인 뒤 돌아갈 주소는 우리 사이트 안의 경로만", () => {
  it("보통의 경로는 그대로 (물음표 · # 포함)", () => {
    expect(safeNextPath("/my")).toBe("/my");
    expect(safeNextPath("/my/class?tab=all#top")).toBe("/my/class?tab=all#top");
    expect(safeNextPath("/files/textbook/1?w=480")).toBe("/files/textbook/1?w=480");
    expect(safeNextPath("/my/verify?name=%EA%B9%80")).toBe("/my/verify?name=%EA%B9%80");
  });

  it("밖으로 나가는 꼴은 전부 /my — 역슬래시(2026-10-09), 두 슬래시, 절대 주소, 빈 값, 공백 · 제어 문자", () => {
    // 브라우저는 `/\evil.com` 을 https://evil.com/ 으로 읽는다
    expect(new URL("/\\evil.com", "https://winnertoeic.com").href).toBe("https://evil.com/");
    for (const bad of ["/\\evil.com", "/\\\\evil.com", "//evil.com", "/\\/evil.com", "https://evil.com", "http://evil.com/my", "javascript:alert(1)", "", "my", "/my\n", "/my\t", "/\u0000my", " /my"]) {
      expect(safeNextPath(bad), JSON.stringify(bad)).toBe("/my");
    }
    expect(safeNextPath(undefined)).toBe("/my");
    expect(safeNextPath(null)).toBe("/my");
    expect(safeNextPath(["/my"])).toBe("/my");
    expect(safeNextPath("/" + "a".repeat(2001))).toBe("/my");
  });

  it("되돌아갈 기본 주소를 바꿀 수 있다", () => {
    expect(safeNextPath("//evil.com", "/signup/complete")).toBe("/signup/complete");
  });

  it("소스 — 네 곳이 전부 이 함수를 쓴다 (각자 startsWith 로 다시 거르지 않는다)", () => {
    for (const p of ["src/app/(auth)/actions.ts", "src/app/(auth)/signup/complete/page.tsx", "src/app/auth/callback/route.ts", "src/app/auth/confirm/route.ts"]) {
      const src = readFileSync(p, "utf8");
      expect(src, p).toContain("safeNextPath(");
      expect(src, p).not.toMatch(/startsWith\("\/\/"\)/);
    }
  });
});
