/** 차트 시리즈 색 (브랜드 핑크 계열 + 잉크) */
export const SERIES = ["#ff2e88", "#17121f", "#ff8fbd", "#bf125d", "#ffc2da", "#5b5563", "#ff5ca2", "#9a95a3"];

export type Datum = { label: string; value: number };

export function pct(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 1000) / 10 : 0;
}
