/**
 * 표 만들기 · 고치기의 격자 (2026-10-07 Alan — 붙여 넣은 표 → 같은 날 "표를 직접 만드는 것도 넣어주면 좋겠어").
 *
 * 글에 저장하는 표(`NoteTable`)는 HTML 표와 같은 꼴이다 — 줄마다 그 줄에서 시작하는 셀만 있고, 위에서 합쳐 내려온 셀 자리는 비어 있다.
 * 줄 · 칸을 넣고 빼거나 셀을 합치려면 "이 자리를 어느 셀이 덮었나" 를 알아야 해서, 고치는 동안은 셀마다 자리(r · c)와 크기(rs · cs)를 가진 격자로 다룬다.
 *
 * - **격자에는 빈 자리가 없다** — 모든 자리를 셀 하나가 덮는다. 붙여 넣은 표의 들쭉날쭉한 줄은 빈 셀로 채운다 (`toGrid`).
 * - **셀이 하나도 시작하지 않는 줄 · 칸은 지운다** (`normalize`) — 위(왼쪽)에서 온 합친 셀로만 덮여 화면에서 높이(폭)가 없는 줄(칸)이다.
 *   두 줄을 통째로 합치면 생긴다. 남겨 두면 줄 수가 화면과 어긋나고 그 줄을 고를 수도 없다.
 * - 셀 id 는 고치는 동안 그대로다 (화면의 key · 고른 셀이 따라간다). 새로 생긴 셀만 새 id 를 받는다.
 * - 상한은 글과 같다 (`TABLE_MAX_ROWS` · `TABLE_MAX_COLS`) — 넘게 넣으려 하면 그대로 돌려준다. 그래서 격자를 글로 되돌린 표는 늘 글로 다시 읽힌다.
 * - 줄 · 칸은 한 함수(`insertLine` · `deleteLines`)로 다루고 칸은 격자를 뒤집어(`transpose`) 같은 함수에 넣는다 — 두 벌을 따로 두면 한쪽만 고치는 날 갈라진다.
 */
import { TABLE_MAX_COLS, TABLE_MAX_ROWS, type NoteAlign, type NoteCell, type NoteCellAlign, type NoteTable } from "./note-format";

/** 격자의 셀 — 왼쪽 위 자리(r · c)와 덮는 줄 수 · 칸 수(rs · cs) */
export type GridCell = { id: number; r: number; c: number; rs: number; cs: number; text: string; align?: NoteCellAlign; head?: boolean };
export type TableGrid = { rows: number; cols: number; cells: GridCell[]; nextId: number };
/** 줄 r0~r1 · 칸 c0~c1 (끝 포함) */
export type GridRect = { r0: number; c0: number; r1: number; c1: number };

const bottom = (x: GridCell) => x.r + x.rs - 1;
const right = (x: GridCell) => x.c + x.cs - 1;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.trunc(n) || lo));
const byPlace = (a: GridCell, b: GridCell) => a.r - b.r || a.c - b.c;

/** 셀 하나 — 기본값(왼쪽 정렬 · 보통 셀)은 적지 않는다 */
function make(id: number, r: number, c: number, rs: number, cs: number, text: string, align?: NoteCellAlign, head?: boolean): GridCell {
  const x: GridCell = { id, r, c, rs, cs, text };
  if (align) x.align = align;
  if (head) x.head = true;
  return x;
}

/** 자리마다 그 자리를 덮은 셀 */
export function slotMap(g: TableGrid): (GridCell | undefined)[][] {
  const m: (GridCell | undefined)[][] = Array.from({ length: g.rows }, () => new Array<GridCell | undefined>(g.cols).fill(undefined));
  for (const x of g.cells) for (let r = x.r; r <= bottom(x) && r < g.rows; r++) for (let c = x.c; c <= right(x) && c < g.cols; c++) m[r][c] = x;
  return m;
}

/** 그 자리를 덮은 셀 */
export function cellAt(g: TableGrid, r: number, c: number): GridCell | undefined {
  return g.cells.find((x) => x.r <= r && r <= bottom(x) && x.c <= c && c <= right(x));
}

/** 줄마다 그 줄에서 시작하는 셀 (왼쪽부터) — 화면에 그릴 때 */
export function gridRows(g: TableGrid): GridCell[][] {
  const rows: GridCell[][] = Array.from({ length: g.rows }, () => []);
  for (const x of [...g.cells].sort(byPlace)) rows[x.r]?.push(x);
  return rows;
}

