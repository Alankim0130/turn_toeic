/**
 * 반별 명단 · 레벨별 명단의 **인쇄 쪽 나눔** — PDF(`class-roster-pdf.ts`)와 Word(`class-roster-docx.ts`)가 같은 쪽을 만든다
 * (2026-10-15 Alan "학생명단 워드로도 다운받을 수 있게 부탁해" — 그때 PDF 에 있던 쪽 나눔을 여기로 옮겼다. 규칙은 그대로다).
 *
 * - **A4 세로 · 레벨마다 새 쪽.** 한 쪽에 두 레벨을 섞지 않는다 (2026-10-14 Alan "레벨별이 다르면 새로운 페이지에서 다시 시작").
 * - 칸은 쪽 폭을 고르게 나눈다 (칸 하나면 반 폭). 칸이 30mm 보다 좁아지면(일곱 칸부터) 고르게 나눠 다음 쪽에 이어 그린다 (`splitPages`).
 * - **이름은 늘 10pt · 줄 높이 고정** (같은 날 Alan "글자크기는 10으로 해줘") — 한 쪽에 `ROWS_PER_PAGE` 줄이고 넘치면 쪽마다 고르게 나눠
 *   (45명 → 23 + 22) 다음 쪽에 이어 적는다 (`rowLayout`). 이어지는 쪽에는 이름이 남은 칸만 그린다 (`shownColumns` — 칸 자리는 첫 쪽과 같다).
 * - 레벨별 명단은 칸 안에 이름을 두 단으로 (`SUB_COLUMNS` · `nameSlots` — 신문처럼 위에서 아래로 → 옆 단).
 * - 학생이 없는 반은 그 레벨 마지막 쪽에, 학생이 하나도 없는 레벨의 반은 맨 마지막 쪽에 적는다 (`planRosterSheets` 의 `empties`).
 * 좌표 · 길이는 mm.
 */
import { columnDetail, columnHeading, type ClassRoster, type RosterBy, type RosterColumn, type RosterLevel } from "./class-roster";

/** A4 세로 (mm) */
export const PAGE_W = 210;
export const PAGE_H = 297;
/** 좌우 여백 — 칸은 그 안(190mm)을 나눈다. Word 도 같은 여백이라 칸 폭이 같다 */
export const MX = 10;
export const TOP = 10;
export const BOTTOM = 10;
/** 제목 줄(7) · 레벨 띠(10) · 범례(5) 아래 — PDF 의 칸이 시작하는 높이 */
export const GRID_TOP = TOP + 28;
/** 칸 머리(칸 이름 · 둘째 줄) 높이 */
export const HEAD_H = 12.5;
export const FOOT_H = 5;
export const USABLE = PAGE_W - MX * 2;
/** 칸이 이보다 좁아지면 그 레벨을 다음 쪽으로 나눈다 — 세로 A4 에 여섯 칸 (이름 · 칸 머리가 줄지 않고 들어간다) */
const MIN_COL = 30;
/** 이름 글자 크기 (pt) — 학생 수와 상관없이 늘 이것 (2026-10-14 Alan "글자크기는 10으로 해줘"). 표시 `(불/RC)` 는 그 0.8 배 */
export const NAME_PT = 10;
/** 이름 한 줄 높이 (mm) — 10pt 이름에 맞춘 고정 값 (엑셀 명단처럼 글자 위아래에 조금씩 여백) */
export const ROW_H = 5.6;
/** 한 쪽에서 이름 줄이 쓸 수 있는 높이 (mm) */
export const ROWS_AVAIL = PAGE_H - GRID_TOP - HEAD_H - BOTTOM - FOOT_H;
/** 한 쪽에 들어가는 이름 줄 수 — 이보다 많은 칸은 다음 쪽에 이어 적는다 */
export const ROWS_PER_PAGE = Math.floor((ROWS_AVAIL + 1e-6) / ROW_H);
/** 한 칸 안에 이름을 몇 단으로 적나 — 레벨별 명단은 칸이 반 폭(95mm)이라 두 단 (한 쪽에 한 칸 82명), 반별 명단은 한 단 */
export const SUB_COLUMNS: Record<RosterBy, number> = { time: 1, track: 2 };

