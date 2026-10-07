import { describe, expect, it } from "vitest";
import { TABLE_MAX_COLS, TABLE_MAX_ROWS, asNoteTable, parseTableBody, tableSize, tableToNote, type NoteTable } from "./note-format";
import {
  cellAt,
  cellsIn,
  deleteCols,
  deleteRows,
  fromGrid,
  gridRows,
  insertCol,
  insertRow,
  mergeCells,
  newGrid,
  selectionRect,
  setAlign,
  setHead,
  setText,
  splitCells,
  toGrid,
  type GridRect,
  type TableGrid,
} from "./table-grid";

/** 한눈에 보는 격자 — `글자[줄x칸]*^` (* 제목 셀 · ^ 가운데 · > 오른쪽 · 빈 셀은 ·), 줄은 ` / ` */
function show(g: TableGrid): string {
  return gridRows(g)
    .map((row) =>
      row
        .map((x) => `${x.text.replace(/\n/g, "↵") || "·"}${x.rs > 1 || x.cs > 1 ? `[${x.rs}x${x.cs}]` : ""}${x.head ? "*" : ""}${x.align === "center" ? "^" : x.align === "right" ? ">" : ""}`)
        .join(" "),
    )
    .join(" / ");
}

/** 격자가 지켜야 할 것 — 모든 자리를 셀 하나가 덮는다 · 줄 · 칸마다 시작하는 셀이 있다 · id 는 겹치지 않는다 · 글로 저장했다 다시 읽어도 같다 */
function expectWellFormed(g: TableGrid) {
  expect(g.rows).toBeGreaterThanOrEqual(1);
  expect(g.cols).toBeGreaterThanOrEqual(1);
  expect(g.rows).toBeLessThanOrEqual(TABLE_MAX_ROWS);
  expect(g.cols).toBeLessThanOrEqual(TABLE_MAX_COLS);
  const cover = Array.from({ length: g.rows }, () => new Array<number>(g.cols).fill(0));
  for (const x of g.cells) {
    expect(x.rs).toBeGreaterThanOrEqual(1);
    expect(x.cs).toBeGreaterThanOrEqual(1);
    expect(x.r + x.rs).toBeLessThanOrEqual(g.rows);
    expect(x.c + x.cs).toBeLessThanOrEqual(g.cols);
    expect(x.id).toBeLessThan(g.nextId);
    for (let r = x.r; r < x.r + x.rs; r++) for (let c = x.c; c < x.c + x.cs; c++) cover[r][c]++;
  }
  expect(cover.flat().every((n) => n === 1)).toBe(true);
  expect(new Set(g.cells.map((x) => x.id)).size).toBe(g.cells.length);
  for (let r = 0; r < g.rows; r++) expect(g.cells.some((x) => x.r === r)).toBe(true);
  for (let c = 0; c < g.cols; c++) expect(g.cells.some((x) => x.c === c)).toBe(true);
  const t = fromGrid(g);
  expect(tableSize(t)).toEqual({ rows: g.rows, cols: g.cols });
  expect(asNoteTable(t)).toEqual(t);
  expect(parseTableBody(tableToNote(t).slice("[table]".length, -"[/table]".length))).toEqual(t);
  expect(fromGrid(toGrid(t))).toEqual(t);
}

const all = (g: TableGrid) => selectionRect(g, cellAt(g, 0, 0)!, cellAt(g, g.rows - 1, g.cols - 1)!);
const rect = (r0: number, c0: number, r1: number, c1: number): GridRect => ({ r0, c0, r1, c1 });
const withTexts = (g: TableGrid, texts: string[][]) => {
  let out = g;
  texts.forEach((row, r) => row.forEach((t, c) => (out = setText(out, cellAt(out, r, c)!.id, t))));
  return out;
};

/** 2026-10-07 Alan 이 보여 준 네이버 블로그 표 (붙여 넣기 테스트와 같은 모양) */
const ALAN: NoteTable = {
  rows: [
    [{ text: "의문사", align: "center", head: true }, { text: "be 동사", align: "center", head: true }, { text: "주어", head: true }, { text: "동사ing", head: true }],
    [{ text: "When\nWho\nWhere", rowspan: 4, align: "center" }, { text: "am" }, { text: "I" }, { text: "running", rowspan: 4, align: "right" }],
    [{ text: "are" }, { text: "you" }],
    [{ text: "is" }, { text: "he/ she/ it" }],
    [{ text: "are" }, { text: "we/ you and I/ you/ they" }],
  ],
};

