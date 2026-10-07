import { TABLE_MAX_COLS, TABLE_MAX_ROWS, cleanCellText, type NoteCell, type NoteCellAlign, type NoteTable } from "./note-format";

/**
 * 붙여 넣은 HTML 속 표 → 안내 글의 표 (2026-10-07 Alan — "수업자료실에서 안내사항에 이런표도 넣고싶어.
 * 근데 다른 블로그에서 복사 붙여넣기로 했을때 표를 그대로 가져오는게 가능할까?").
 *
 * - 클립보드의 `text/html` 에 `<table>` 이 있을 때만 쓴다 — 없으면 예전처럼 글자만 붙여 넣는다 (`NoteEditor`).
 * - **가져오는 것**: 줄 · 칸 · 합친 칸(rowspan · colspan) · 칸 정렬(가운데 · 오른쪽) · 머리칸(th · thead) · 칸 안 줄바꿈.
 *   **가져오지 않는 것**: 색 · 굵기 · 글꼴 · 칸 너비 · 테두리 모양 · 그림 — 글자 붙여 넣기와 같은 규칙이다(다른 곳의 모양이 딸려 오지 않게).
 * - 표 앞뒤에 함께 고른 글은 글자로 따로 들어간다 (줄은 화면에 보이던 대로 — 문단 · `<br>` 마다 한 줄, 빈 문단은 빈 줄).
 * - 네이버 블로그(SmartEditor ONE — 정렬이 칸이 아니라 문단 class `…-align-center` 에 있다) · 티스토리 · 워드 · 엑셀 · 구글 문서 · 한글의 표를 받는다.
 *   정렬은 칸 안 첫 글자에서 칸까지 올라가며 가장 가까운 것(`align` · `text-align` · `…align-center` class)이다 — CSS 상속과 같은 순서.
 * - 줄 · 칸이 상한(`TABLE_MAX_ROWS` · `TABLE_MAX_COLS`)을 넘으면 잘라 넣고 `truncated` 로 알린다.
 * - **HTML 을 그대로 넣지 않는다** — 글자와 숫자 몇 개만 꺼내 `note-format.ts` 의 표로 만든다. `DOMParser` 문서는 스크립트가 돌지 않고 그림도 받지 않는다.
 * - 브라우저 밖(테스트)에서도 돌도록 DOM 의 기본 칸(nodeType · nodeName · childNodes · getAttribute)만 쓴다.
 */

export type PastePart = { kind: "text"; text: string } | { kind: "table"; table: NoteTable };
export type PastedTables = { parts: PastePart[]; truncated: boolean };

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

/** 읽지 않는 것 — 보이지 않거나 글이 아닌 것 */
const SKIP = new Set(["SCRIPT", "STYLE", "TEMPLATE", "NOSCRIPT", "HEAD", "TITLE", "META", "LINK", "IFRAME", "OBJECT", "EMBED", "SVG", "MATH", "IMG", "PICTURE", "VIDEO", "AUDIO", "CANVAS", "INPUT", "SELECT", "TEXTAREA", "BUTTON"]);
/** 한 줄을 차지하는 것 — 앞뒤로 줄이 바뀐다 */
const BLOCK = new Set([
  "ADDRESS", "ARTICLE", "ASIDE", "BLOCKQUOTE", "CAPTION", "CENTER", "DD", "DETAILS", "DIALOG", "DIV", "DL", "DT", "FIELDSET", "FIGCAPTION", "FIGURE",
  "FOOTER", "FORM", "H1", "H2", "H3", "H4", "H5", "H6", "HEADER", "HGROUP", "HR", "LI", "MAIN", "NAV", "OL", "P", "PRE", "SECTION", "SUMMARY", "TR", "UL",
]);
/** 정렬을 볼 덩어리 — 글자 묶음(span · b …)의 text-align 은 화면에 아무 일도 하지 않는다 */
const ALIGNABLE = new Set(["P", "DIV", "TD", "TH", "TR", "LI", "H1", "H2", "H3", "H4", "H5", "H6", "CENTER", "BLOCKQUOTE", "SECTION", "ARTICLE"]);
/** 화면 낭독기용으로 숨겨 둔 글 (네이버 `blind` · `se-blind` · 다음 `screen_out` …) */
const HIDDEN_CLASS = /(?:^|\s)(?:[\w-]*[-_])?(?:blind|sr-only|screen_out|visually-hidden|a11y-hidden)(?:\s|$)/;
/** 폭 없는 글자 — 네이버는 빈 문단에 U+200B 를 넣는다. 글 속 덩어리 글자(U+FFFC)도 뺀다 */
const INVISIBLE = /[\u200B\u200C\u200D\u2060\uFEFF\uFFFC]/g;

const tagOf = (n: Node) => n.nodeName.toUpperCase();
const attr = (el: Element, name: string) => el.getAttribute(name) ?? "";
const isElement = (n: Node): n is Element => n.nodeType === ELEMENT_NODE;

