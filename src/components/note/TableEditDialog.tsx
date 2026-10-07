"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { NOTE_ALIGN_LABEL, NOTE_ALIGNS, TABLE_MAX_COLS, TABLE_MAX_ROWS, cleanCellText, type NoteAlign, type NoteTable } from "@/lib/note-format";
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
  type GridCell,
  type TableGrid,
} from "@/lib/table-grid";
import { cn } from "@/lib/utils";
import { AlignGlyph, Tool } from "./tools";

/**
 * 표 만들기 · 고치기 (2026-10-07 Alan — 붙여 넣은 표의 칸 글자 고치기 → 같은 날 "표를 직접 만드는 것도 넣어주면 좋겠어").
 *
 * - `table` 이 없으면 새 표다: 크기(줄 × 칸 · 첫 줄 제목 셀)를 고르고 → 셀을 채우고 다듬은 뒤 `표 넣기`. 취소하면 아무것도 들어가지 않는다.
 *   있으면 그 표를 같은 화면에서 고친다(`적용`).
 * - 고른 셀(처음 고른 셀 ~ 마지막 고른 셀을 품는 네모 — `selectionRect`, 걸친 합친 셀까지 넓힌다)에 줄 · 칸 넣기 · 지우기, 셀 합치기 · 나누기,
 *   정렬, 제목 셀을 건다. 구조는 `table-grid.ts` 가 다루고 여기는 누르는 것만 받는다.
 * - **여러 셀 고르기** — PC 는 끌거나 Shift+클릭. 휴대폰은 `여러 셀 고르기` 를 켜고 두 귀퉁이를 차례로 누른다 (켜 두는 동안은 글자 칸이 열리지 않는다 — 자판이 뜨지 않게).
 * - 팝업이 화면을 덮어 고치는 동안 편집기 글이 바뀌지 않는다 — 그래서 고치는 표의 자리(offset) · 넣을 커서 자리가 그대로다.
 *   바깥을 눌러도 닫히지 않는다(`dismissible={false}` — 한참 적은 칸을 잃지 않게).
 * - 폼 안에서 열리므로 버튼은 `type="button"`, 칸 · 고르기 칸에는 name 을 두지 않는다 (폼 값에 섞이지 않게).
 *   숫자 입력칸(input)은 쓰지 않는다 — 그 안에서 Enter 를 누르면 바깥 폼(자료 올리기)이 저장된다. 크기는 고르는 칸(select)이다.
 * - 셀 글자는 휴대폰에서 16px — 그보다 작으면 아이폰이 칸을 누를 때 화면을 확대한다. 셀 칸은 글자만큼 늘어난다(`field-sizing`, 안 되는 브라우저는 줄 수만큼) —
 *   칸마다 크기 조절 손잡이를 두면 표가 손잡이로 어지럽다.
 */
export function TableEditDialog({ table, onApply, onClose }: { table: NoteTable | null; onApply: (table: NoteTable) => void; onClose: () => void }) {
  const [start, setStart] = useState<TableGrid | null>(() => (table ? toGrid(table) : null));
  return (
    <Dialog open title={table ? "표 고치기" : "표 만들기"} onClose={onClose} wide dismissible={false}>
      {start ? (
        <GridEditor initial={start} isNew={!table} onApply={onApply} onCancel={onClose} />
      ) : (
        <SizePicker onPick={(rows, cols, headRow) => setStart(newGrid(rows, cols, headRow))} onCancel={onClose} />
      )}
    </Dialog>
  );
}

/** 눌러서 고르는 네모의 크기 — 8줄 × 8칸. 더 큰 표는 아래 고르는 칸으로 (상한은 글과 같다) */
const PICK = 8;

