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

export type GridCell = { date: string; day: number; inMonth: boolean };

/**
 * 일요일 시작 달력 행렬. 그 달 전체와, 함께 넘긴 날짜(앞뒤 달로 이어지는 수업일)까지
 * 덮는 주 수만큼 만든다. 빈 칸 없이 앞뒤 달 날짜도 채운다.
 * minRows 를 주면 그보다 적은 주는 뒤로 늘려 칸 수를 맞춘다 (편성 화면은 항상 6주).
 */
export function coveringGrid(y: number, m: number, extra: string[] = [], minRows = 0): GridCell[][] {
  const DAY = 86_400_000;
  let from = Date.UTC(y, m - 1, 1);
  let to = Date.UTC(y, m - 1, daysInMonth(y, m));
  for (const s of extra) {
    const { y: ey, m: em, d: ed } = parseYmd(s);
    const t = Date.UTC(ey, em - 1, ed);
    if (t < from) from = t;
    if (t > to) to = t;
  }
  const start = from - new Date(from).getUTCDay() * DAY;
  let end = to + (6 - new Date(to).getUTCDay()) * DAY;
  const weeks = Math.round((end - start + DAY) / (7 * DAY));
  if (weeks < minRows) end += (minRows - weeks) * 7 * DAY;
  const rows: GridCell[][] = [];
  for (let t = start; t <= end; t += 7 * DAY) {
    rows.push(
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(t + i * DAY);
        return {
          date: d.toISOString().slice(0, 10),
          day: d.getUTCDate(),
          inMonth: d.getUTCFullYear() === y && d.getUTCMonth() === m - 1,
        };
      }),
    );
  }
  return rows;
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