function isHidden(el: Element): boolean {
  if (el.hasAttribute("hidden")) return true;
  if (/(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(attr(el, "style"))) return true;
  return HIDDEN_CLASS.test(attr(el, "class"));
}

/** 이 덩어리 안은 빈칸 · 줄바꿈을 적힌 그대로 (`<pre>` · `white-space: pre…`) */
const keepsSpaces = (el: Element) => tagOf(el) === "PRE" || /white-space\s*:\s*(?:pre|break-spaces)/i.test(attr(el, "style"));

/** 화면에 보이는 줄을 모은다 — `cur` 가 지금 줄 */
class Lines {
  lines: string[] = [];
  cur = "";
  get has() {
    return this.cur.replace(INVISIBLE, "").trim() !== "";
  }
  text(t: string) {
    this.cur += t;
  }
  /** `<br>` — 빈 줄이어도 한 줄 */
  newline() {
    this.lines.push(this.cur);
    this.cur = "";
  }
  /** 덩어리의 앞뒤 — 쓰던 줄이 있을 때만 끊는다 (빈칸만 남은 줄은 버린다) */
  block() {
    if (this.has) this.newline();
    else this.cur = "";
  }
  emptyLine() {
    this.lines.push("");
  }
  take(): string[] {
    this.block();
    const out = this.lines;
    this.lines = [];
    return out;
  }
}

/** 모은 줄 → 글. 줄마다 겹친 빈칸을 하나로 · 앞뒤 빈칸을 걷고, 앞뒤 빈 줄을 뺀다 */
function finishText(lines: string[]): string {
  const out = lines.map((l) => l.replace(INVISIBLE, "").replace(/ {2,}/g, " ").trim().replace(/\u00A0/g, " "));
  while (out.length && !out[0]) out.shift();
  while (out.length && !out[out.length - 1]) out.pop();
  return out.join("\n");
}

function tableRows(table: Element): Element[] {
  const rows: Element[] = [];
  for (const c of Array.from(table.children)) {
    const t = tagOf(c);
    if (t === "TR") rows.push(c);
    else if (t === "THEAD" || t === "TBODY" || t === "TFOOT") for (const r of Array.from(c.children)) if (tagOf(r) === "TR") rows.push(r);
  }
  return rows;
}
const cellsOf = (tr: Element) => Array.from(tr.children).filter((c) => tagOf(c) === "TD" || tagOf(c) === "TH");

/**
 * 글을 훑는다. `onTable` 이 있으면(맨 바깥) 표를 만나면 넘기고(받았으면 true), 없거나 못 받은 표(칸 속 표 · 칸 없는 표)는 글로 편다 —
 * 줄마다 한 줄, 칸 사이는 빈칸. `pre` 는 빈칸 · 줄바꿈을 적힌 그대로 읽을 때
 */
function walk(node: Node, out: Lines, onTable?: (el: Element) => boolean, pre = false) {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === TEXT_NODE) {
      const data = (child as Text).data;
      if (!pre) out.text(data.replace(/[\t\n\r\f ]+/g, " "));
      else
        data.split(/\r\n?|\n/).forEach((part, k) => {
          if (k > 0) out.newline();
          out.text(part);
        });
      continue;
    }
    if (!isElement(child)) continue;
    const tag = tagOf(child);
    if (SKIP.has(tag) || isHidden(child)) continue;
    if (tag === "BR") {
      out.newline();
      continue;
    }
    if (tag === "TABLE") {
      if (onTable?.(child)) continue;
      out.block();
      for (const tr of tableRows(child)) {
        cellsOf(tr).forEach((td, k) => {
          if (k > 0) out.text(" ");
          walk(td, out, undefined, pre);
        });
        out.block();
      }
      continue;
    }
    const inPre = pre || keepsSpaces(child);
    if (BLOCK.has(tag)) {
      out.block();
      const before = out.lines.length;
      walk(child, out, onTable, inPre);
      // 빈 문단(네이버 U+200B · 워드 &nbsp;)은 빈 줄 — 쓴 사람이 띄운 줄이다
      if (tag === "P" && !out.has && out.lines.length === before) out.emptyLine();
      out.block();
      continue;
    }
    walk(child, out, onTable, inPre);
  }
}

/** 칸 안의 글 — 줄은 화면에 보이던 대로 */
function cellText(td: Element): string {
  const out = new Lines();
  walk(td, out, undefined, keepsSpaces(td));
  return cleanCellText(finishText(out.take()));
}

/** 정렬 정보 — 가운데 · 오른쪽, 왼쪽이라고 적혀 있으면 undefined, 아무 말이 없으면 null */
function alignInfo(el: Element): NoteCellAlign | undefined | null {
  const tag = tagOf(el);
  if (!ALIGNABLE.has(tag)) return null;
  if (tag === "CENTER") return "center";
  const style = /(?:^|;)\s*text-align\s*:\s*(?:-webkit-|-moz-)?([a-z]+)/i.exec(attr(el, "style"))?.[1];
  const cls = /(?:^|[\s_-])(?:align|text)[-_](center|right|left|justify)(?![\w-])/i.exec(attr(el, "class"))?.[1];
  const v = (attr(el, "align") || style || cls || "").toLowerCase();
  if (v === "center") return "center";
  if (v === "right" || v === "end") return "right";
  if (v === "left" || v === "start" || v === "justify") return undefined;
  return null;
}

