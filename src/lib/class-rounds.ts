/**
 * 수업 날짜에 맞춰 연다 — LC 음원 · 수업자료실 (2026-10-05 Alan — "LC음원듣기와 자료게시판도 수업날짜에 맞춰서 오픈해주면 좋겠어.
 * 자료게시판도 일정표 기반으로 오픈하는 걸로 하고, 해당 날짜가 안되면 잠금이고, 해당날짜 수업이 진행되면 하나씩 오픈" ·
 * "수업자료실에 A/B 과정 전부다 나눠서 올릴 수 있도록 해야해! RC, LC전부다" · 고른 것 "과정 · 회차마다").
 *
 * 한 칸(cell) = 레벨 × 과목(rc · lc) × 과정(A · B). 회차 = 그 칸을 쓰는 **내 반의 N번째 수업일**(`session_dates.seq`).
 *  - 시간 단위 반(60 · 70분)은 그 반의 과목 · 과정 하나.
 *  - 과목 칸이 빈 반(방학달 통짜 120분 · 아직 안 고른 반)은 그 과정의 두 과목.
 *  - 과정이 없는 반(120 · 140분 묶음 · 속성반)은 칸이 없다 — 품은 시간 단위 반이 칸을 준다 (`my_section_ids()` 가 함께 내려 준다).
 *  - 같은 칸 · 회차가 두 반에서 오면(오전 · 저녁 같은 과정) **이른 날짜**에 열린다.
 * DB `private.my_round_cells()` · `private.my_open_rounds()` (마이그레이션 20261005130000)와 같은 규칙이다 — **바꾸면 둘 다.**
 * 학생 화면은 RLS 만 믿지 않고 이것으로 한 번 더 좁힌다 — 정책은 강사 · 관리자에게 모든 자료를 열어 주기 때문이다 (CLAUDE.md 등급 체계 10).
 * 순수 함수 (`class-rounds.test.ts`).
 */

export type RoundSubject = "rc" | "lc";
export type RoundSet = "A" | "B";

export const ROUND_SUBJECTS: readonly RoundSubject[] = ["rc", "lc"];
export const ROUND_SETS: readonly RoundSet[] = ["A", "B"];
export const ROUND_SET_LABEL: Record<RoundSet, string> = { A: "A과정", B: "B과정" };
/** 회차 끝 — DB check(seq between 1 and 30) 와 같다 */
export const ROUND_MAX = 30;

export const isRoundSet = (v: unknown): v is RoundSet => v === "A" || v === "B";

type RoundSection = {
  subject?: string | null;
  book_set?: string | null;
  course?: { target_score?: number | null } | null;
};

export const cellKey = (level: number, subject: string, set: string) => `${level}:${subject}:${set}`;
export const roundKey = (level: number, subject: string, set: string, seq: number) => `${level}:${subject}:${set}:${seq}`;

/** 이 반이 주는 칸 — 레벨 · 과정이 없으면 없다 (그릇 반), 과목 칸이 비면 두 과목 */
export function cellsOfSection(section: RoundSection | null | undefined): { level: number; subject: RoundSubject; set: RoundSet }[] {
  const level = section?.course?.target_score;
  const set = section?.book_set;
  if (typeof level !== "number" || !isRoundSet(set)) return [];
  const subjects: RoundSubject[] = section?.subject === "rc" || section?.subject === "lc" ? [section.subject] : section?.subject == null ? [...ROUND_SUBJECTS] : [];
  return subjects.map((subject) => ({ level, subject, set }));
}

/** 내 칸 전부 (`private.my_round_cells`) — 날짜와 상관없이 */
export function roundCells(sections: readonly RoundSection[]): Set<string> {
  const out = new Set<string>();
  for (const s of sections) for (const c of cellsOfSection(s)) out.add(cellKey(c.level, c.subject, c.set));
  return out;
}

/** 그 과목 칸이 있는 레벨 (숫자 순) — RC 단과면 LC 는 빈 목록 */
export function cellLevels(cells: ReadonlySet<string>, subject: RoundSubject): number[] {
  const out = new Set<number>();
  for (const key of cells) {
    const c = parseCell(key);
    if (c && c.subject === subject) out.add(c.level);
  }
  return [...out].sort((a, b) => a - b);
}

/** 회차 → 내 수업일 (`private.my_open_rounds` 의 날짜 조건 앞). 두 반이 같은 회차를 주면 이른 날짜 */
export function roundDates(sessions: readonly { seq: number; date: string; section: RoundSection | null }[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const s of sessions) {
    for (const c of cellsOfSection(s.section)) {
      const key = roundKey(c.level, c.subject, c.set, s.seq);
      const prev = out.get(key);
      if (!prev || s.date < prev) out.set(key, s.date);
    }
  }
  return out;
}

/** 열렸나 — 그 회차 수업일이 오늘(KST)이거나 지났다. 날짜가 없으면(그 칸의 반이 없다) 닫혀 있다 */
export const isRoundOpen = (date: string | null | undefined, today: string) => !!date && date <= today;

/** 칸 키를 풀어 쓴다 — 잘못된 키는 null */
export function parseCell(key: string): { level: number; subject: RoundSubject; set: RoundSet } | null {
  const [l, subject, set] = key.split(":");
  const level = Number(l);
  if (!Number.isInteger(level) || (subject !== "rc" && subject !== "lc") || !isRoundSet(set)) return null;
  return { level, subject, set };
}

export type RoundRow = { set: RoundSet; seq: number; date: string; key: string };

/** 한 레벨 × 과목의 내 회차들 — 날짜순 (같은 날이면 과정 · 회차 순). 수업자료실 학생 화면의 일정표 */
export function roundsOf(dates: ReadonlyMap<string, string>, level: number, subject: RoundSubject): RoundRow[] {
  const out: RoundRow[] = [];
  for (const [key, date] of dates) {
    const [l, s, set, seq] = key.split(":");
    if (Number(l) !== level || s !== subject || !isRoundSet(set)) continue;
    out.push({ set, seq: Number(seq), date, key });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.set.localeCompare(b.set) || a.seq - b.seq);
}

/** 관리자 화면에 보일 회차 줄 수 — 그 달 그 과정의 회차 수 · 올린 회차 중 큰 쪽, 적어도 10 (한 트랙 한 달 9~11회), 끝은 30 */
export function roundRowCount(termRounds: number, maxUploaded: number): number {
  return Math.min(ROUND_MAX, Math.max(termRounds, maxUploaded, 10));
}
