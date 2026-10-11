import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * 관리자 모드 = 토스 모양 (2026-10-09 Alan "관리자모드에서도 전부다 핑크로 디자인되어있어서 눈이 아픈것 같아. 관리자모드는 토스 디자인처럼").
 *
 * 색을 바꾸는 곳은 globals.css 의 `:root:has([data-admin-theme])` 한 블록이고, AdminShell 이 그 속성을 그린다.
 * 하나라도 빠지면 화면은 열리는데 **관리자 화면이 다시 핑크로** 돌아간다 — 조용히 틀리는 쪽이라 소스를 읽어 못박는다.
 * - 토큰 열일곱 개(브랜드 10 + 글자 · 선 · 바탕 7)를 전부 덮어쓴다 — 하나만 빠지면 그 칸만 핑크가 남는다
 * - 그림자 · 아이콘 색상환 · 카드 테두리 · 버튼 모서리도 그 범위 안에서만 바꾼다
 * - 관리자 화면 · 조각에 핑크 hex 를 직접 적지 않는다 (토큰을 써야 두 모드가 갈린다). 차트 색도 변수다
 */
const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : /\.(tsx?|css)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
  });

const BRAND_TOKENS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900].map((n) => `--color-brand-${n}`);
const NEUTRAL_TOKENS = ["--color-ink", "--color-ink-soft", "--color-slate", "--color-mist", "--color-line", "--color-surface", "--color-paper"];
/** 학생 쪽 핫핑크 벌 (globals.css @theme) — 관리자 블록이 이 값을 하나라도 그대로 두면 안 된다 */
const PINK_HEX = /#(ff2e88|e61e75|ffe4ef|ff5ca2|ff8fbd|bf125d|fff5f9|ffc2da|8f0c46|5c0730)\b/i;