function SizePicker({ onPick, onCancel }: { onPick: (rows: number, cols: number, headRow: boolean) => void; onCancel: () => void }) {
  const [rows, setRows] = useState(3);
  const [cols, setCols] = useState(3);
  const [headRow, setHeadRow] = useState(true);
  // PC 에서 네모 위에 마우스를 올리면 그 크기를 미리 보여 준다 (누르면 정해진다)
  const [hover, setHover] = useState<[number, number] | null>(null);
  const [r, c] = hover ?? [rows, cols];

  return (
    <>
      <p className="text-xs text-slate">네모를 누르거나 줄 수 · 칸 수를 고르세요. 만든 뒤에도 줄 · 칸을 넣고 지우고, 셀을 합칠 수 있어요.</p>
      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-3">
        {/* 고르는 칸(select)과 같은 일을 한다 — 화면 낭독기 · 키보드는 그쪽을 쓴다 */}
        <div aria-hidden onPointerLeave={() => setHover(null)} className="grid w-max grid-cols-8 gap-1">
          {Array.from({ length: PICK * PICK }, (_, k) => {
            const rr = Math.floor(k / PICK) + 1;
            const cc = (k % PICK) + 1;
            return (
              <button
                key={k}
                type="button"
                tabIndex={-1}
                onPointerEnter={(e) => {
                  if (e.pointerType === "mouse") setHover([rr, cc]);
                }}
                onClick={() => {
                  setRows(rr);
                  setCols(cc);
                }}
                className={cn("size-6 rounded border transition-colors", rr <= r && cc <= c ? "border-brand-500 bg-brand-100" : "border-line bg-white")}
              />
            );
          })}
        </div>
        <div className="space-y-2">
          <p className="text-xl font-black tabular-nums text-ink">
            {r}줄 × {c}칸
          </p>
          <SizeSelect label="줄 수" value={rows} max={TABLE_MAX_ROWS} onChange={setRows} />
          <SizeSelect label="칸 수" value={cols} max={TABLE_MAX_COLS} onChange={setCols} />
        </div>
      </div>
      <label className="mt-4 flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" checked={headRow} onChange={(e) => setHeadRow(e.currentTarget.checked)} className="size-4 accent-brand-500" />
        첫 줄은 제목 셀로 (분홍 바탕 · 굵게)
      </label>
      <Footer ok="만들기" onOk={() => onPick(rows, cols, headRow)} onCancel={onCancel} />
    </>
  );
}

function SizeSelect({ label, value, max, onChange }: { label: string; value: number; max: number; onChange: (n: number) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-ink">
      <span className="w-10 font-bold">{label}</span>
      <select value={value} onChange={(e) => onChange(Number(e.currentTarget.value))} className="input select-chevron !w-auto !py-1.5 !pl-3 !pr-7 font-bold tabular-nums">
        {Array.from({ length: max }, (_, i) => (
          <option key={i} value={i + 1}>
            {i + 1}
          </option>
        ))}
      </select>
    </label>
  );
}

/** 고른 셀 — 처음 고른 셀(anchor)부터 마지막 고른 셀(focus)까지 */
type Sel = { anchor: number; focus: number };
const single = (x: GridCell): Sel => ({ anchor: x.id, focus: x.id });

