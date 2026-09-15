/**
 * 편성 달력용 순수 날짜 유틸. 타임존 영향을 받지 않도록 UTC 기반으로만 계산하고,
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

export type GridCell = { date: string; day: number; inMonth: boolean };

/** 일요일 시작 6주(42칸) 달력. 앞뒤 달 날짜도 채워서 달을 넘겨도 칸 수가 변하지 않는다 */
export function sixWeekGrid(y: number, m: number): GridCell[] {
  const start = Date.UTC(y, m - 1, 1 - weekday(y, m, 1));
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start + i * 86_400_000);
    return { date: d.toISOString().slice(0, 10), day: d.getUTCDate(), inMonth: d.getUTCMonth() === m - 1 };
  });
}

/** 기수 쿼리 문자열 'YYYY-MM' */
export const termKey = (y: number, m: number) => `${y}-${pad2(m)}`;

export const shiftMonth = (y: number, m: number, delta: number) => {
  const t = y * 12 + (m - 1) + delta;
  return { y: Math.floor(t / 12), m: (t % 12) + 1 };
};

export const isYmd = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
export const isHm = (s: string) => /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(s);
export const hm = (t: string) => t.slice(0, 5);