/** 빈 표 — `headRow` 면 첫 줄이 제목 셀 */
export function newGrid(rows: number, cols: number, headRow = false): TableGrid {
  const R = clamp(rows, 1, TABLE_MAX_ROWS);
  const C = clamp(cols, 1, TABLE_MAX_COLS);
  const cells: GridCell[] = [];
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) cells.push(make(cells.length, r, c, 1, 1, "", undefined, headRow && r === 0));
  return { rows: R, cols: C, cells, nextId: cells.length };
}

/**
 * 글의 표 → 격자. HTML 표와 같은 자리 규칙(위에서 내려온 셀 자리를 건너뛴다)으로 놓고, 겹치는 합친 셀은 겹치기 전까지로 줄인다 —
 * 붙여 넣은 표가 HTML 에서는 겹쳐 그려지던 모양이어도 격자에서는 한 자리에 셀 하나다. 아무것도 덮지 않는 줄(빈 줄)은 빼고 빈 자리는 빈 셀로 채운다
 */
export function toGrid(t: NoteTable): TableGrid {
  const R = Math.min(t.rows.length, TABLE_MAX_ROWS);
  const taken: boolean[][] = Array.from({ length: R }, () => []);
  const placed: GridCell[] = [];
  let cols = 0;
  for (let r = 0; r < R; r++) {
    let c = 0;
    for (const x of t.rows[r]) {
      while (taken[r][c]) c++;
      if (c >= TABLE_MAX_COLS) break;
      let cs = clamp(x.colspan ?? 1, 1, TABLE_MAX_COLS - c);
      for (let k = 1; k < cs; k++) {
        if (taken[r][c + k]) {
          cs = k;
          break;
        }
      }
      let rs = clamp(x.rowspan ?? 1, 1, R - r);
      for (let k = 1; k < rs; k++) {
        if (taken[r + k].slice(c, c + cs).some(Boolean)) {
          rs = k;
          break;
        }
      }
      for (let i = 0; i < rs; i++) for (let j = 0; j < cs; j++) taken[r + i][c + j] = true;
      placed.push(make(placed.length, r, c, rs, cs, x.text, x.align, x.head));
      c += cs;
      cols = Math.max(cols, c);
    }
  }
  if (placed.length === 0) return newGrid(1, 1);
  // 아무 셀도 덮지 않는 줄은 뺀다 — 셀이 그 줄을 가로지르는 일은 없다 (가로지르면 그 줄이 덮인다)
  const index: number[] = [];
  let rows = 0;
  for (let r = 0; r < R; r++) {
    index[r] = rows;
    if (taken[r].some(Boolean)) rows++;
  }
  const g: TableGrid = { rows, cols, cells: placed.map((x) => ({ ...x, r: index[x.r] })), nextId: placed.length };
  const m = slotMap(g);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (!m[r][c]) g.cells.push(make(g.nextId++, r, c, 1, 1, ""));
  return normalize(g);
}

/** 격자 → 글의 표. 줄마다 그 줄에서 시작하는 셀을 왼쪽부터 */
export function fromGrid(g: TableGrid): NoteTable {
  return {
    rows: gridRows(g).map((row) =>
      row.map((x) => {
        const cell: NoteCell = { text: x.text };
        if (x.rs > 1) cell.rowspan = x.rs;
        if (x.cs > 1) cell.colspan = x.cs;
        if (x.align) cell.align = x.align;
        if (x.head) cell.head = true;
        return cell;
      }),
    ),
  };
}

/** 줄 ↔ 칸을 바꾼 격자 — 칸을 다루는 일을 줄을 다루는 함수에 맡긴다 */
function transpose(g: TableGrid): TableGrid {
  return { rows: g.cols, cols: g.rows, nextId: g.nextId, cells: g.cells.map((x) => ({ ...x, r: x.c, c: x.r, rs: x.cs, cs: x.rs })) };
}

/** 셀이 하나도 시작하지 않는 줄을 지우고 그 줄을 덮던 셀을 한 줄씩 줄인다 */
function dropEmptyRows(g: TableGrid): TableGrid {
  let { rows, cells } = g;
  for (let r = rows - 1; r >= 0; r--) {
    if (cells.some((x) => x.r === r)) continue;
    cells = cells.map((x) => (x.r > r ? { ...x, r: x.r - 1 } : bottom(x) >= r ? { ...x, rs: x.rs - 1 } : x));
    rows--;
  }
  return { ...g, rows, cells };
}

