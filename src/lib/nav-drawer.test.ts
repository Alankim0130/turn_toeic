import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NAV_BOTTOM, NAV_DRAWER, NAV_MAIN, STUDENT_FEATURES } from "./site";

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

  it("아이콘 파일이 전부 있다 (public/icons — 이모지 대신 힉스필드 아이콘)", () => {
    for (const r of rows) expect(existsSync(`public/icons/${r.icon}.png`), r.icon).toBe(true);
  });
});