/** 칸 안에서 글자가 처음 나오는 곳 — 그 글자를 품은 요소 */
function firstTextElement(el: Element): Element | null {
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === TEXT_NODE) {
      if ((child as Text).data.replace(INVISIBLE, "").trim()) return el;
    } else if (isElement(child) && !SKIP.has(tagOf(child)) && !isHidden(child)) {
      const found = firstTextElement(child);
      if (found) return found;
    }
  }
  return null;
}

/** 칸 정렬 — 첫 글자에서 칸 · 줄(tr)까지 올라가며 가장 가까운 정렬 (CSS 상속과 같은 순서) */
function alignOf(td: Element): NoteCellAlign | undefined {
  for (let el: Element | null = firstTextElement(td) ?? td; el; el = el.parentElement) {
    const info = alignInfo(el);
    if (info !== null) return info;
    if (tagOf(el) === "TR" || tagOf(el) === "TABLE") break;
  }
  return undefined;
}

/** rowspan · colspan — 숫자가 아니면 1. rowspan 0 은 "끝까지"(HTML 과 같다) */
function spanOf(el: Element, name: "rowspan" | "colspan"): number {
  const n = Number.parseInt(attr(el, name), 10);
  if (!Number.isFinite(n) || n < 0) return 1;
  if (n === 0) return name === "rowspan" ? 0 : 1;
  return Math.min(n, name === "rowspan" ? TABLE_MAX_ROWS : TABLE_MAX_COLS);
}

/** HTML 표 하나 → 표. 칸이 하나도 없으면 null */
function tableFrom(el: Element): { table: NoteTable; truncated: boolean } | null {
  let trs = tableRows(el);
  let truncated = false;
  if (trs.length > TABLE_MAX_ROWS) {
    trs = trs.slice(0, TABLE_MAX_ROWS);
    truncated = true;
  }
  const rows: NoteCell[][] = [];
  // 위 줄에서 합쳐 내려온 칸이 몇 줄 더 차지하나 (칸 번호마다) — 이 줄의 칸이 몇째 칸에서 시작하는지 세려고
  const taken: number[] = [];
  trs.forEach((tr, r) => {
    const row: NoteCell[] = [];
    let c = 0;
    for (const td of cellsOf(tr)) {
      while ((taken[c] ?? 0) > 0) c++;
      if (c >= TABLE_MAX_COLS) {
        truncated = true;
        break;
      }
      let colspan = spanOf(td, "colspan");
      if (c + colspan > TABLE_MAX_COLS) {
        colspan = TABLE_MAX_COLS - c;
        truncated = true;
      }
      let rowspan = spanOf(td, "rowspan");
      if (rowspan === 0 || r + rowspan > trs.length) rowspan = trs.length - r;
      const cell: NoteCell = { text: cellText(td) };
      if (rowspan > 1) cell.rowspan = rowspan;
      if (colspan > 1) cell.colspan = colspan;
      const align = alignOf(td);
      if (align) cell.align = align;
      if (tagOf(td) === "TH" || (tr.parentElement && tagOf(tr.parentElement) === "THEAD")) cell.head = true;
      row.push(cell);
      for (let k = 0; k < colspan; k++) taken[c + k] = rowspan;
      c += colspan;
    }
    for (let k = 0; k < taken.length; k++) if ((taken[k] ?? 0) > 0) taken[k]--;
    rows.push(row);
  });
  // 끝의 칸 없는 줄은 뺀다 (합친 칸이 덮은 줄은 HTML 에서도 칸이 없다 — 가운데 줄은 그대로 둔다)
  while (rows.length && rows[rows.length - 1].length === 0) rows.pop();
  return rows.some((r) => r.length > 0) ? { table: { rows }, truncated } : null;
}

const parseHtml = (html: string) => new DOMParser().parseFromString(html, "text/html");

/**
 * 클립보드 HTML → 글 · 표 조각. 표가 없거나(읽을 칸이 없으면) null — 그때는 예전처럼 `text/plain` 을 붙여 넣는다.
 * `parse` 는 테스트가 브라우저 밖의 파서를 넣을 때만
 */
export function pasteParts(html: string, parse: (html: string) => Document = parseHtml): PastedTables | null {
  if (!/<table[\s>]/i.test(html)) return null;
  const doc = parse(html);
  const root = doc.body ?? doc.documentElement;
  if (!root) return null;
  const parts: PastePart[] = [];
  let truncated = false;
  const out = new Lines();
  const flush = () => {
    const text = finishText(out.take());
    if (text) parts.push({ kind: "text", text });
  };
  walk(root, out, (el) => {
    const t = tableFrom(el);
    if (!t) return false;
    flush();
    parts.push({ kind: "table", table: t.table });
    truncated ||= t.truncated;
    return true;
  });
  flush();
  return parts.some((p) => p.kind === "table") ? { parts, truncated } : null;
}