describe("관리자 모드 토스 토큰", () => {
  const css = read("src/app/globals.css");
  const block = css.match(/:root:has\(\[data-admin-theme\]\)\s*\{([^}]*)\}/)?.[1] ?? "";

  it("globals.css 가 :root:has([data-admin-theme]) 에서 브랜드 · 글자 · 선 · 바탕 토큰을 전부 덮어쓴다", () => {
    expect(block).not.toBe("");
    for (const t of [...BRAND_TOKENS, ...NEUTRAL_TOKENS]) expect(block, t).toMatch(new RegExp(`${t}:\\s*#[0-9a-f]{6};`, "i"));
    expect(block).not.toMatch(PINK_HEX);
    // 토스 파랑이 브랜드 500 이다
    expect(block).toMatch(/--color-brand-500:\s*#3182f6;/i);
  });

  it("그림자 · 아이콘 색상환 · 카드 테두리 · 버튼 모서리도 같은 범위 안에서만 바꾼다", () => {
    // btn-primary 는 @apply 로 shadow-pink 를 품어 클래스가 따로 안 붙는다 — 이름을 함께 적어야 버튼의 분홍 그림자가 남지 않는다
    expect(css).toMatch(/:root:has\(\[data-admin-theme\]\) :is\(\.shadow-soft, \.shadow-pink, \.btn-primary\)\s*\{[^}]*--tw-shadow:/);
    expect(css).toMatch(/:root:has\(\[data-admin-theme\]\) \.hover\\:shadow-pink:hover\s*\{[^}]*--tw-shadow:/);
    // 아이콘 필터는 Tailwind 의 filter 변수 목록을 뒤에 이어야 brightness-0 invert(흰 아이콘) · grayscale 이 그대로 먹는다
    const icon = css.match(/:root:has\(\[data-admin-theme\]\) img\[data-icon\]\s*\{([^}]*)\}/)?.[1] ?? "";
    // next/image 가 src 를 바꾸므로 Icon 이 data-icon 을 달아야 이 규칙이 잡는다
    expect(read("src/components/ui/Icon.tsx")).toMatch(/data-icon=""/);
    expect(icon).toMatch(/filter:\s*hue-rotate\(\d+deg\)/);
    for (const v of ["--tw-brightness", "--tw-grayscale", "--tw-invert", "--tw-saturate", "--tw-drop-shadow"]) expect(icon).toContain(`var(${v}, )`);
    expect(css).toMatch(/\[data-admin-theme\] \.card\s*\{/);
    expect(css).toMatch(/\[data-admin-theme\] :is\(\.btn-primary, \.btn-secondary, \.btn-dark\)\s*\{[^}]*border-radius/);
  });

  it("AdminShell 이 data-admin-theme 를 그린다 (관리자 레이아웃 전체)", () => {
    const shell = read("src/components/admin/AdminShell.tsx");
    expect(shell).toMatch(/<div data-admin-theme=""/);
    expect(read("src/app/admin/layout.tsx")).toContain("<AdminShell");
  });

  /** 핑크 hex 가 남아도 되는 곳 — 까닭을 적어야 들어간다 */
  const ALLOWED: Record<string, string> = {
    // 반 편성 달력의 '이미지 저장' — 학원에 전달하는 그림이라 화면 모드와 상관없이 브랜드 핫핑크로 그린다 (캔버스는 CSS 토큰을 못 읽는다)
    "src/components/admin/sections/calendarImage.ts": "학원 전달용 그림 — 브랜드색",
  };

  it("관리자 화면 · 조각 · 차트에 핑크 hex 를 직접 적지 않는다 — 토큰을 써야 두 모드가 갈린다", () => {
    const files = [...walk("src/app/admin"), ...walk("src/components/admin")].filter((f) => !ALLOWED[path.relative(process.cwd(), f)]);
    const bad = files.filter((f) => PINK_HEX.test(fs.readFileSync(f, "utf8")) || /accent-\[#/.test(fs.readFileSync(f, "utf8")));
    expect(bad.map((f) => path.relative(process.cwd(), f))).toEqual([]);
    // 차트 시리즈 색은 변수다
    expect(read("src/components/admin/charts/palette.ts")).not.toMatch(/#[0-9a-f]{6}/i);
  });

  /**
   * 상태 표시줄 · 브라우저 색(theme-color)도 모드를 따른다 (2026-10-11 Alan — 관리자 대시보드 위 "핑크줄이 있는데 새로고침을 하면 없어져").
   * 관리자 화면은 회색 바탕 토큰과 같은 색, 학생 · 랜딩은 브랜드 핫핑크(manifest · offline.html 과 같다). 한쪽만 바꾸면 띠 색이 화면과 어긋난다
   */
  it("theme-color — 관리자 레이아웃은 관리자 바탕 회색, 루트 · manifest · offline.html 은 브랜드 핫핑크 한 값", async () => {
    const { ADMIN_THEME_COLOR, ADMIN_VIEWPORT, BASE_VIEWPORT, BRAND_THEME_COLOR } = await import("./theme-color");
    expect(block).toMatch(new RegExp(`--color-surface:\\s*${ADMIN_THEME_COLOR};`, "i"));
    expect(css).toMatch(new RegExp(`--color-brand-500:\\s*${BRAND_THEME_COLOR};`, "i"));
    expect(ADMIN_VIEWPORT.themeColor).toBe(ADMIN_THEME_COLOR);
    expect(BASE_VIEWPORT.themeColor).toBe(BRAND_THEME_COLOR);
    // 바깥 레이아웃의 나머지 값(폭 · 배율 · viewport-fit)은 그대로 물려받는다
    expect({ ...ADMIN_VIEWPORT, themeColor: undefined }).toEqual({ ...BASE_VIEWPORT, themeColor: undefined });
    expect(read("src/app/layout.tsx")).toMatch(/export const viewport: Viewport = BASE_VIEWPORT;/);
    expect(read("src/app/admin/layout.tsx")).toMatch(/export const viewport: Viewport = ADMIN_VIEWPORT;/);
    const manifest = read("src/app/manifest.ts");
    expect(manifest).toMatch(/background_color: BRAND_THEME_COLOR,\s*theme_color: BRAND_THEME_COLOR,/);
    expect(manifest).not.toMatch(/#[0-9a-f]{6}/i);
    expect(read("public/offline.html")).toContain(`<meta name="theme-color" content="${BRAND_THEME_COLOR}" />`);
  });

  it("학생 쪽 토큰은 그대로 핫핑크다 (바꾸는 것은 관리자 범위뿐)", () => {
    const theme = css.match(/@theme\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(theme).toMatch(/--color-brand-500:\s*#ff2e88;/);
    expect(theme).toMatch(/--color-surface:\s*#fff8fb;/);
  });
});