function GridEditor({ initial, isNew, onApply, onCancel }: { initial: TableGrid; isNew: boolean; onApply: (table: NoteTable) => void; onCancel: () => void }) {
  const [grid, setGrid] = useState(initial);
  const [sel, setSel] = useState<Sel>(() => single(cellAt(initial, 0, 0)!));
  /** 휴대폰의 여러 셀 고르기 — 켜 두는 동안 셀을 누르면 글자 칸이 열리지 않고 두 귀퉁이를 차례로 고른다 */
  const [multi, setMulti] = useState(false);
  const tableRef = useRef<HTMLTableElement>(null);
  /** 다시 그린 뒤 커서를 둘 셀 — 새 표는 첫 셀부터 바로 적게 */
  const focusAfter = useRef<number | null>(isNew ? sel.anchor : null);
  /** PC 끌어서 고르기를 멈추는 함수 (끄는 중일 때만) */
  const stopDrag = useRef<(() => void) | null>(null);

  useEffect(() => () => stopDrag.current?.(), []);

  useLayoutEffect(() => {
    const id = focusAfter.current;
    if (id === null) return;
    focusAfter.current = null;
    tableRef.current?.querySelector<HTMLTextAreaElement>(`[data-cell="${id}"] textarea`)?.focus();
  });

  const byId = new Map(grid.cells.map((x) => [x.id, x] as const));
  const home = cellAt(grid, 0, 0)!;
  const a = byId.get(sel.anchor) ?? home;
  const f = byId.get(sel.focus) ?? a;
  const rect = selectionRect(grid, a, f);
  const chosen = cellsIn(grid, rect);
  const picked = new Set(chosen.map((x) => x.id));
  const span = { rows: rect.r1 - rect.r0 + 1, cols: rect.c1 - rect.c0 + 1 };
  const allHead = chosen.every((x) => x.head);
  const alignOn = (al: NoteAlign) => chosen.every((x) => (x.align ?? "left") === al);
  const anyMerged = chosen.some((x) => x.rs > 1 || x.cs > 1);

  /** 표를 바꾼다 — 셀에서 글을 치던 중이면 다시 그린 뒤 그 셀로 커서를 돌려놓는다 (줄을 넣으면 아래 셀들이 다른 줄로 옮겨 새로 그려진다) */
  function update(next: TableGrid, nextSel: Sel = sel, keepMulti = false) {
    const active = document.activeElement;
    if (active instanceof HTMLTextAreaElement && tableRef.current?.contains(active)) focusAfter.current = nextSel.focus;
    setGrid(next);
    setSel(nextSel);
    if (!keepMulti) setMulti(false);
  }
  /** 지운 뒤에 고를 셀 — 지운 자리에 온 셀 (끝이었으면 마지막 셀) */
  const near = (g: TableGrid, r: number, c: number) => single(cellAt(g, Math.min(r, g.rows - 1), Math.min(c, g.cols - 1))!);

  const addRow = (below: boolean) => update(insertRow(grid, below ? rect.r1 + 1 : rect.r0, below ? rect.r1 : rect.r0));
  const addCol = (right: boolean) => update(insertCol(grid, right ? rect.c1 + 1 : rect.c0, right ? rect.c1 : rect.c0));
  function removeRows() {
    const next = deleteRows(grid, rect.r0, rect.r1);
    update(next, near(next, rect.r0, rect.c0));
  }
  function removeCols() {
    const next = deleteCols(grid, rect.c0, rect.c1);
    update(next, near(next, rect.r0, rect.c0));
  }
  const merge = () => update(mergeCells(grid, rect), single(chosen[0]));
  const split = () => update(splitCells(grid, picked), single(chosen[0]));
  const alignTo = (al: NoteAlign) => update(setAlign(grid, picked, al), sel, true);
  const toggleHead = () => update(setHead(grid, picked, !allHead), sel, true);
  const selectAll = () => setSel({ anchor: home.id, focus: cellAt(grid, grid.rows - 1, grid.cols - 1)!.id });

  function toggleMulti() {
    if (!multi) {
      // 자판을 닫는다 — 이제 셀을 누르면 글을 치지 않고 고른다. 지금 셀이 첫 귀퉁이다
      const active = document.activeElement;
      if (active instanceof HTMLElement && tableRef.current?.contains(active)) active.blur();
      setSel((s) => ({ anchor: s.focus, focus: s.focus }));
    }
    setMulti((m) => !m);
  }

  /** PC — 끌어서 여러 셀 고르기. 셀 안에서 끄는 동안은 글자를 고르고, 다른 셀로 넘어가면 셀을 고른다 */
  function startDrag(from: number) {
    stopDrag.current?.();
    const move = (ev: PointerEvent) => {
      const hit = document.elementFromPoint(ev.clientX, ev.clientY);
      const td = hit instanceof Element ? hit.closest<HTMLElement>("[data-cell]") : null;
      if (!td || !tableRef.current?.contains(td)) return;
      const to = Number(td.dataset.cell);
      setSel((s) => (s.anchor === from && s.focus === to ? s : { anchor: from, focus: to }));
    };
    const stop = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", stop);
      document.removeEventListener("pointercancel", stop);
      stopDrag.current = null;
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", stop);
    document.addEventListener("pointercancel", stop);
    stopDrag.current = stop;
  }

  function onCellPointerDown(e: React.PointerEvent<HTMLTableCellElement>, x: GridCell) {
    if (multi || e.button !== 0 || e.pointerType !== "mouse") return; // 손가락은 글자 칸이 열릴 때(onFocus) · 여러 셀 고르기는 누를 때(onClick)
    if (e.shiftKey) {
      e.preventDefault();
      setSel((s) => ({ anchor: s.anchor, focus: x.id }));
      return;
    }
    setSel((s) => (s.anchor === x.id && s.focus === x.id ? s : single(x)));
    startDrag(x.id);
  }

  function onCellClick(e: React.MouseEvent<HTMLTableCellElement>, x: GridCell) {
    if (multi) {
      // 두 귀퉁이를 차례로 — 한 셀만 골라져 있으면 거기까지 넓히고, 이미 여러 셀이면 새로 시작한다
      setSel((s) => (s.anchor === s.focus ? { anchor: s.anchor, focus: x.id } : single(x)));
      return;
    }
    // 셀 테두리 안쪽(글자 칸 밖)을 눌러도 그 셀에 커서
    if (!e.shiftKey && e.target === e.currentTarget) e.currentTarget.querySelector("textarea")?.focus();
  }

  function apply() {
    onApply(fromGrid({ ...grid, cells: grid.cells.map((x) => ({ ...x, text: cleanCellText(x.text).trim() })) }));
  }

  const where =
    chosen.length === 1
      ? `${rect.r0 + 1}번째 줄 · ${rect.c0 + 1}번째 칸${span.rows > 1 || span.cols > 1 ? ` (합친 셀 ${span.rows}줄 × ${span.cols}칸)` : ""}`
      : `셀 ${chosen.length}개 · ${span.rows}줄 × ${span.cols}칸`;

  return (
    <>
      {/* PC 에서는 표가 길어도 도구가 위에 붙어 있다. 휴대폰은 도구가 화면의 반을 덮어 붙이지 않는다 */}
      <div className="space-y-2 bg-paper sm:sticky sm:top-0 sm:z-10 sm:pb-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Group label="줄">
            <Tool label="위에 줄 넣기" onUse={() => addRow(false)} disabled={grid.rows >= TABLE_MAX_ROWS} wide>
              + 위
            </Tool>
            <Tool label="아래에 줄 넣기" onUse={() => addRow(true)} disabled={grid.rows >= TABLE_MAX_ROWS} wide>
              + 아래
            </Tool>
            <Tool label="고른 줄 지우기" onUse={removeRows} disabled={span.rows >= grid.rows} wide>
              지우기
            </Tool>
          </Group>
          <Group label="칸">
            <Tool label="왼쪽에 칸 넣기" onUse={() => addCol(false)} disabled={grid.cols >= TABLE_MAX_COLS} wide>
              + 왼쪽
            </Tool>
            <Tool label="오른쪽에 칸 넣기" onUse={() => addCol(true)} disabled={grid.cols >= TABLE_MAX_COLS} wide>
              + 오른쪽
            </Tool>
            <Tool label="고른 칸 지우기" onUse={removeCols} disabled={span.cols >= grid.cols} wide>
              지우기
            </Tool>
          </Group>
          <Group label="셀">
            <Tool label="고른 셀 합치기" onUse={merge} disabled={chosen.length < 2} wide>
              합치기
            </Tool>
            <Tool label="합친 셀 나누기" onUse={split} disabled={!anyMerged} wide>
              나누기
            </Tool>
            <Tool label="제목 셀 (분홍 바탕 · 굵게)" on={allHead} onUse={toggleHead} wide>
              제목 셀
            </Tool>
          </Group>
          <Group label="정렬">
            {NOTE_ALIGNS.map((al) => (
              <Tool key={al} label={NOTE_ALIGN_LABEL[al]} on={alignOn(al)} onUse={() => alignTo(al)}>
                <AlignGlyph align={al} />
              </Tool>
            ))}
          </Group>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs">
          <span className="font-bold text-brand-700">고른 셀</span>
          <span className="text-slate tabular-nums">{where}</span>
          <span className="ml-auto flex gap-1.5">
            <Tool label="여러 셀 고르기 — 두 귀퉁이 셀을 차례로 누르기" on={multi} onUse={toggleMulti} wide>
              여러 셀 고르기
            </Tool>
            <Tool label="표 전체 고르기" onUse={selectAll} wide>
              전체 고르기
            </Tool>
          </span>
        </div>
      </div>

      <div className="mt-2 max-w-full overflow-x-auto">
        <table ref={tableRef} className="w-full border-collapse text-left">
          <tbody>
            {gridRows(grid).map((row, i) => (
              <tr key={i}>
                {row.map((x) => (
                  <td
                    key={x.id}
                    data-cell={x.id}
                    rowSpan={x.rs > 1 ? x.rs : undefined}
                    colSpan={x.cs > 1 ? x.cs : undefined}
                    onPointerDown={(e) => onCellPointerDown(e, x)}
                    onMouseDown={(e) => {
                      // Shift+클릭은 커서를 옮기지 않고 고른 셀만 넓힌다
                      if (e.shiftKey && !multi) e.preventDefault();
                    }}
                    onClick={(e) => onCellClick(e, x)}
                    className={cn(
                      "border border-slate-300 p-1 align-top",
                      picked.has(x.id) ? "bg-brand-100 outline outline-2 -outline-offset-2 outline-brand-500" : x.head && "bg-brand-50",
                      multi && "cursor-pointer",
                    )}
                  >
                    <textarea
                      value={x.text}
                      readOnly={multi}
                      onChange={(e) => {
                        const v = e.currentTarget.value;
                        setGrid((g) => setText(g, x.id, v));
                      }}
                      onFocus={() => {
                        if (!multi) setSel((s) => (s.anchor === x.id && s.focus === x.id ? s : single(x)));
                      }}
                      rows={Math.min(8, Math.max(1, x.text.split("\n").length))}
                      aria-label={`${x.r + 1}번째 줄 ${x.c + 1}번째 칸${x.head ? " (제목 셀)" : ""}`}
                      className={cn(
                        "block w-full min-w-20 resize-none rounded-md border border-transparent bg-transparent px-1.5 py-1 text-base leading-snug text-ink outline-none [field-sizing:content] focus:border-brand-300 focus:bg-white sm:text-sm",
                        x.align === "center" && "text-center",
                        x.align === "right" && "text-right",
                        x.head && "font-bold",
                        multi && "pointer-events-none",
                      )}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-mist">
        {multi
          ? "두 귀퉁이 셀을 차례로 누르면 그 사이가 모두 골라져요. 글자를 고치려면 ‘여러 셀 고르기’를 다시 눌러 끄세요."
          : "셀 안에서 Enter 로 줄을 바꿔요. 여러 셀은 끌거나 Shift+클릭으로 고르고, 휴대폰은 ‘여러 셀 고르기’를 켜고 두 귀퉁이를 차례로 누르세요."}
      </p>
      <Footer ok={isNew ? "표 넣기" : "적용"} onOk={apply} onCancel={onCancel} />
    </>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex items-center gap-1">
      <span aria-hidden className="mr-0.5 text-[11px] font-bold text-slate">
        {label}
      </span>
      {children}
    </div>
  );
}

function Footer({ ok, onOk, onCancel }: { ok: string; onOk: () => void; onCancel: () => void }) {
  return (
    <div className="mt-4 flex justify-end gap-2">
      <button type="button" onClick={onCancel} className="btn-secondary !py-2 text-sm">
        취소
      </button>
      <button type="button" onClick={onOk} className="btn-primary !py-2 text-sm">
        {ok}
      </button>
    </div>
  );
}
