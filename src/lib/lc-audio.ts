/**
 * LC 음원·교재 공통. 레벨(650·750·850 …)과 교재 칸은 DB 의 lc_levels · lc_books 에서 읽는다.
 * 레벨마다 A반 1권 + B반 1권이고, 홀수달은 A반·짝수달은 B반 교재로 수업한다 (2026-09-16 Alan 운영 규칙).
 *
 * 음원은 교재마다 **종류(수업/숙제) × 강 아홉 칸**이다 (2026-09-16 Alan).
 *  - 강 번호는 교재마다 다르게 시작한다. 650A 는 1강부터, 650B 는 11강부터 —
 *    칸은 늘 1~9 이고 `lc_books.lesson_offset` 을 더해 화면에 보여준다.
 *  - 한 강에 파일이 여러 개일 수 있다 (650A 3강 = 교과서 현재진행형 + 영국발음 등).
 */

export const BOOK_SETS = ["A", "B"] as const;
export type BookSet = (typeof BOOK_SETS)[number];

export const BOOK_SET_LABEL: Record<string, string> = { A: "A반", B: "B반" };
export const BOOK_SET_MONTHS: Record<string, string> = {
  A: "홀수달 수업 · 1·3·5·7·9·11월",
  B: "짝수달 수업 · 2·4·6·8·10·12월",
};

/**
 * 달 홀짝으로 짐작한 교재 반 (홀수달 A, 짝수달 B).
 * **진짜 기준이 아니다** — 2026-09-16 Alan 확인: 교재는 듣는 시간대로 정해져서 같은 달에도
 * 10:00 반은 A, 11:10 반은 B 를 쓰고 다음 달에는 서로 뒤바뀐다.
 * 반에 `book_set` 이 아직 없을 때만 쓰는 대비값이다.
 */
export const bookSetForMonth = (month: number): BookSet => (month % 2 === 1 ? "A" : "B");

/** 반에 지정된 교재 반. 없으면 null — LC 를 듣지 않는 시간(RC 시간 · 묶음 반 · 스파르타 반)은 비어 있다 */
export const explicitBookSet = (s?: { book_set?: string | null } | null): BookSet | null => (s?.book_set === "A" || s?.book_set === "B" ? s.book_set : null);

/** 이 반이 쓰는 교재 반. 반에 지정돼 있으면 그 값, 없으면 달 홀짝으로 짐작한다 */
export const bookSetOfSection = (s?: { book_set?: string | null; term?: { month: number } | null } | null): BookSet | null => {
  if (!s) return null;
  return explicitBookSet(s) ?? (s.term ? bookSetForMonth(s.term.month) : null);
};

/**
 * 내 반들이 쓰는 교재 반 집합. 지정된 반이 하나라도 있으면 그것만 믿는다 —
 * 60분 반 도입 뒤로 지정이 없는 반은 "LC 가 없는 시간"이지 "미지정"이 아니다 (2026-09-16).
 * 아무 반에도 지정이 없을 때만 (예전 데이터) 달 홀짝으로 짐작한다.
 */
export function bookSetsOfSections(sections: Array<{ book_set?: string | null; term?: { month: number } | null }>): Set<BookSet> {
  const explicit = new Set(sections.map(explicitBookSet).filter((b): b is BookSet => b !== null));
  if (explicit.size > 0) return explicit;
  return new Set(sections.map(bookSetOfSection).filter((b): b is BookSet => b !== null));
}

export type BookLite = {
  id: number;
  level: number;
  book_set: string;
  title: string | null;
  description: string | null;
  cover_name: string | null;
  lesson_offset: number;
  updated_at: string;
};

/** "A반 교재" */
export const bookLabel = (b: { book_set: string }) => `${BOOK_SET_LABEL[b.book_set] ?? b.book_set} 교재`;

/** A반 → B반 순서 */
export const sortBooks = <T extends { book_set: string }>(books: T[]) => [...books].sort((a, b) => a.book_set.localeCompare(b.book_set));

/** 표지 주소. 표지를 바꾸면 updated_at 이 달라져 브라우저가 새 이미지를 받는다 */
export const coverSrc = (b: { id: number; updated_at: string }, width: number) => `/files/textbook/${b.id}?w=${width}&v=${encodeURIComponent(b.updated_at)}`;

/* ─── 음원 종류 ───────────────────────────────────────────────────────────── */

/** DB 의 lc_audio_tracks.kind check 와 값이 같아야 한다 */
export const AUDIO_KINDS = ["lesson", "homework"] as const;
export type AudioKind = (typeof AUDIO_KINDS)[number];

export const AUDIO_KIND_LABEL: Record<string, string> = { lesson: "수업 음원", homework: "숙제 음원" };
export const AUDIO_KIND_HINT: Record<string, string> = {
  lesson: "수업 시간에 듣는 음원",
  homework: "숙제로 풀어 오는 음원",
};

export const isAudioKind = (v: unknown): v is AudioKind => typeof v === "string" && (AUDIO_KINDS as readonly string[]).includes(v);

/** ?kind=homework → 그 값, 아니면 수업 음원 */
export const pickKind = (param: string | undefined): AudioKind => (isAudioKind(param) ? param : "lesson");

/* ─── 강 칸 ──────────────────────────────────────────────────────────────── */

/** 교재 한 권은 강 아홉 칸. DB 의 lc_audio_tracks.day check 와 값이 같아야 한다 */
export const DAYS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
export const DAY_COUNT = DAYS.length;

export const isDay = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= DAY_COUNT;

/**
 * 칸 번호 → 화면에 보이는 강 이름. 교재의 시작 번호를 더한다.
 * 650A(offset 0) 의 3번 칸은 "3강", 650B(offset 10) 의 1번 칸은 "11강".
 */
export const lessonLabel = (day: number, offset = 0) => `${offset + day}강`;

/** "1강 ~ 9강" — 교재가 다루는 범위 */
export const lessonRangeLabel = (offset = 0) => `${lessonLabel(1, offset)} ~ ${lessonLabel(DAY_COUNT, offset)}`;

/** 칸 번호 → 같은 칸 안에서는 넣은 순서 */
export const sortTracks = <T extends { day: number; sort_order?: number; id?: number }>(tracks: T[]) =>
  [...tracks].sort((a, b) => a.day - b.day || (a.sort_order ?? 0) - (b.sort_order ?? 0) || (a.id ?? 0) - (b.id ?? 0));

/** 종류로 거른 뒤 칸 번호별로 묶는다 — 한 칸에 파일이 여러 개일 수 있다 */
export function groupByDay<T extends { day: number; kind?: string; sort_order?: number; id?: number }>(tracks: T[], kind?: string) {
  const map = new Map<number, T[]>();
  for (const t of sortTracks(tracks)) {
    if (kind && (t.kind ?? "lesson") !== kind) continue;
    map.set(t.day, [...(map.get(t.day) ?? []), t]);
  }
  return map;
}

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
