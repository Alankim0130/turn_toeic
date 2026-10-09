/**
 * 차트 시리즈 색 (브랜드 계열 + 잉크 · 회색). **hex 가 아니라 토큰 변수다** — 관리자 모드는 토스 파랑 벌로 바뀌므로
 * (globals.css "관리자 모드 = 토스 모양", 2026-10-09) 값을 박아 두면 차트만 핑크로 남는다. SVG 에서는 속성이 아니라 `style` 로 준다 (변수는 속성에서 안 먹는다)
 */
export const SERIES = [
  "var(--color-brand-500)",
  "var(--color-ink)",
  "var(--color-brand-300)",
  "var(--color-brand-700)",
  "var(--color-brand-200)",
  "var(--color-slate)",
  "var(--color-brand-400)",
  "var(--color-mist)",
];

export type Datum = { label: string; value: number };

export function pct(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 1000) / 10 : 0;
}
