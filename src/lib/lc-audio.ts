/**
 * LC 음원·교재 공통. 레벨(650·750·850 …)과 교재 칸은 DB 의 lc_levels · lc_books 에서 읽는다.
 * 레벨마다 A반 1권 + B반 1권이고, 홀수달은 A반·짝수달은 B반 교재로 수업한다 (2026-09-16 Alan 운영 규칙).
 * 음원은 교재마다 Day 1~9 아홉 칸이고 한 칸에 파일 하나가 들어간다.
 */

export const BOOK_SETS = ["A", "B"] as const;
export type BookSet = (typeof BOOK_SETS)[number];

export const BOOK_SET_LABEL: Record<string, string> = { A: "A반", B: "B반" };
export const BOOK_SET_MONTHS: Record<string, string> = {
  A: "홀수달 수업 · 1·3·5·7·9·11월",
  B: "짝수달 수업 · 2·4·6·8·10·12월",
};

/** 이번 달 교재 반: 홀수달 A, 짝수달 B */
export const bookSetForMonth = (month: number): BookSet => (month % 2 === 1 ? "A" : "B");

export type BookLite = { id: number; level: number; book_set: string; title: string | null; description: string | null; cover_name: string | null; updated_at: string };

/** "A반 교재" */
export const bookLabel = (b: { book_set: string }) => `${BOOK_SET_LABEL[b.book_set] ?? b.book_set} 교재`;

/** A반 → B반 순서 */
export const sortBooks = <T extends { book_set: string }>(books: T[]) => [...books].sort((a, b) => a.book_set.localeCompare(b.book_set));

/** 표지 주소. 표지를 바꾸면 updated_at 이 달라져 브라우저가 새 이미지를 받는다 */
export const coverSrc = (b: { id: number; updated_at: string }, width: number) => `/files/textbook/${b.id}?w=${width}&v=${encodeURIComponent(b.updated_at)}`;

/* ─── Day ────────────────────────────────────────────────────────────────── */

/** 교재 한 권은 Day 1~9 아홉 칸. DB 의 lc_audio_tracks.day check 와 값이 같아야 한다 */
export const DAYS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
export const DAY_COUNT = DAYS.length;

export const dayLabel = (day: number) => `Day ${day}`;
export const isDay = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= DAY_COUNT;

/** Day 번호 순서 */
export const sortTracks = <T extends { day: number }>(tracks: T[]) => [...tracks].sort((a, b) => a.day - b.day);

/** 파일명의 숫자 순서로 정렬 (Day 2 파일이 Day 10 파일보다 앞에 오도록) */
export const sortByName = <T extends { name: string }>(files: T[]) => [...files].sort((a, b) => a.name.localeCompare(b.name, "ko", { numeric: true }));

/* ─── 고르기 ─────────────────────────────────────────────────────────────── */

/** ?level=750 → 목록에 있는 레벨이면 그 값, 아니면 선호 레벨 → 첫 레벨 */
export function pickLevel(param: string | undefined, levels: number[], preferred?: number | null): number | null {
  const n = Number(param);
  if (param && levels.includes(n)) return n;
  if (preferred && levels.includes(preferred)) return preferred;
  return levels[0] ?? null;
}

/** ?book=12 → 그 레벨의 교재면 그 값, 아니면 이번 달 반 교재 → 첫 교재 */
export function pickBook<T extends { id: number; book_set: string }>(param: string | undefined, books: T[], currentSet: BookSet): T | null {
  const n = Number(param);
  const sorted = sortBooks(books);
  return sorted.find((b) => param && b.id === n) ?? sorted.find((b) => b.book_set === currentSet) ?? sorted[0] ?? null;
}