describe("표 격자 (2026-10-07 Alan — 표를 직접 만들기)", () => {
  it("새 표 — 줄 × 칸 빈 셀, 첫 줄은 제목 셀로 고를 수 있다 · 상한 안으로", () => {
    const g = newGrid(3, 4, true);
    expect(show(g)).toBe("·* ·* ·* ·* / · · · · / · · · ·");
    expectWellFormed(g);
    expect(show(newGrid(2, 2))).toBe("· · / · ·");
    expect([newGrid(0, 0).rows, newGrid(0, 0).cols]).toEqual([1, 1]);
    expect([newGrid(500, 50).rows, newGrid(500, 50).cols]).toEqual([TABLE_MAX_ROWS, TABLE_MAX_COLS]);
  });

  it("글의 표 → 격자 → 글의 표 — 합친 셀 · 정렬 · 제목 셀 · 칸 안 줄바꿈이 그대로", () => {
    const g = toGrid(ALAN);
    expect([g.rows, g.cols]).toEqual([5, 4]);
    expect(cellAt(g, 4, 0)?.text).toBe("When\nWho\nWhere");
    expect(cellAt(g, 2, 3)?.text).toBe("running");
    expect(fromGrid(g)).toEqual(ALAN);
    expectWellFormed(g);
  });

  it("붙여 넣은 표의 들쭉날쭉한 모양 — 빈 자리는 빈 셀 · 넘치는 합친 셀은 줄이고 · 겹치면 겹치기 전까지 · 빈 줄은 뺀다", () => {
    // 줄마다 셀 수가 다르다
    expect(show(toGrid({ rows: [[{ text: "a" }, { text: "b" }, { text: "c" }], [{ text: "d" }]] }))).toBe("a b c / d · ·");
    // 아래로 표 밖까지 합친 셀
    expect(show(toGrid({ rows: [[{ text: "a", rowspan: 9 }, { text: "b" }], [{ text: "c" }]] }))).toBe("a[2x1] b / c");
    // 위에서 내려온 셀과 겹치는 옆 합친 셀 — 겹치기 전까지
    const overlap = toGrid({ rows: [[{ text: "a" }, { text: "b", rowspan: 2 }], [{ text: "c", colspan: 3 }]] });
    expect(show(overlap)).toBe("a b[2x1] / c");
    expectWellFormed(overlap);
    // 아무것도 덮지 않는 빈 줄
    expect(show(toGrid({ rows: [[{ text: "a" }], [], [{ text: "b" }]] }))).toBe("a / b");
    // 위에서 합친 셀로만 덮인 줄 · 폭이 없는 칸은 화면처럼 하나로 접힌다
    expect(show(toGrid({ rows: [[{ text: "a", rowspan: 2 }, { text: "b", rowspan: 2 }], []] }))).toBe("a b");
    expect(show(toGrid({ rows: [[{ text: "a", colspan: 2 }], [{ text: "b", colspan: 2 }]] }))).toBe("a / b");
  });

  it("줄 넣기 — 위 · 아래, 넣는 자리를 가로지르는 합친 셀은 길어진다 · 제목 줄 아래 줄은 보통 줄", () => {
    const g = toGrid(ALAN);
    // 제목 줄 바로 아래 — 새 줄은 제목 셀이 아니고 정렬은 그 줄을 따른다
    const below = insertRow(g, 1, 0);
    expect(show(below).split(" / ")[1]).toBe("·^ ·^ · ·");
    expectWellFormed(below);
    // 합친 셀 가운데에 넣으면 그 셀이 한 줄 길어진다
    const middle = insertRow(g, 3, 2);
    expect(cellAt(middle, 1, 0)?.rs).toBe(5);
    expect(cellAt(middle, 1, 3)?.rs).toBe(5);
    expect(show(middle).split(" / ")[3]).toBe("· ·");
    expectWellFormed(middle);
    // 맨 아래
    const last = insertRow(g, 5, 4);
    expect(show(last).split(" / ")[5]).toBe("·^ · · ·>");
    expectWellFormed(last);
    // 상한이면 그대로
    const full = newGrid(TABLE_MAX_ROWS, 1);
    expect(insertRow(full, 0, 0)).toBe(full);
  });

  it("첫 칸만 제목인 표에 넣은 줄은 첫 칸이 제목이다", () => {
    const g = setHead(newGrid(2, 2), [cellAt(newGrid(2, 2), 0, 0)!.id, cellAt(newGrid(2, 2), 1, 0)!.id], true);
    expect(show(insertRow(g, 2, 1))).toBe("·* · / ·* · / ·* ·");
  });

  it("칸 넣기 — 왼쪽 · 오른쪽, 제목 줄이 있는 표에 넣은 칸은 맨 위가 제목 셀이다", () => {
    const g = toGrid(ALAN);
    const right = insertCol(g, 4, 3);
    expect(show(right).split(" / ")[0]).toBe("의문사*^ be 동사*^ 주어* 동사ing* ·*");
    expect(show(right).split(" / ")[1]).toBe("When↵Who↵Where[4x1]^ am I running[4x1]> ·>");
    expectWellFormed(right);
    const left = insertCol(g, 0, 0);
    expect(show(left).split(" / ")[0]).toBe("·*^ 의문사*^ be 동사*^ 주어* 동사ing*");
    expect(show(left).split(" / ")[1]).toBe("·^ When↵Who↵Where[4x1]^ am I running[4x1]>");
    expectWellFormed(left);
    // 옆으로 합친 셀 가운데에 넣으면 그 셀이 한 칸 넓어진다
    const wide = mergeCells(newGrid(2, 3), rect(0, 0, 0, 1));
    expect(show(insertCol(wide, 1, 0))).toBe("·[1x3] · / · · · ·");
    // 상한이면 그대로
    const full = newGrid(1, TABLE_MAX_COLS);
    expect(insertCol(full, 0, 0)).toBe(full);
  });

  it("줄 지우기 — 걸친 합친 셀은 짧아지고 글자는 남는다 · 표를 통째로 비우지는 않는다", () => {
    const g = toGrid(ALAN);
    // 합친 셀이 시작하는 줄을 지우면 그 셀은 아래 줄로 옮겨 남는다
    const top = deleteRows(g, 1, 1);
    expect(show(top)).toBe("의문사*^ be 동사*^ 주어* 동사ing* / When↵Who↵Where[3x1]^ are you running[3x1]> / is he/ she/ it / are we/ you and I/ you/ they");
    expectWellFormed(top);
    // 가운데 두 줄
    const mid = deleteRows(g, 2, 3);
    expect(cellAt(mid, 1, 0)?.rs).toBe(2);
    expect(show(mid).split(" / ")[2]).toBe("are we/ you and I/ you/ they");
    expectWellFormed(mid);
    // 합친 셀이 덮는 줄을 다 지우면 그 셀도 지워진다
    expect(show(deleteRows(g, 1, 4))).toBe("의문사*^ be 동사*^ 주어* 동사ing*");
    // 다 지울 수는 없다
    expect(deleteRows(g, 0, 4)).toBe(g);
    expect(deleteRows(newGrid(1, 3), 0, 0)).toEqual(newGrid(1, 3));
  });

  it("칸 지우기 — 줄 지우기와 같은 규칙 · 폭이 없어진 칸은 접힌다", () => {
    const g = toGrid(ALAN);
    // 가운데 두 칸을 지우면 아래 세 줄에는 시작하는 셀이 없다 — 위에서 내려온 합친 셀로만 덮인 줄은 화면에서 높이가 없어 접힌다
    const c = deleteCols(g, 1, 2);
    expect(show(c)).toBe("의문사*^ 동사ing* / When↵Who↵Where^ running>");
    expectWellFormed(c);
    expect(deleteCols(g, 0, 3)).toBe(g);
    // 옆으로 합친 셀만 남아 높이가 없는 줄 → 접힌다
    const merged = mergeCells(newGrid(2, 3), rect(0, 0, 0, 1));
    expect(show(deleteCols(merged, 2, 2))).toBe("·[1x2] / · ·");
  });

  it("여러 셀 고르기 — 걸친 합친 셀을 품을 때까지 네모가 넓어진다 (엑셀처럼)", () => {
    const g = toGrid(ALAN);
    // am(1,1) ~ 첫 칸의 합친 셀 → 합친 셀이 4줄이라 1~4줄까지
    expect(selectionRect(g, cellAt(g, 1, 1)!, cellAt(g, 2, 0)!)).toEqual(rect(1, 0, 4, 1));
    // 제목 줄의 한 셀 ~ 아래 셀은 그대로
    expect(selectionRect(g, cellAt(g, 0, 1)!, cellAt(g, 1, 1)!)).toEqual(rect(0, 1, 1, 1));
    // 거꾸로 골라도 같다
    expect(selectionRect(g, cellAt(g, 4, 2)!, cellAt(g, 1, 1)!)).toEqual(rect(1, 1, 4, 2));
    expect(cellsIn(g, rect(1, 1, 2, 2)).map((x) => x.text)).toEqual(["am", "I", "are", "you"]);
    expect(all(g)).toEqual(rect(0, 0, 4, 3));
  });

  it("셀 합치기 — 왼쪽 위 서식을 남기고 글자는 읽는 순서로 줄을 바꿔 잇는다", () => {
    const g = withTexts(setAlign(newGrid(2, 2), [0], "center"), [
      ["a", ""],
      ["c", " d "],
    ]);
    const m = mergeCells(g, all(g));
    // 2줄 × 2칸을 다 합치면 한 셀 — 높이 없는 줄 · 폭 없는 칸이 접힌다
    expect(show(m)).toBe("a↵c↵d^");
    expect([m.rows, m.cols]).toEqual([1, 1]);
    expectWellFormed(m);
    // 한 칸을 세로로
    const col = mergeCells(withTexts(newGrid(3, 2), [["a", "b"], ["c", "d"], ["e", "f"]]), rect(0, 0, 2, 0));
    expect(show(col)).toBe("a↵c↵e[3x1] b / d / f");
    expectWellFormed(col);
    // 셀 하나는 그대로
    expect(mergeCells(g, rect(0, 0, 0, 0))).toBe(g);
  });

  it("셀 나누기 — 글자는 왼쪽 위에 남고 정렬 · 제목 셀은 나뉜 셀이 모두 받는다", () => {
    const g = toGrid(ALAN);
    const merged = cellAt(g, 1, 0)!;
    const s = splitCells(g, [merged.id]);
    expect(show(s).split(" / ").slice(1)).toEqual([
      "When↵Who↵Where^ am I running[4x1]>",
      "·^ are you",
      "·^ is he/ she/ it",
      "·^ are we/ you and I/ you/ they",
    ]);
    expect(cellAt(s, 1, 0)?.id).toBe(merged.id);
    expectWellFormed(s);
    // 낱셀만 골랐으면 그대로
    expect(splitCells(g, [cellAt(g, 1, 1)!.id])).toBe(g);
  });

  it("정렬 · 제목 셀 · 글자", () => {
    const g = newGrid(1, 2);
    const ids = g.cells.map((x) => x.id);
    expect(show(setAlign(g, ids, "right"))).toBe("·> ·>");
    expect(setAlign(setAlign(g, ids, "center"), ids, "left")).toEqual(g);
    expect(show(setHead(g, [ids[1]], true))).toBe("· ·*");
    expect(setHead(setHead(g, ids, true), ids, false)).toEqual(g);
    expect(show(setText(g, ids[0], "가"))).toBe("가 ·");
  });

  it("Alan 의 표를 처음부터 만든다 — 5줄 × 4칸 · 첫 줄 제목 · 첫 칸 · 끝 칸 세로 합치기", () => {
    let g = newGrid(5, 4, true);
    g = withTexts(g, [
      ["의문사", "be 동사", "주어", "동사ing"],
      ["When\nWho\nWhere", "am", "I", "running"],
      ["", "are", "you", ""],
      ["", "is", "he/ she/ it", ""],
      ["", "are", "we/ you and I/ you/ they", ""],
    ]);
    g = mergeCells(g, selectionRect(g, cellAt(g, 1, 0)!, cellAt(g, 4, 0)!));
    g = mergeCells(g, selectionRect(g, cellAt(g, 1, 3)!, cellAt(g, 4, 3)!));
    g = setAlign(g, [cellAt(g, 0, 0)!.id, cellAt(g, 0, 1)!.id, cellAt(g, 1, 0)!.id], "center");
    g = setAlign(g, [cellAt(g, 1, 3)!.id], "right");
    expectWellFormed(g);
    expect(fromGrid(g)).toEqual(ALAN);
  });

  it("아무렇게나 고쳐도 격자가 무너지지 않는다 (줄 · 칸 넣기 · 지우기 · 합치기 · 나누기 2,000번)", () => {
    // 같은 순서가 매번 나오게 — 실패하면 다시 돌려 볼 수 있다
    let seed = 20261007;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    let g = toGrid(ALAN);
    for (let step = 0; step < 2000; step++) {
      const a = cellAt(g, rand(g.rows), rand(g.cols))!;
      const b = cellAt(g, rand(g.rows), rand(g.cols))!;
      const sel = selectionRect(g, a, b);
      switch (rand(7)) {
        case 0:
          g = insertRow(g, rand(g.rows + 1), rand(g.rows));
          break;
        case 1:
          g = insertCol(g, rand(g.cols + 1), rand(g.cols));
          break;
        case 2:
          g = deleteRows(g, sel.r0, sel.r1);
          break;
        case 3:
          g = deleteCols(g, sel.c0, sel.c1);
          break;
        case 4:
        case 5:
          g = mergeCells(g, sel);
          break;
        default:
          g = splitCells(g, cellsIn(g, sel).map((x) => x.id));
      }
      if (g.rows * g.cols > 60) g = deleteRows(g, 0, Math.floor(g.rows / 2));
      expectWellFormed(g);
    }
  });
});
