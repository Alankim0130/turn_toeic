import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ADMIN_THEME_COLOR, BRAND_THEME_COLOR } from "./theme-color";

/**
 * 아이폰 홈 화면 앱의 상태 표시줄 색 (2026-11-13 — "앱 폴더를 누르면 첫화면에서 맨 위에 색깔만 핑크로 나와. 근데, 새로고침하면 파란색으로 바껴").
 * 아이폰 앱은 theme-color 대신 맨 위 불투명 fixed 요소의 색을 칠하고 마지막 색을 붙들고 있다 — 스플래시 핑크 · 새로고침 알약 파랑이 남았다.
 * 그래서 아이폰 앱에서만 맨 위에 모드 색 띠(`StatusBarTint`)를 늘 세운다. 실기기로만 확인된다 — 여기서는 띠가 그 자리 · 그 색 · 그 높이에 있는지를 못박는다.
 */
const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
const css = read("src/app/globals.css");
const rule = css.slice(css.indexOf(".status-tint { display: none; }"), css.indexOf("/* 스크롤 진입 애니메이션 */"));
const zOf = (src: string, re: RegExp) => Number(src.match(re)?.[1]);

describe("상태 표시줄 색 띠 — 아이폰 홈 화면 앱", () => {
  it("루트 레이아웃이 모든 화면에 띠를 세운다", () => {
    expect(read("src/app/layout.tsx")).toMatch(/<StatusBarTint \/>/);
  });

  it("아이폰 홈 화면 앱에서만 보인다 (브라우저 · 안드로이드는 theme-color 를 따르므로 띠가 없다)", () => {
    expect(rule).toMatch(/^\.status-tint \{ display: none; \}/);
    expect(rule).toMatch(/@media \(display-mode: standalone\) \{\s*@supports \(-webkit-touch-callout: none\) \{/);
  });

  it("스플래시 · 새로고침 알약 · 머리줄보다 위 — 맨 위에서 보이는 색은 늘 이 띠다", () => {
    const tint = zOf(rule, /z-index:\s*(\d+)/);
    const splash = zOf(read("src/components/pwa/AppSplash.tsx"), /z-\[(\d+)\]/);
    const pull = zOf(read("src/components/pwa/PullToRefresh.tsx"), /fixed inset-x-0 top-0 z-\[(\d+)\]/);
    expect(splash).toBe(100);
    expect(pull).toBe(60);
    expect(tint).toBeGreaterThan(splash);
    expect(tint).toBeGreaterThan(pull);
    expect(rule).toMatch(/position: fixed;/);
    expect(rule).toMatch(/top: var\(--vv-ghost, 0px\);/);
    expect(rule).toMatch(/pointer-events: none;/);
    // 얇게 — 상태 표시줄이 몇 px 더 내려온 것처럼만 보이게
    expect(zOf(rule, /height:\s*(\d+)px/)).toBeLessThanOrEqual(8);
  });

  it("색은 그 모드의 상태 표시줄 색 — 학생 · 랜딩 브랜드 핑크, 관리자 바탕 회색 (theme-color.ts 와 같은 토큰)", () => {
    expect(rule).toMatch(/\.status-tint \{[^}]*background-color: var\(--color-brand-500\);/);
    expect(rule).toMatch(/:root:has\(\[data-admin-theme\]\) \.status-tint \{ background-color: var\(--color-surface\); \}/);
    // 토큰 값 — 학생 브랜드 = BRAND_THEME_COLOR, 관리자 바탕 = ADMIN_THEME_COLOR (admin-theme.test.ts 도 본다)
    expect(css).toMatch(new RegExp(`--color-brand-500:\\s*${BRAND_THEME_COLOR};`, "i"));
    expect(css).toMatch(new RegExp(`--color-surface:\\s*${ADMIN_THEME_COLOR};`, "i"));
  });
});
