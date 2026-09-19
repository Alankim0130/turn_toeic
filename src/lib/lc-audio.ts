/**
 * LC 음원·교재 공통. 레벨(650·750·850 …)과 교재 칸은 DB 의 lc_levels · lc_books 에서 읽는다.
 * 레벨마다 A반 1권 + B반 1권이다.
 *
 * **A/B 는 달의 홀짝이 아니라 그 학생이 LC 를 듣는 시간대·트랙이 정한다** (2026-09-16 편성표, 2026-09-19 Alan 재지적).
 * 9월 650 만 봐도 화목금 10:00 은 A, 월수금 11:10 은 B 다 — 같은 달 같은 레벨인데 갈린다.
 * 그래서 `홀수달 = A` 같은 말은 **틀린 말이고 화면에 적지 않는다.** 진실은 `class_sections.book_set` 한곳뿐이라
 * 지정이 없으면 "그 시간엔 LC 교재가 없다" 는 뜻이지 짐작해서 채울 일이 아니다.
 *
 * 음원은 교재마다 **종류(수업/숙제) × 강 아홉 칸**이다 (2026-09-16 Alan).
 *  - 강 번호는 교재마다 다르게 시작한다. 650A 는 1강부터, 650B 는 11강부터 —
 *    칸은 늘 1~9 이고 `lc_books.lesson_offset` 을 더해 화면에 보여준다.
 *  - 한 강에 파일이 여러 개일 수 있다 (650A 3강 = 교과서 현재진행형 + 영국발음 등).
 */

export const BOOK_SETS = ["A", "B"] as const;
export type BookSet = (typeof BOOK_SETS)[number];

export const BOOK_SET_LABEL: Record<string, string> = { A: "A반", B: "B반" };

/** 반에 지정된 교재 반. 없으면 null — LC 를 듣지 않는 시간(RC 시간 · 묶음 반 · 스파르타 반)은 비어 있다 */
export const explicitBookSet = (s?: { book_set?: string | null } | null): BookSet | null => (s?.book_set === "A" || s?.book_set === "B" ? s.book_set : null);

/** 교재를 가릴 때 보는 반의 칸들 */
export type BookSection = {
  track?: string | null;
  time_block?: string | null;
  book_set?: string | null;
  course?: { target_score?: number | null; program?: string | null } | null;
};

/**
 * 반들을 **레벨 × 교재 반**으로 모은다 — 값은 그 교재를 쓰는 반들이다.
 *
 * **레벨마다 따로 모으는 것이 핵심이다.** 한 학생이 650 은 B, 850 은 A 를 쓸 수 있다 (시간대가 다르다) —
 * 레벨을 섞어 한 덩어리로 모으면 850 탭에 650 의 교재가 딸려 나온다.
 * 스파르타 반 자체는 교재가 없어 빼고 본다 (함께 듣는 시간 단위 반에 지정돼 있다).
 */
export function bookSectionsByLevel<T extends BookSection>(sections: T[]): Map<number, Map<BookSet, T[]>> {
  const out = new Map<number, Map<BookSet, T[]>>();
  for (const s of sections) {
    if (s.course?.program === "sparta") continue;
    const set = explicitBookSet(s);
    const level = s.course?.target_score;
    if (!set || typeof level !== "number") continue;
    const byLevel = out.get(level) ?? new Map<BookSet, T[]>();
    byLevel.set(set, [...(byLevel.get(set) ?? []), s]);
    out.set(level, byLevel);
  }
  return out;
}

/**
 * "화목금 10:00~11:00" — 이 교재를 **쓰는 시간**. 카드에 달 대신 이것을 적는다.
 * **주5일로 합치지 말 것** — 트랙마다 교재가 달라서(9월 650 은 화목금이 A, 월수금이 B) 합치면
 * 어느 요일에 어느 책인지가 사라진다. 내 시간표 달력을 두 색으로 칠하는 것과 같은 이유다 (도메인 규칙 1).
 */
export const bookTimeLabel = (s: BookSection, trackLabel: Record<string, string>) =>
  [s.track ? (trackLabel[s.track] ?? s.track) : null, s.time_block].filter(Boolean).join(" ");

/** 같은 교재를 쓰는 여러 시간을 한 줄로 — 트랙·시각 순으로 고정한다 (새로고침마다 순서가 달라지지 않게) */
export const bookTimesLabel = (sections: BookSection[], trackLabel: Record<string, string>) =>
  [...new Set(sections.map((s) => bookTimeLabel(s, trackLabel)).filter(Boolean))].sort().join(" · ");

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

/** ?book=12 → 그 레벨의 교재면 그 값, 아니면 A반 → 첫 교재. **달로 고르지 않는다** (위 주석) */
export function pickBook<T extends { id: number; book_set: string }>(param: string | undefined, books: T[], preferred?: BookSet | null): T | null {
  const n = Number(param);
  const sorted = sortBooks(books);
  return sorted.find((b) => param && b.id === n) ?? (preferred ? sorted.find((b) => b.book_set === preferred) : undefined) ?? sorted[0] ?? null;
}