/** 높이 없는 줄 · 폭 없는 칸을 지운다 (위 머리말) */
export function normalize(g: TableGrid): TableGrid {
  return transpose(dropEmptyRows(transpose(dropEmptyRows(g))));
}

/**
 * 줄 하나를 `at` 자리에 넣는다 (0 = 맨 위 · rows = 맨 아래). 넣는 자리를 가로지르는 합친 셀은 한 줄 길어진다.
 * 새 셀의 서식은 `ref` 줄(옆에 있던 줄)을 따른다 — 정렬은 그대로, 제목 셀은 그 줄이 **통째로 제목 줄이 아닐 때만**
 * (제목 줄 아래에 넣은 줄은 보통 줄이고, 첫 칸만 제목인 표에 넣은 줄은 첫 칸이 제목이다)
 */
function insertLine(g: TableGrid, at: number, ref: number, max: number): TableGrid {
  if (g.rows >= max || at < 0 || at > g.rows) return g;
  const m = slotMap(g);
  const from = m[clamp(ref, 0, g.rows - 1)];
  const headLine = from.every((x) => x?.head);
  let nextId = g.nextId;
  const cells = g.cells.map((x) => (x.r >= at ? { ...x, r: x.r + 1 } : bottom(x) >= at ? { ...x, rs: x.rs + 1 } : x));
  for (let c = 0; c < g.cols; c++) {
    if (at > 0 && at < g.rows && m[at - 1][c] === m[at][c]) continue; // 가로지르는 셀이 덮는다
    const src = from[c];
    cells.push(make(nextId++, at, c, 1, 1, "", src?.align, !headLine && src?.head));
  }
  return { rows: g.rows + 1, cols: g.cols, cells, nextId };
}

/**
 * 줄 a~b 를 지운다. 지운 줄에 걸친 합친 셀은 그만큼 짧아지고(글자는 남는다), 지운 줄에서 시작해 아래로 이어지던 셀은 지운 자리 바로 아래 줄로 옮긴다.
 * 표가 통째로 비게 되면 그대로 돌려준다 (표 지우기는 편집기에서 한다)
 */
function deleteLines(g: TableGrid, a: number, b: number): TableGrid {
  const lo = Math.max(0, Math.min(a, b));
  const hi = Math.min(g.rows - 1, Math.max(a, b));
  const n = hi - lo + 1;
  if (n <= 0 || n >= g.rows) return g;
  const cells: GridCell[] = [];
  for (const x of g.cells) {
    const cut = Math.max(0, Math.min(bottom(x), hi) - Math.max(x.r, lo) + 1);
    if (cut === x.rs) continue;
    cells.push({ ...x, r: x.r < lo ? x.r : x.r > hi ? x.r - n : lo, rs: x.rs - cut });
  }
  return normalize({ rows: g.rows - n, cols: g.cols, cells, nextId: g.nextId });
}

/** 줄 넣기 — `at` 자리에, 서식은 `ref` 줄을 따라 */
export const insertRow = (g: TableGrid, at: number, ref: number) => insertLine(g, at, ref, TABLE_MAX_ROWS);
/** 칸 넣기 — `at` 자리에, 서식은 `ref` 칸을 따라 (제목 칸이 통째로 제목이 아니면 제목 셀은 그 줄을 따른다 — 제목 줄이 있는 표에 넣은 칸은 맨 위가 제목) */
export function insertCol(g: TableGrid, at: number, ref: number): TableGrid {
  const t = transpose(g);
  const out = insertLine(t, at, ref, TABLE_MAX_COLS);
  return out === t ? g : transpose(out);
}
/** 줄 r0~r1 지우기 */
export const deleteRows = (g: TableGrid, r0: number, r1: number) => deleteLines(g, r0, r1);
/** 칸 c0~c1 지우기 */
export function deleteCols(g: TableGrid, c0: number, c1: number): TableGrid {
  const t = transpose(g);
  const out = deleteLines(t, c0, c1);
  return out === t ? g : transpose(out);
}

