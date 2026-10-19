import { cellRuns, tableToNote, type NoteCell, type NoteColor, type NoteRun, type NoteSize, type NoteTable } from "./note-format";
import { slotMap, toGrid } from "./table-grid";

/**
 * 표 복사 (2026-10-19 Alan — "해당 표를 복사하려고해도 복사가 안돼") — 편집기가 클립보드에 함께 싣는 두 가지.
 *
 * - `html`: 보통 HTML 표 — 합친 칸 · 칸 정렬 · 머리칸 · 칸 안 줄바꿈(`<br>`), 테두리 · 여백은 인라인 style. 우리 편집기 · 워드 · 한글 · 구글 문서 · 엑셀에 표로 붙는다.
 *   칸 글자 서식(2026-10-19 — 정답 굵게)은 `<b>` · `<i>` · `<u>` 와 색 · 형광펜 · 크기 인라인 style 로 싣는다 (워드 · 한글에도 굵게가 따라간다).
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
  const body = c.text === "" ? "<br>" : cellRuns(c).map(runHtml).join("");
  return `<${tag}${span} style="${style}">${body}</${tag}>`;
}

/** 클립보드에 싣는 글자 색 · 크기 — 학생 화면(학생 모드)의 값 그대로. 관리자 모드의 파랑은 화면 모양일 뿐이라 싣지 않는다 */
const CLIP_COLOR: Record<NoteColor, string> = { pink: "#e61e75", red: "#dc2626", blue: "#2563eb", green: "#059669", gray: "#64748b" };
const CLIP_SIZE: Record<NoteSize, string> = { sm: "12px", lg: "18px", xl: "20px" };

/** 칸 글자 조각 하나 — 굵게 · 기울임 · 밑줄은 태그, 색 · 형광펜 · 크기는 span style (어느 프로그램이나 읽는 꼴) */
function runHtml(r: NoteRun): string {
  let out = r.text.split("\n").map(escapeHtml).join("<br>");
  const s = r.style;
  const css = [s.color && `color:${CLIP_COLOR[s.color]}`, s.mark && "background-color:#fef08a", s.size && `font-size:${CLIP_SIZE[s.size]}`].filter(Boolean).join(";");
  if (css) out = `<span style="${css}">${out}</span>`;
  if (s.underline) out = `<u>${out}</u>`;
  if (s.italic) out = `<i>${out}</i>`;
  if (s.bold) out = `<b>${out}</b>`;
  return out;
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const tsvCell = (s: string) => (/[\t\n"]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