/** 쪽 하나에 그릴 것 — 한 레벨의 칸들 (칸이 많으면 그 일부) */
export type RosterBlock = { level: RosterLevel; columns: RosterColumn[] };

/**
 * 쪽 나누기 — **레벨마다 새 쪽**이다 (한 쪽에 두 레벨을 섞지 않는다). 한 레벨의 칸이 한 쪽에 안 들어가면(30mm 보다 좁아지면)
 * 고르게 나눠 다음 쪽에 이어 그린다 — 일곱 칸 → 4 + 3, 열세 칸 → 5 + 4 + 4 (끝 쪽에 한 칸만 남지 않게).
 */
export function splitPages(levels: readonly RosterLevel[], usable = USABLE): RosterBlock[] {
  const maxCols = Math.max(1, Math.floor(usable / MIN_COL));
  return levels.flatMap((level) => {
    const n = level.columns.length;
    if (n === 0) return [];
    const parts = Math.ceil(n / maxCols);
    const blocks: RosterBlock[] = [];
    for (let k = 0, at = 0; k < parts; k++) {
      const size = Math.floor(n / parts) + (k < n % parts ? 1 : 0);
      blocks.push({ level, columns: level.columns.slice(at, at + size) });
      at += size;
    }
    return blocks;
  });
}

/** 칸 폭 — 쪽 폭을 고르게 나눈다. 칸 하나면 반 폭 (쪽 전체를 덮는 띠 하나가 되지 않게) */
export const columnWidth = (n: number, usable = USABLE) => usable / Math.max(2, n);

/**
 * 한 레벨(의 칸들)을 몇 쪽에 몇 줄씩 — 줄 높이 · 글자는 고정이고(`ROW_H` · `NAME_PT`) 한 쪽에 `cap` 줄까지.
 * 넘치면 쪽 수를 정하고 **쪽마다 고르게 나눈다** (45명 → 23 + 22, 60명 → 30 + 30 — 앞 쪽을 꽉 채우고 뒤 쪽에 몇 줄만 남기지 않는다).
 * 글자를 줄여 한 쪽에 몰지 않는다 (2026-10-14 Alan "글자크기는 10으로 해줘").
 */
export function rowLayout(maxRows: number, cap = ROWS_PER_PAGE): { perPage: number; pages: number } {
  const pages = Math.max(1, Math.ceil(maxRows / Math.max(1, cap)));
  return { perPage: Math.max(1, Math.ceil(maxRows / pages)), pages };
}

/**
 * 칸 안의 이름 자리 — k 번째 이름이 몇 번째 단 · 몇 번째 줄인가. 신문처럼 위에서 아래로 채우고 옆 단으로 가고, 단 길이를 고르게 한다
 * (5명 · 두 단 → 3 + 2). 한 단이면 그냥 아래로 (반별 명단).
 */
export function nameSlots(n: number, subs: number): { sub: number; row: number }[] {
  const rows = Math.ceil(n / Math.max(1, subs));
  return Array.from({ length: n }, (_, k) => ({ sub: Math.floor(k / rows), row: k % rows }));
}

/** 이 쪽에 그릴 칸 — `from` 번째 이름부터 적는 쪽이면 그보다 이름이 많은 칸만 (i = 첫 쪽에서의 자리) */
export const shownColumns = (block: RosterBlock, from: number) =>
  block.columns.map((col, i) => ({ col, i })).filter(({ col }) => col.students.length > from);

/**
 * 학생이 없는 칸 적기 — "학생이 없는 시간 2개: 650B 18:30~19:30 (월 RC · 화 LC 인강), …" · 레벨별 명단은 "학생이 없는 요일 1개: 750 월수금"
 */
export const emptyNote = (by: RosterBy, cols: readonly RosterColumn[]) =>
  `학생이 없는 ${by === "track" ? "요일" : "시간"} ${cols.length}개: ${cols
    .map((c) => {
      const detail = columnDetail(c);
      return detail ? `${columnHeading(c)} (${detail})` : columnHeading(c);
    })
    .join(", ")}`;