/** 두 셀(처음 고른 셀 · 마지막 고른 셀)을 품는 네모 — 테두리에 걸친 합친 셀이 없을 때까지 넓힌다 (엑셀처럼) */
export function selectionRect(g: TableGrid, a: GridCell, b: GridCell): GridRect {
  let r0 = Math.min(a.r, b.r);
  let c0 = Math.min(a.c, b.c);
  let r1 = Math.max(bottom(a), bottom(b));
  let c1 = Math.max(right(a), right(b));
  for (let grown = true; grown; ) {
    grown = false;
    for (const x of g.cells) {
      if (x.r > r1 || bottom(x) < r0 || x.c > c1 || right(x) < c0) continue;
      if (x.r < r0 || bottom(x) > r1 || x.c < c0 || right(x) > c1) {
        r0 = Math.min(r0, x.r);
        r1 = Math.max(r1, bottom(x));
        c0 = Math.min(c0, x.c);
        c1 = Math.max(c1, right(x));
        grown = true;
      }
    }
  }
  return { r0, c0, r1, c1 };
}

/** 네모 안의 셀 (읽는 순서) — 넓힌 네모(`selectionRect`)면 걸친 셀이 없어 안의 셀이 네모를 꼭 채운다 */
export function cellsIn(g: TableGrid, rect: GridRect): GridCell[] {
  return g.cells.filter((x) => x.r >= rect.r0 && bottom(x) <= rect.r1 && x.c >= rect.c0 && right(x) <= rect.c1).sort(byPlace);
}

/** 네모 안의 셀을 하나로 — 왼쪽 위 셀의 서식을 남기고, 글자는 읽는 순서대로 줄을 바꿔 잇는다 (빈 셀은 건너뛴다) */
export function mergeCells(g: TableGrid, rect: GridRect): TableGrid {
  const inside = cellsIn(g, rect);
  if (inside.length < 2) return g;
  const [first] = inside;
  const text = inside
    .map((x) => x.text.trim())
    .filter(Boolean)
    .join("\n");
  const gone = new Set(inside.map((x) => x.id));
  const merged: GridCell = { ...first, r: rect.r0, c: rect.c0, rs: rect.r1 - rect.r0 + 1, cs: rect.c1 - rect.c0 + 1, text };
  return normalize({ ...g, cells: [...g.cells.filter((x) => !gone.has(x.id)), merged] });
}

/** 합친 셀을 낱셀로 — 글자는 왼쪽 위 셀에 남고, 정렬 · 제목 셀은 나뉜 셀 모두가 받는다 */
export function splitCells(g: TableGrid, ids: Iterable<number>): TableGrid {
  const want = new Set(ids);
  let nextId = g.nextId;
  const cells: GridCell[] = [];
  for (const x of g.cells) {
    if (!want.has(x.id) || (x.rs === 1 && x.cs === 1)) {
      cells.push(x);
      continue;
    }
    for (let i = 0; i < x.rs; i++) {
      for (let j = 0; j < x.cs; j++) cells.push(i === 0 && j === 0 ? { ...x, rs: 1, cs: 1 } : make(nextId++, x.r + i, x.c + j, 1, 1, "", x.align, x.head));
    }
  }
  return nextId === g.nextId ? g : { ...g, cells, nextId };
}

/** 고른 셀의 정렬 (왼쪽 = 표시 없음) */
export function setAlign(g: TableGrid, ids: Iterable<number>, align: NoteAlign): TableGrid {
  const want = new Set(ids);
  return {
    ...g,
    cells: g.cells.map((x) => {
      if (!want.has(x.id)) return x;
      const y = { ...x };
      if (align === "left") delete y.align;
      else y.align = align;
      return y;
    }),
  };
}

/** 고른 셀을 제목 셀(분홍 바탕 · 굵게)로 / 보통 셀로 */
export function setHead(g: TableGrid, ids: Iterable<number>, head: boolean): TableGrid {
  const want = new Set(ids);
  return {
    ...g,
    cells: g.cells.map((x) => {
      if (!want.has(x.id)) return x;
      const y = { ...x };
      if (head) y.head = true;
      else delete y.head;
      return y;
    }),
  };
}

/** 한 셀의 글자 */
export function setText(g: TableGrid, id: number, text: string): TableGrid {
  return { ...g, cells: g.cells.map((x) => (x.id === id ? { ...x, text } : x)) };
}
