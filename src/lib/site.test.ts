import { describe, expect, it } from "vitest";
import { normalizeSiteUrl } from "./site";

describe("normalizeSiteUrl — 공개 주소 다듬기", () => {
  it("끝의 슬래시를 뗀다", () => {
    expect(normalizeSiteUrl("https://winnertoeic.com/")).toBe("https://winnertoeic.com");
  });

  it("슬래시를 여러 개 붙여도 다 뗀다", () => {
    expect(normalizeSiteUrl("https://winnertoeic.com///")).toBe("https://winnertoeic.com");
  });

  it("멀쩡한 주소는 그대로 둔다", () => {
    expect(normalizeSiteUrl("https://winnertoeic.com")).toBe("https://winnertoeic.com");
  });

  it("앞뒤 공백을 지운다 — 복사하다 딸려 온다", () => {
    expect(normalizeSiteUrl("  https://winnertoeic.com/  ")).toBe("https://winnertoeic.com");
  });

  it("경로 가운데 슬래시는 건드리지 않는다", () => {
    expect(normalizeSiteUrl("https://winnertoeic.com/kr/")).toBe("https://winnertoeic.com/kr");
  });

  it("빈 값이면 로컬로 되돌린다 — new URL('') 이 터져 빌드가 실패한다", () => {
    expect(normalizeSiteUrl("")).toBe("http://localhost:3000");
    expect(normalizeSiteUrl("   ")).toBe("http://localhost:3000");
    expect(normalizeSiteUrl("/")).toBe("http://localhost:3000");
  });

  it("이어 붙여도 슬래시가 겹치지 않는다 — 사이트맵·가입 메일이 쓰는 꼴", () => {
    const url = normalizeSiteUrl("https://winnertoeic.com/");
    expect(`${url}/sitemap.xml`).toBe("https://winnertoeic.com/sitemap.xml");
    expect(`${url}/auth/callback?next=/my`).toBe("https://winnertoeic.com/auth/callback?next=/my");
  });
});
