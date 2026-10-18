import fs from "node:fs";
import { describe, expect, it } from "vitest";

const read = (f: string) => fs.readFileSync(f, "utf8");

/**
 * 네이버 예약 자리에는 네이버 N (2026-10-18 Alan — "네이버예약 앞에 네이버 로고를 넣어줘. 보기가 더 직관적일것 같아").
 * 카카오톡 상담 줄이 노란 타일 + 카카오 심벌인 것처럼, 네이버 예약을 가리키는 자리는 **네이버 그린(#03C75A) 바탕 + 흰 N** 이다.
 * 그전에는 네이버 줄만 달력 아이콘이라 카카오 줄 옆에서 어디로 가는지 한눈에 안 읽혔다.
 */
describe("브랜드 표식 — 네이버 N", () => {
  const PLACES: Record<string, string> = {
    "src/components/layout/DesktopNav.tsx": "PC 연락하기 드롭다운의 네이버 줄",
    "src/components/layout/MobileMenu.tsx": "햄버거 서랍 `연락` 묶음의 네이버 줄",
    "src/app/(public)/contact/page.tsx": "연락하기 허브 카드의 `네이버로 예약하기` 버튼",
    "src/app/admin/page.tsx": "관리자 대시보드 네이버 예약 위젯",
    "src/app/admin/naver-reservations/page.tsx": "네이버 예약 현황의 `네이버` 버튼",
    "src/app/admin/notifications/page.tsx": "알림 설정의 `네이버 예약 자동 확인`",
  };

  it.each(Object.entries(PLACES))("%s (%s) — 초록 바탕에 네이버 N", (file) => {
    const s = read(file);
    expect(s).toMatch(/<NaverMark size=\{\d+\} \/>/);
    expect(s).toContain("bg-[#03C75A]");
  });

  it("NaverMark 는 흰 N 하나 — 바탕은 쓰는 쪽이 그리고, 화면 낭독기는 옆 글자를 읽는다", () => {
    const s = read("src/components/ui/BrandMarks.tsx");
    const fn = s.slice(s.indexOf("export function NaverMark"));
    expect(fn).toContain('fill="#FFFFFF"');
    expect(fn).toContain("aria-hidden");
    expect(fn).not.toContain("<rect");
  });

  it("연락하기의 네이버 줄은 달력 아이콘이 아니라 네이버 N (카카오 줄과 같은 자리)", () => {
    // PC 드롭다운은 CONTACT_OPTIONS 의 key 로, 서랍은 주소로 가른다 — 네이버 예약 주소가 바뀌어도 따라온다
    expect(read("src/components/layout/DesktopNav.tsx")).toMatch(/o\.key === "naver" \? <NaverMark size=\{\d+\} \/>/);
    expect(read("src/components/layout/MobileMenu.tsx")).toMatch(/const naver = item\.href === site\.academy\.naverBookingUrl;/);
    expect(read("src/app/(public)/contact/page.tsx")).toMatch(/o\.key === "naver" && <NaverMark size=\{\d+\} \/>/);
  });

  it("관리자 대시보드 네이버 예약 위젯 머리에 달력 아이콘이 남지 않는다", () => {
    const s = read("src/app/admin/page.tsx");
    const widget = s.slice(s.indexOf("<Link href={NAVER_PAGE}"), s.indexOf("네이버 예약</span>"));
    expect(widget).toContain("<NaverMark");
    expect(widget).not.toContain('name="calendar"');
  });
});
