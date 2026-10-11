import type { Viewport } from "next";

/**
 * 브라우저 · 홈 화면 앱의 상태 표시줄 색 (`<meta name="theme-color">`) — 모드마다 다르다 (2026-10-11 Alan —
 * 관리자 대시보드 위에 "핑크줄이 있는데 새로고침을 하면 없어져").
 *
 * - 학생 모드 · 랜딩 · 공개 페이지: 브랜드 핫핑크. manifest(`theme_color` · `background_color`)와 `public/offline.html` 도 같은 값이다.
 * - 관리자 모드(`/admin`, 토스 모양): 관리자 바탕 토큰 `--color-surface`(globals.css 의 `:root:has([data-admin-theme])` 블록)와 같은 회색 —
 *   그래야 상태 표시줄과 화면 바탕이 한 색이다 (핑크로 두면 회색 화면 위에 핑크 띠가 선다).
 *
 * 값은 여기 한곳이고 `admin-theme.test.ts` 가 globals.css · manifest · offline.html 과 같은지 본다. Next 는 안쪽 레이아웃의 `viewport` 를
 * 바깥 것 위에 겹치므로 `/admin` 레이아웃이 `ADMIN_VIEWPORT` 를 내보내면 그 아래 화면만 회색이 된다 (화면을 옮기면 Next 가 메타 태그를 바꾼다).
 */
export const BRAND_THEME_COLOR = "#ff2e88";
export const ADMIN_THEME_COLOR = "#f2f4f6";

export const BASE_VIEWPORT: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: BRAND_THEME_COLOR,
};

export const ADMIN_VIEWPORT: Viewport = { ...BASE_VIEWPORT, themeColor: ADMIN_THEME_COLOR };
