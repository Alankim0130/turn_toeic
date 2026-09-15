/**
 * 편성 캘린더용 순수 날짜 유틸. 타임존 영향을 받지 않도록 UTC 기반으로만 계산하고,
 * 날짜는 항상 'YYYY-MM-DD' 문자열로 다룬다.
 */
export const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"] as const;

export const pad2 = (n: number) => String(n).padStart(2, "0");

export const ymd = (y: number, m: number, d: number) => `${y}-${pad2(m)}-${pad2(d)}`;

export function parseYmd(s: string): { y: number; m: number; d: number } {
  const [y, m, d] = s.split("-").map(Number);
  return { y, m, d };
}

export function daysInMonth(y: number, m: number) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** 0=일 … 6=토 */
export function weekday(y: number, m: number, d: number) {
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function weekdayOf(dateStr: string) {
  const { y, m, d } = parseYmd(dateStr);
  return weekday(y, m, d);
}

/** 'YYYY-MM-DD' → '9월 15일 (월)' */
export function labelKo(dateStr: string, withYear = false) {
  const { y, m, d } = parseYmd(dateStr);
  return `${withYear ? `${y}년 ` : ""}${m}월 ${d}일 (${WEEKDAY_KO[weekday(y, m, d)]})`;
}

/** 일요일 시작 달력 행렬. null 은 빈 칸 */
export function monthGrid(y: number, m: number): (number | null)[][] {
  const first = weekday(y, m, 1);
  const days = daysInMonth(y, m);
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);
  const rows: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}

/** 해당 날짜가 속한 달력 행(0부터) */
export function rowOfDay(y: number, m: number, d: number) {
  return Math.floor((d - 1 + weekday(y, m, 1)) / 7);
}

/** 평일(월~금)을 하나라도 포함하는 첫 행 = "1주차" */
export function firstWeekdayRow(y: number, m: number) {
  const days = daysInMonth(y, m);
  for (let d = 1; d <= days; d++) {
    const wd = weekday(y, m, d);
    if (wd >= 1 && wd <= 5) return rowOfDay(y, m, d);
  }
  return 0;
}

export type Track = "mwf" | "ttf";

/**
 * 초안 날짜 생성.
 *  - mwf: 모든 월·수 + 격주 금요일
 *  - ttf: 모든 화·목 + 격주 금요일
 *  - fridayStartWeek: 이 트랙의 금요일이 들어가는 첫 주 (1주차 또는 2주차).
 *    두 트랙은 서로 다른 값을 쓰면 금요일이 엇갈린다.
 */
export function generateDraft(y: number, m: number, track: Track, fridayStartWeek: 1 | 2): string[] {
  const days = daysInMonth(y, m);
  const baseRow = firstWeekdayRow(y, m);
  const out: string[] = [];
  for (let d = 1; d <= days; d++) {
    const wd = weekday(y, m, d);
    const regular = track === "mwf" ? wd === 1 || wd === 3 : wd === 2 || wd === 4;
    if (regular) {
      out.push(ymd(y, m, d));
      continue;
    }
    if (wd === 5) {
      const k = rowOfDay(y, m, d) - baseRow;
      if (k >= 0 && k % 2 === fridayStartWeek - 1) out.push(ymd(y, m, d));
    }
  }
  return out;
}

export const isYmd = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
export const isHm = (s: string) => /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(s);
export const hm = (t: string) => t.slice(0, 5);
