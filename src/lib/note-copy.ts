import { tableToNote, type NoteCell, type NoteTable } from "./note-format";
import { slotMap, toGrid } from "./table-grid";

/**
 * 표 복사 (2026-10-19 Alan — "해당 표를 복사하려고해도 복사가 안돼") — 편집기가 클립보드에 함께 싣는 두 가지.
 *
 * - `html`: 보통 HTML 표 — 합친 칸 · 칸 정렬 · 머리칸 · 칸 안 줄바꿈(`<br>`), 테두리 · 여백은 인라인 style. 우리 편집기 · 워드 · 한글 · 구글 문서 · 엑셀에 표로 붙는다.
 *   `data-note-table` 에 저장 모양(`[table]…[/table]`)을 실어 둬서 우리 편집기에 다시 붙이면 빈칸 한 칸까지 그대로 돌아온다 (`note-paste.ts` 가 먼저 읽는다).
 *   색은 회색만 쓴다 — 학생 · 관리자 화면의 브랜드색은 클립보드에 실어 갈 까닭이 없다.
 * - `text`: 칸은 탭 · 줄은 줄바꿈 (엑셀 · 구글 시트가 싣는 꼴) — 표를 못 받는 곳(카카오톡 · 메모장)에 붙일 때.
 *   합친 칸은 왼쪽 위 자리에만 글자를 두고, 탭 · 줄바꿈 · 따옴표가 든 칸은 따옴표로 감싼다 (엑셀이 다시 읽는 규칙).
 */
export function tableClipboard(t: NoteTable): { html: string; text: string } {
  const rows = t.rows.map((row) => `<tr>${row.map(cellHtml).join("")}</tr>`).join("");
  const html = `<table data-note-table="${escapeHtml(tableToNote(t))}" style="border-collapse:collapse"><tbody>${rows}</tbody></table>`;
  const text = slotMap(toGrid(t))
    .map((row, r) => row.map((x, c) => (x && x.r === r && x.c === c ? tsvCell(x.text) : "")).join("\t"))
    .join("\n");
  return { html, text };
}

// pre-wrap — 편집기 · 학생 화면의 칸처럼 칸 안 빈칸을 그대로 보인다
const CELL_STYLE = "border:1px solid #cbd5e1;padding:6px 10px;vertical-align:middle;white-space:pre-wrap";
const HEAD_STYLE = "background:#f1f5f9;font-weight:bold";

function cellHtml(c: NoteCell): string {
  const tag = c.head ? "th" : "td";
  const span = (c.rowspan && c.rowspan > 1 ? ` rowspan="${c.rowspan}"` : "") + (c.colspan && c.colspan > 1 ? ` colspan="${c.colspan}"` : "");
  const style = [CELL_STYLE, c.head && HEAD_STYLE, c.align && `text-align:${c.align}`].filter(Boolean).join(";");
  // 빈 셀은 <br> 하나 — 붙여 넣은 곳에서도 한 줄 높이를 지킨다 (편집기 칸과 같은 규칙)
  const body = c.text === "" ? "<br>" : c.text.split("\n").map(escapeHtml).join("<br>");
  return `<${tag}${span} style="${style}">${body}</${tag}>`;
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const tsvCell = (s: string) => (/[\t\n"]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
