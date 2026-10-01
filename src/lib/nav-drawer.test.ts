import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CONTACT_OPTIONS, NAV_BOTTOM, NAV_DRAWER, NAV_MAIN, site, STUDENT_FEATURES, STUDENT_HUB } from "./site";

/**
 * 햄버거 메뉴 묶음 (2026-09-18 Alan — 마이페이지 메뉴 줄을 없애고 햄버거에 정리해 담았다).
 * 좁은 화면에서 어떤 화면으로 가는 길이 여기뿐이므로, 빠지면 그 화면은 주소를 직접 쳐야만 갈 수 있다.
 */
const rows = NAV_DRAWER.flatMap((s) => s.items);
const hrefs = rows.map((r) => r.href);

describe("햄버거 메뉴 묶음 (NAV_DRAWER)", () => {
  it("없앤 마이페이지 메뉴 줄의 아홉 항목이 전부 들어 있다", () => {
    for (const href of ["/my", "/my/verify", "/my/class", "/my/live", "/my/replay", "/my/homework", "/my/study", "/my/textbook", "/my/lc-audio"]) {
      expect(hrefs, href).toContain(href);
    }
  });

  it("수강생전용 기능 7개가 한 번씩, 잠금 판정용 feature 와 함께 들어 있다", () => {
    for (const f of STUDENT_FEATURES) {
      const found = rows.filter((r) => r.feature === f.key);
      expect(found, f.key).toHaveLength(1);
      expect(found[0].href).toBe(f.href);
    }
  });

  it("PC 상단 메뉴·하단 바에 있는 주소는 서랍에도 있다 (좁은 화면에서 못 가는 곳이 없게)", () => {
    for (const item of [...NAV_MAIN, ...NAV_BOTTOM]) expect(hrefs, item.label).toContain(item.href);
  });

  it("주소가 겹치지 않고 묶음마다 이름과 항목이 있다", () => {
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const s of NAV_DRAWER) {
      expect(s.label).toBeTruthy();
      expect(s.items.length).toBeGreaterThan(0);
    }
  });

  // 아래로 내려 두면 학습 묶음까지 지나야 나와서, 처음 온 사람이 "여기가 뭐 하는 곳인가" 를 못 찾는다
  it("소개 · 수강생전용 안내가 맨 위 묶음이다 (2026-09-19 Alan)", () => {
    expect(NAV_DRAWER[0].label).toBe("안내");
    expect(NAV_DRAWER[0].items.map((i) => i.href)).toEqual(["/", STUDENT_HUB.href]);
  });

  it("아이콘 파일이 전부 있다 (public/icons — 이모지 대신 힉스필드 아이콘)", () => {
    for (const r of rows) expect(existsSync(`public/icons/${r.icon}.png`), r.icon).toBe(true);
  });
});

/**
 * 연락하기 세 갈래 (2026-10-01 Alan — 연락하기 · 네이버 상담예약 두 항목을 하나로 합치고 셋 중 고른다).
 * PC 드롭다운 · 서랍 `연락` 묶음 · 푸터 · /contact 카드가 전부 CONTACT_OPTIONS 를 읽으므로 여기만 지키면 네 곳이 같다.
 */
describe("연락하기 세 갈래 (CONTACT_OPTIONS)", () => {
  it("비대면 카카오톡 · 비대면 이메일 · 대면 네이버예약 순서다", () => {
    expect(CONTACT_OPTIONS.map((o) => o.key)).toEqual(["kakao", "email", "naver"]);
    expect(CONTACT_OPTIONS.map((o) => o.label)).toEqual(["비대면상담 (카카오톡)", "비대면상담 (이메일)", "대면상담 (네이버예약)"]);
  });

  it("카카오톡은 채팅 주소다 — Alan 이 준 로그인 페이지로 감싼 주소를 그대로 넣지 않는다", () => {
    const kakao = CONTACT_OPTIONS.find((o) => o.key === "kakao")!;
    expect(kakao.href).toBe(site.academy.kakaoChatUrl);
    expect(kakao.href.startsWith("https://pf.kakao.com/")).toBe(true);
    expect(kakao.href).not.toContain("accounts.kakao.com");
    expect(kakao.external).toBe(true);
  });

  it("이메일은 이 사이트의 문의 폼이고 네이버는 예약 상품으로 나간다", () => {
    const email = CONTACT_OPTIONS.find((o) => o.key === "email")!;
    expect(email.href).toBe("/contact");
    expect(email.external).toBeUndefined();
    expect(CONTACT_OPTIONS.find((o) => o.key === "naver")).toMatchObject({ href: site.academy.naverBookingUrl, external: true });
  });

  it("상단 메뉴에는 연락하기 드롭다운 하나뿐이다 (네이버 상담예약이 따로 서지 않는다)", () => {
    const contact = NAV_MAIN.filter((i) => i.group === "contact");
    expect(contact).toHaveLength(1);
    expect(contact[0].href).toBe("/contact");
    expect(NAV_MAIN.some((i) => i.external)).toBe(false);
  });

  it("서랍 `연락` 묶음이 같은 세 갈래다", () => {
    const section = NAV_DRAWER.find((s) => s.label === "연락")!;
    expect(section.items.map((i) => i.href)).toEqual(CONTACT_OPTIONS.map((o) => o.href));
    expect(section.items.map((i) => i.label)).toEqual(CONTACT_OPTIONS.map((o) => o.label));
  });
});