/**
 * 칸을 찾지 못한 학생 — 화면(`ClassRosterView`)처럼 종이에도 적는다. 안 적으면 그 학생이 빠진 줄 모른 채 인쇄된다 (2026-10-16 점검).
 * 배정된 반(속성반 · 2주완성)이 품을 시간 반이 그 달에 아직 안 열린 학생이다 — 이름은 카드 보기에 있다
 */
export const unplacedNote = (n: number) => `칸을 찾지 못한 학생 ${n}명은 이 명단에 없어요 — 학생명단 카드 보기에서 확인해 주세요`;

/** 쪽 바닥의 기본 글 — 학생이 없는 반을 적지 않는 쪽 */
export const rosterBrand = (by: RosterBy) => `역전토익 학생명단 · ${by === "track" ? "레벨별" : "반별"}`;

/**
 * 쪽 하나 — `block` 의 칸들에 `from` ~ `to` 번째 이름을 적는다 (칸마다 같은 자리 — 이름이 그보다 적은 칸은 있는 만큼).
 * `part` 는 그 칸들의 몇 번째 쪽인가(0 = 첫 쪽 — 그 뒤는 `이어서`), `levelStart` 는 레벨의 첫 쪽(칸이 많아 나뉜 레벨도 한 레벨로 본다).
 * `empties` = 이 쪽에 적을 학생이 없는 반(그 레벨 마지막 쪽 · 맨 마지막 쪽), `note` = 그것을 적은 글(없으면 빈 글자) —
 * 맨 마지막 쪽에는 칸을 찾지 못한 학생 수도 앞에 붙는다 (`unplacedNote`).
 * 학생이 하나도 없는 명단은 `block` 이 빈 쪽 하나다.
 */
export type RosterSheet = {
  block: RosterBlock | null;
  from: number;
  to: number;
  part: number;
  levelStart: boolean;
  levelEnd: boolean;
  empties: RosterColumn[];
  note: string;
};

/** 명단 → 쪽들. PDF · Word 가 이 결과를 그대로 그린다 — 두 파일의 쪽 나눔이 늘 같다 */
export function planRosterSheets(roster: ClassRoster): RosterSheet[] {
  const subs = SUB_COLUMNS[roster.by];
  const sheets: RosterSheet[] = [];
  for (const block of splitPages(roster.levels)) {
    const maxNames = Math.max(0, ...block.columns.map((c) => c.students.length));
    const { perPage, pages } = rowLayout(maxNames, ROWS_PER_PAGE * subs);
    for (let p = 0; p < pages; p++) {
      sheets.push({ block, from: p * perPage, to: Math.min(maxNames, (p + 1) * perPage), part: p, levelStart: false, levelEnd: false, empties: [], note: "" });
    }
  }
  // 레벨의 첫 쪽 · 마지막 쪽 — 칸이 많아 나뉜 레벨도 한 레벨로 본다
  sheets.forEach((s, i) => {
    s.levelStart = sheets[i - 1]?.block?.level !== s.block?.level;
    s.levelEnd = sheets[i + 1]?.block?.level !== s.block?.level;
  });
  if (sheets.length === 0) sheets.push({ block: null, from: 0, to: 0, part: 0, levelStart: true, levelEnd: true, empties: [], note: "" });

  // 학생이 없는 반 — 그 레벨 마지막 쪽에. 학생이 하나도 없는 레벨(쪽이 없다)의 반은 맨 마지막 쪽에
  const printed = new Set(roster.levels.map((l) => l.level));
  const orphans = roster.empty.filter((c) => !printed.has(c.level));
  sheets.forEach((sheet, index) => {
    const block = sheet.block;
    sheet.empties = [...(block && sheet.levelEnd ? roster.empty.filter((c) => c.level === block.level.level) : []), ...(index === sheets.length - 1 ? orphans : [])];
    sheet.note = sheet.empties.length > 0 ? emptyNote(roster.by, sheet.empties) : "";
  });
  if (roster.unplaced > 0) {
    const last = sheets[sheets.length - 1];
    last.note = [unplacedNote(roster.unplaced), last.note].filter(Boolean).join(" · ");
  }
  return sheets;
}
