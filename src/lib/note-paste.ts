import {
  TABLE_MAX_COLS,
  TABLE_MAX_ROWS,
  asNoteTable,
  cellWithRuns,
  cleanCellText,
  normalizeRuns,
  parseTableBody,
  runsText,
  textStyle,
  type NoteCell,
  type NoteCellAlign,
  type NoteRun,
  type NoteStyle,
  type NoteTable,
} from "./note-format";

/**
 * 붙여 넣은 HTML → 안내 글의 표 · 서식 있는 글 (2026-10-07 Alan — "수업자료실에서 안내사항에 이런표도 넣고싶어.
 * 근데 다른 블로그에서 복사 붙여넣기로 했을때 표를 그대로 가져오는게 가능할까?" → 2026-10-20 "네이버 올렸던 글을 복사해서 홈피에 붙이기를 하면
 * 굵은 부분이 다 사라지고 없어요. 혹시 굵은 볼드체도 그대로 똑같이 옮겨질순없나요?? 이거 답체크 하는데 시간이 꽤 걸리네요").
 *
 * - 클립보드의 `text/html` 에 **표나 굵게 · 기울임 · 밑줄**이 있을 때만 쓴다 — 없으면 예전처럼 `text/plain` 글자만 붙여 넣는다 (`NoteEditor`).
 * - **표에서 가져오는 것**: 줄 · 칸 · 합친 칸(rowspan · colspan) · 칸 정렬(가운데 · 오른쪽) · 머리칸(th · thead) · 칸 안 줄바꿈 · 칸 글자의 굵게 · 기울임 · 밑줄.
 *   **가져오지 않는 것**: 색 · 글꼴 · 크기 · 칸 너비 · 테두리 모양 · 그림 — 다른 곳의 모양이 딸려 오지 않게 (우리 편집기의 색은 다섯 가지뿐이라 맞춰 바꾸지 않는다).
 * - **글자 서식**(2026-10-20): 굵게 · 기울임 · 밑줄을 태그(`b` · `strong` · `h1`~`h6` / `i` · `em` / `u` · `ins`)와 인라인 style(`font-weight` · `font-style` ·
 *   `text-decoration`)로 읽는다 — 브라우저가 그리는 순서(조상 → 자식, 요소의 style 이 태그 기본값을 이긴다)대로. 그래서 구글 문서가 전체를 감싸는
 *   `<b style="font-weight:normal">` 는 굵게가 아니고, 크롬이 복사할 때 붙이는 `font-weight: 400` · `700` 도 맞게 읽힌다. 밑줄은 조상의 밑줄을 자식이 지우지 못한다(CSS 와 같다).
 *   링크(`a`) 자신의 밑줄은 빼고(링크로 들어오지 않는다), 머리칸 글자의 굵게는 뺀다(머리칸이 이미 굵다 — 제목 셀을 풀면 보통 글자가 되게).
 *   **우리 편집기에서 복사한 글**은 조각마다 단 `data-note`(서식 JSON)를 읽어 색 · 크기 · 형광펜까지 그대로다 (`textStyle` — 아는 값만).
 * - **워드 · 엑셀 · 한글 · 맥**(2026-10-20 Alan — "혹시 워드에서 복사할때도 진하게 설정이 같이 복사되면 좋겠어"): 크롬은 워드가 클립보드에 넣은 HTML 을 머리(`<style>`)까지 통째로 준다.
 *   ① `<style>` 의 굵게 · 기울임(`font-weight` · `font-style` · `font`)을 그 요소에 얹는다(`applySheet` — 인라인 style 보다 앞, 태그 기본값보다 뒤 · CSS 와 같은 순서) —
 *   워드의 글자 스타일(`span.a {font-weight:bold}` — 내가 만든 '정답' 스타일 · 책 제목 …) · 제목(`h1 {font-weight:normal}` — 워드 제목 1 은 굵지 않다) ·
 *   엑셀 칸(`.xl65 {font-weight:700}`) · 맥(RTF 를 바꾼 `span.s1 {font-weight: bold}`)이 여기에 있다. 단순한 선택자만 읽고(`p` · `.xl65` · `span.a` · `p.MsoNormal, li.MsoNormal`)
 *   시트의 밑줄은 읽지 않는다(거의 링크 꾸밈 `span.MsoHyperlink` 이다). ② 워드 목록 기호(`mso-list:Ignore` — 기호 글꼴 Symbol · Wingdings 로 그린 `·` · `ü` …)는
 *   보이는 모양의 글자(• · ✓ …)와 탭으로, 워드 탭(`mso-tab-count`)은 탭으로 읽는다. `<b style='mso-bidi-font-weight:normal'>` 의 `mso-…` 는 읽지 않는다(굵게 그대로).
 * - 표 앞뒤에 함께 고른 글은 글자로 따로 들어간다 (줄은 화면에 보이던 대로 — 문단 · `<br>` 마다 한 줄, 빈 문단은 빈 줄). 줄 정렬은 가져오지 않는다.
 * - 네이버 블로그(SmartEditor ONE — 정렬이 칸이 아니라 문단 class `…-align-center` 에 있다) · 티스토리 · 워드 · 엑셀 · 구글 문서 · 한글의 표를 받는다.
 *   정렬은 칸 안 첫 글자에서 칸까지 올라가며 가장 가까운 것(`align` · `text-align` · `…align-center` class)이다 — CSS 상속과 같은 순서.
 * - 줄 · 칸이 상한(`TABLE_MAX_ROWS` · `TABLE_MAX_COLS`)을 넘으면 잘라 넣고 `truncated` 로 알린다.
 * - **HTML 을 그대로 넣지 않는다** — 글자와 숫자 몇 개만 꺼내 `note-format.ts` 의 표로 만든다. `DOMParser` 문서는 스크립트가 돌지 않고 그림도 받지 않는다.
 * - 브라우저 밖(테스트)에서도 돌도록 DOM 의 기본 칸(nodeType · nodeName · childNodes · getAttribute)만 쓴다.
 * - **우리 편집기에서 복사한 표**는 `<table data-note-table="[table]…[/table]">` 를 먼저 읽는다 (2026-10-19 — 표 복사 · 잘라내기 · 끌어 놓기,
 *   `note-copy.ts` · 편집기 칸). 칸 안 빈칸 · 합친 칸까지 그대로 돌아온다. 못 읽는 값이거나 화면의 표와 꼴이 다르면(표의 몇 칸만 골라 복사) 화면에 보이는 대로 읽는다.
 */

/** 붙여 넣을 조각 — 글(서식이 있으면 `runs`, 이은 글자가 늘 `text`) 또는 표 */
export type PastePart = { kind: "text"; text: string; runs?: NoteRun[] } | { kind: "table"; table: NoteTable };
export type Pasted = { parts: PastePart[]; truncated: boolean };

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
/** 한 글자씩 볼 때 — 빈칸 · 줄바꿈 · 폭 없는 글자 (`text/plain` 과 맞출 때 건너뛴다) */
const isGap = (ch: string) => /\s/.test(ch) || /[\u200B\u200C\u200D\u2060\uFEFF\uFFFC]/.test(ch);

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

/* ── 글자 서식 (2026-10-20) ── */

/** 기본으로 굵은 · 기운 · 밑줄 그은 태그 (브라우저 기본 스타일과 같다 — 링크의 밑줄은 뺀다) */
const BOLD_TAGS = new Set(["B", "STRONG", "H1", "H2", "H3", "H4", "H5", "H6", "TH"]);
const ITALIC_TAGS = new Set(["I", "EM", "CITE", "DFN", "VAR"]);
const UNDERLINE_TAGS = new Set(["U", "INS"]);
/** 붙여 넣은 HTML 에 서식이 있을 수 있나 — 없으면 HTML 을 읽지 않고 예전처럼 글자만 (빠른 길) */
const MAY_STYLE = /<(?:table|b|strong|i|em|u|ins|h[1-6]|th|cite|dfn|var)[\s>]|font-weight|font-style|text-decoration|font\s*:|data-note/i;

/** 서식 값 — 켬 · 끔, 부모 것 그대로(`inherit`), 모름(undefined — 지금 값을 둔다) */
type Flag = boolean | "inherit" | undefined;
const resolve = (v: Flag, current: boolean, inherited: boolean) => (v === undefined ? current : v === "inherit" ? inherited : v);
/** CSS 공통 값 — 굵기 · 기울기는 물려받는 속성이라 `unset` 도 부모 것 */
const cssWide = (v: string): Flag => (v === "inherit" || v === "unset" ? "inherit" : v === "initial" ? false : undefined);

/** `font-weight` — 600 부터 굵게 (`bolder` 는 굵게, `lighter` 는 보통) */
function weightOf(v: string): Flag {
  if (v === "bold" || v === "bolder") return true;
  if (v === "normal" || v === "lighter") return false;
  const n = Number(v);
  if (v && Number.isFinite(n)) return n >= 600;
  return cssWide(v);
}
/** `font-style` */
function italicOf(v: string): Flag {
  if (/^(?:italic|oblique)\b/.test(v)) return true;
  if (v === "normal") return false;
  return cssWide(v);
}
/** `font` 줄임말 — 굵기 · 기울기를 적지 않으면 보통으로 되돌린다 (CSS 와 같다) */
function fontOf(v: string): { bold: Flag; italic: Flag } {
  const wide = cssWide(v);
  if (wide !== undefined || v === "revert" || v === "revert-layer") return { bold: wide, italic: wide };
  return { bold: /(?:^|\s)(?:bold|bolder|[6-9]00)(?:\s|$)/.test(v), italic: /(?:^|\s)(?:italic|oblique)(?:\s|$)/.test(v) };
}

/** 인라인 style 의 선언들 — 이름은 소문자, 값은 `!important` · 따옴표(한글 클립보드 `font-weight:"bold"`)를 뗀 소문자 */
function declarations(style: string): [string, string][] {
  const out: [string, string][] = [];
  for (const d of style.split(";")) {
    const i = d.indexOf(":");
    if (i < 0) continue;
    const name = d.slice(0, i).trim().toLowerCase();
    const value = d
      .slice(i + 1)
      .replace(/!\s*important\s*$/i, "")
      .replace(/["']/g, "")
      .trim()
      .toLowerCase();
    if (name) out.push([name, value]);
  }
  return out;
}

/**
 * 요소 안 글자의 서식 — `parent` 는 그 요소 바깥(부모)의 서식. 태그 기본값 → 인라인 style(적힌 순서) → 우리 편집기 `data-note` 순서로 덮는다.
 * 굵게 · 기울임은 물려받고(자식이 끌 수 있다), 밑줄은 조상 것을 자식이 지우지 못한다. 색 · 크기 · 형광펜은 `data-note` 에서만 온다
 */
function styleWithin(el: Element, parent: NoteStyle): NoteStyle {
  const tag = tagOf(el);
  let bold = BOLD_TAGS.has(tag) || !!parent.bold;
  let italic = ITALIC_TAGS.has(tag) || !!parent.italic;
  let underline = UNDERLINE_TAGS.has(tag);
  for (const [name, v] of declarations(attr(el, "style"))) {
    if (name === "font-weight") bold = resolve(weightOf(v), bold, !!parent.bold);
    else if (name === "font-style") italic = resolve(italicOf(v), italic, !!parent.italic);
    else if (name === "font") {
      const f = fontOf(v);
      bold = resolve(f.bold, bold, !!parent.bold);
      italic = resolve(f.italic, italic, !!parent.italic);
    } else if (name === "text-decoration" || name === "text-decoration-line") underline = /(?:^|\s)underline(?:\s|$)/.test(v);
  }
  // 링크 자신의 밑줄은 링크라서 그은 것 — 글자 서식이 아니다 (조상의 밑줄은 그대로 내려온다)
  if (tag === "A") underline = false;
  const out: NoteStyle = {};
  if (bold) out.bold = true;
  if (italic) out.italic = true;
  if (underline || parent.underline) out.underline = true;
  if (parent.mark) out.mark = true;
  if (parent.color) out.color = parent.color;
  if (parent.size) out.size = parent.size;
  const note = el.getAttribute("data-note");
  if (note) {
    try {
      Object.assign(out, textStyle(JSON.parse(note) as NoteStyle));
    } catch {
      // 깨진 값 — 서식 없이 글자만
    }
  }
  return out;
}

/* ── 스타일 시트 (2026-10-20 — 워드 · 엑셀 · 한글 · 맥) ── */

/** 시트에서 읽는 선언 — 굵게 · 기울임만 */
const SHEET_PROPS = new Set(["font-weight", "font-style", "font"]);
/** 단순한 선택자 — 태그 · 클래스(여럿)만. 자손(`td p`) · `a:link` · `[속성]` · `#id` 는 건너뛴다. 숫자로 시작하는 클래스(`span.1Char`)는 브라우저도 버린다 */
const SIMPLE_SELECTOR = /^([a-z][a-z0-9]*|\*)?((?:\.-?[_a-z\u00a0-\uffff][\w\u00a0-\uffff-]*)*)$/i;

type SheetRule = { tag: string; classes: string[]; spec: number; order: number; decls: string };

/** CSS 글 → (선택자, 선언) 묶음. 따옴표 안의 `{ } ;` 는 글자로 보고, `@font-face` · `@page` · `@list`(워드) · `@media` 는 통째로 건너뛴다 */
function cssBlocks(css: string): [string, string][] {
  const out: [string, string][] = [];
  let depth = 0;
  let quote = "";
  let start = 0;
  let prelude = "";
  let body = 0;
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = "";
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "{") {
      if (depth++ === 0) {
        prelude = css.slice(start, i).trim();
        body = i + 1;
      }
    } else if (ch === "}") {
      if (depth > 0 && --depth === 0) {
        if (!prelude.startsWith("@")) out.push([prelude, css.slice(body, i)]);
        start = i + 1;
      }
    } else if (ch === ";" && depth === 0) start = i + 1; // 블록 없는 @규칙 (`@import …;`)
  }
  return out;
}

/** 문서의 `<style>` 들 → 굵게 · 기울임을 정하는 규칙 (적힌 순서) */
function sheetRules(doc: Document): SheetRule[] {
  const rules: SheetRule[] = [];
  for (const el of Array.from(doc.getElementsByTagName("style"))) {
    // 워드 · 엑셀 · 한글은 시트를 `<!-- … -->` 로 감싸고 `/* Font Definitions */` 같은 주석을 단다
    const css = (el.textContent ?? "").replace(/<!--|-->/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
    for (const [prelude, body] of cssBlocks(css)) {
      const decls = declarations(body).filter(([name]) => SHEET_PROPS.has(name));
      if (!decls.length) continue;
      const text = decls.map(([name, value]) => `${name}:${value}`).join(";");
      for (const sel of prelude.split(",")) {
        const m = SIMPLE_SELECTOR.exec(sel.trim());
        if (!m || (!m[1] && !m[2])) continue;
        const tag = m[1] && m[1] !== "*" ? m[1].toUpperCase() : "";
        const classes = m[2] ? m[2].slice(1).toLowerCase().split(".") : [];
        // 구체성 — 클래스가 태그를 이긴다 (`.xl65` 가 `td` 를, `p.a` 가 `.a` 를)
        rules.push({ tag, classes, spec: classes.length * 2 + (tag ? 1 : 0), order: rules.length, decls: text });
      }
    }
  }
  return rules;
}

/**
 * 시트의 굵게 · 기울임을 맞는 요소의 style 앞에 적는다 — 그 뒤의 인라인 style 이 이기고(`declarations` 는 적힌 순서대로 덮는다),
 * 태그 기본값(`b` · `h1` …)은 그보다 먼저라 시트가 이긴다(워드 `h1 {font-weight:normal}`). 클래스는 대소문자를 가리지 않는다(문서형 없는 클립보드 HTML 은 브라우저도 그렇다)
 */
function applySheet(doc: Document) {
  const rules = sheetRules(doc);
  if (!rules.length) return;
  const byTag = new Map<string, SheetRule[]>();
  const byClass = new Map<string, SheetRule[]>();
  const any: SheetRule[] = [];
  for (const r of rules) {
    const [map, key] = r.classes.length ? [byClass, r.classes[0]] : r.tag ? [byTag, r.tag] : [null, ""];
    if (map) map.set(key, [...(map.get(key) ?? []), r]);
    else any.push(r);
  }
  for (const el of Array.from(doc.getElementsByTagName("*"))) {
    const tag = tagOf(el);
    const classes = [...new Set(attr(el, "class").toLowerCase().split(/\s+/).filter(Boolean))];
    const hits = [...any, ...(byTag.get(tag) ?? [])];
    for (const c of classes) for (const r of byClass.get(c) ?? []) if ((!r.tag || r.tag === tag) && r.classes.every((x) => classes.includes(x))) hits.push(r);
    if (!hits.length) continue;
    hits.sort((p, q) => p.spec - q.spec || p.order - q.order);
    el.setAttribute("style", `${hits.map((r) => r.decls).join(";")};${attr(el, "style")}`);
  }
}

/* ── 워드 목록 기호 · 탭 (2026-10-20) ── */

/** 워드 목록 기호 칸 — `<span style='mso-list:Ignore'>·<span style='font:7.0pt "Times New Roman"'>&nbsp;…</span></span>` (기호 · 번호 + 띄움) */
const LIST_MARKER = /(?:^|;)\s*mso-list\s*:\s*ignore/i;
/** 워드 탭 — `<span style='mso-tab-count:2'>&nbsp;…</span>` */
const TAB_COUNT = /(?:^|;)\s*mso-tab-count\s*:\s*(\d+)/i;
/** 글자 대신 그림을 그리는 기호 글꼴 */
const SYMBOL_FONT = /^(?:symbol|wingdings(?: [23])?|webdings)$/;
/** Wingdings 글자 → 보이는 모양 (워드 글머리 기호에 쓰는 것) — 모르는 글자는 • */
const WINGDINGS: Record<string, string> = { l: "●", n: "■", o: "□", q: "❑", u: "◆", v: "❖", "§": "▪", Ø: "➢", ü: "✓" };

/** 안의 글자 (숨긴 것 빼고) */
function textOf(node: Node): string {
  let s = "";
  for (const c of Array.from(node.childNodes)) {
    if (c.nodeType === TEXT_NODE) s += (c as Text).data;
    else if (isElement(c) && !SKIP.has(tagOf(c)) && !isHidden(c)) s += textOf(c);
  }
  return s;
}

/** 이 글자를 그리는 글꼴 — 요소에서 문단까지 올라가며 가장 가까운 `font-family` 의 첫 이름 (소문자) */
function fontFamilyOf(el: Element): string {
  for (let e: Element | null = el; e; e = e.parentElement) {
    const family = declarations(attr(e, "style"))
      .filter(([name]) => name === "font-family")
      .pop()?.[1];
    if (family) return family.split(",")[0].trim();
    if (BLOCK.has(tagOf(e))) break;
  }
  return "";
}

/** 목록 기호 글자 — 기호 글꼴 · 사용자 영역(U+F0xx — 기호 글꼴의 글자를 이렇게도 적는다)이면 보이는 모양으로, 번호(1. · 가. · ①)는 그대로 */
function markerChar(ch: string, font: string): string {
  const code = ch.codePointAt(0) ?? 0;
  const pua = code >= 0xf000 && code <= 0xf0ff;
  if (!pua && !SYMBOL_FONT.test(font)) return ch;
  if (font === "wingdings") return WINGDINGS[String.fromCodePoint(pua ? code - 0xf000 : code)] ?? "•";
  return "•";
}

/** 워드 목록 기호 — 띄움(&nbsp;)을 걷어 낸 기호 · 번호. 비었으면 "" */
function listMarker(el: Element): string {
  const text = textOf(el).replace(INVISIBLE, "").trim();
  if (!text) return "";
  const font = fontFamilyOf(el);
  return Array.from(text)
    .map((ch) => markerChar(ch, font))
    .join("");
}

/** 칸 안 글자의 서식 — 표 바깥의 서식(`base`)에서 표 · 줄 묶음 · 줄 · 칸 차례로 (CSS 상속과 같은 순서) */
function cellStyle(td: Element, table: Element, base: NoteStyle): NoteStyle {
  const chain: Element[] = [];
  for (let el: Element | null = td; el; el = el.parentElement) {
    chain.push(el);
    if (el === table) break;
  }
  return chain.reverse().reduce((s, el) => styleWithin(el, s), base);
}

const hasStyle = (s: NoteStyle) => Object.keys(s).length > 0;

/** 화면에 보이는 줄을 모은다 — 줄마다 서식 조각, `cur` 가 지금 줄 */
class Lines {
  lines: NoteRun[][] = [];
  cur: NoteRun[] = [];
  get has() {
    return runsText(this.cur).replace(INVISIBLE, "").trim() !== "";
  }
  text(t: string, style: NoteStyle) {
    if (t) this.cur.push({ text: t, style });
  }
  /** `<br>` — 빈 줄이어도 한 줄 */
  newline() {
    this.lines.push(this.cur);
    this.cur = [];
  }
  /** 덩어리의 앞뒤 — 쓰던 줄이 있을 때만 끊는다 (빈칸만 남은 줄은 버린다) */
  block() {
    if (this.has) this.newline();
    else this.cur = [];
  }
  emptyLine() {
    this.lines.push([]);
  }
  take(): NoteRun[][] {
    this.block();
    const out = this.lines;
    this.lines = [];
    return out;
  }
}

/**
 * 한 줄 다듬기 — 폭 없는 글자를 빼고, 겹친 빈칸을 하나로(앞 빈칸의 서식이 남는다), 앞뒤 빈칸을 걷고, &nbsp; 는 빈칸으로.
 * 서식이 갈리는 자리를 넘어서도 글자 하나씩 본다 — `<b>정답 </b> 해설` 의 두 빈칸도 하나가 된다
 */
function finishLine(runs: NoteRun[]): NoteRun[] {
  const chars: NoteRun[] = [];
  for (const r of runs) {
    for (const ch of Array.from(r.text.replace(INVISIBLE, ""))) {
      if (ch === " " && chars.at(-1)?.text === " ") continue;
      chars.push({ text: ch, style: r.style });
    }
  }
  let start = 0;
  let end = chars.length;
  while (start < end && /\s/.test(chars[start].text)) start++;
  while (end > start && /\s/.test(chars[end - 1].text)) end--;
  return normalizeRuns(chars.slice(start, end).map((c) => (c.text === "\u00A0" ? { text: " ", style: c.style } : c)));
}

/** 모은 줄 → 글 조각. 줄마다 다듬고(`finishLine`) 앞뒤 빈 줄을 뺀다. 줄바꿈은 서식 없는 `\n` */
function finishRuns(lines: NoteRun[][]): NoteRun[] {
  const out = lines.map(finishLine);
  while (out.length && !out[0].length) out.shift();
  while (out.length && !out[out.length - 1].length) out.pop();
  const runs: NoteRun[] = [];
  out.forEach((line, i) => {
    if (i > 0) runs.push({ text: "\n", style: {} });
    runs.push(...line);
  });
  return normalizeRuns(runs);
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
 * 줄마다 한 줄, 칸 사이는 빈칸. `pre` 는 빈칸 · 줄바꿈을 적힌 그대로 읽을 때, `style` 은 `node` 안 글자의 서식
 */
function walk(node: Node, out: Lines, onTable?: (el: Element, style: NoteStyle) => boolean, pre = false, style: NoteStyle = {}) {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === TEXT_NODE) {
      const data = (child as Text).data;
      if (!pre) out.text(data.replace(/[\t\n\r\f ]+/g, " "), style);
      else
        data.split(/\r\n?|\n/).forEach((part, k) => {
          if (k > 0) out.newline();
          out.text(part, style);
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
    // 워드 목록 기호(• · 1. · 가.) + 탭 — 기호 글꼴의 글자(Symbol `·` · Wingdings `ü`)를 그대로 두면 다른 글자(· · ü)로 보인다
    const css = attr(child, "style");
    if (LIST_MARKER.test(css)) {
      const marker = listMarker(child);
      if (marker) out.text(`${marker}\t`, styleWithin(child, style));
      continue;
    }
    // 워드 탭 — 안의 &nbsp; 여럿은 빈칸으로 퍼지니 탭 하나(들)로
    const tabs = TAB_COUNT.exec(css);
    if (tabs) {
      out.text("\t".repeat(Math.min(Math.max(Number(tabs[1]), 1), 8)), styleWithin(child, style));
      continue;
    }
    if (tag === "TABLE") {
      if (onTable?.(child, style)) continue;
      out.block();
      for (const tr of tableRows(child)) {
        cellsOf(tr).forEach((td, k) => {
          if (k > 0) out.text(" ", {});
          walk(td, out, undefined, pre, cellStyle(td, child, style));
        });
        out.block();
      }
      continue;
    }
    const inPre = pre || keepsSpaces(child);
    const inner = styleWithin(child, style);
    if (BLOCK.has(tag)) {
      out.block();
      const before = out.lines.length;
      walk(child, out, onTable, inPre, inner);
      // 빈 문단(네이버 U+200B · 워드 &nbsp;)은 빈 줄 — 쓴 사람이 띄운 줄이다
      if (tag === "P" && !out.has && out.lines.length === before) out.emptyLine();
      out.block();
      continue;
    }
    walk(child, out, onTable, inPre, inner);
  }
}

/** 칸 안의 글 조각 — 줄은 화면에 보이던 대로, 서식은 칸까지 내려온 것(`style`)에서. 머리칸은 굵게를 뺀다(머리칸이 이미 굵다) */
function cellRunsOf(td: Element, style: NoteStyle, head: boolean): NoteRun[] {
  const out = new Lines();
  walk(td, out, undefined, keepsSpaces(td), style);
  return finishRuns(out.take()).map((r) => ({ text: cleanCellText(r.text), style: head ? { ...r.style, bold: undefined } : r.style }));
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

/**
 * 우리가 실어 둔 표 원본 (`data-note-table` — 저장 모양 그대로). 꼴이 틀리거나 상한을 넘으면 null.
 * 밖에서 온 클립보드라도 아는 칸만 받는다(`asNoteTable`) — 표 글자일 뿐 HTML 로 들어가지 않는다
 */
function noteTableOf(el: Element): NoteTable | null {
  const m = /^\[table\]([\s\S]*)\[\/table\]$/.exec(attr(el, "data-note-table"));
  return m ? asNoteTable(parseTableBody(m[1])) : null;
}

/**
 * HTML 표 하나 → 표. 칸이 하나도 없으면 null.
 * 우리가 실어 둔 원본(`data-note-table`)은 **화면의 표와 같은 꼴일 때만** 쓴다 — 표의 몇 칸만 골라 복사해도(휴대폰에서 칸을 걸쳐 고르기 등)
 * 브라우저는 감싼 `<table>` 을 속성째 실어서, 원본을 그대로 믿으면 고르지 않은 칸까지 표 전체가 붙는다
 */
function tableFrom(el: Element, base: NoteStyle): { table: NoteTable; truncated: boolean } | null {
  const seen = visualTable(el, base);
  const exact = noteTableOf(el);
  return exact && seen && sameCells(exact, seen.table) ? { table: exact, truncated: false } : seen;
}

/** 줄 수 · 줄마다 칸 수 · 합친 칸 · 칸 글자(빈칸을 한 칸으로 줄여서)가 같은가 — 정렬 · 머리칸은 고른 범위와 상관없어 보지 않는다 */
function sameCells(a: NoteTable, b: NoteTable): boolean {
  const squash = (s: string) => s.replace(/\s+/g, " ").trim();
  return (
    a.rows.length === b.rows.length &&
    a.rows.every((row, r) => {
      const other = b.rows[r];
      return (
        row.length === other.length &&
        row.every((c, i) => (c.rowspan ?? 1) === (other[i].rowspan ?? 1) && (c.colspan ?? 1) === (other[i].colspan ?? 1) && squash(c.text) === squash(other[i].text))
      );
    })
  );
}

/** 화면에 보이는 대로 — 줄 · 칸 · 합친 칸 · 정렬 · 머리칸 · 칸 글자(굵게 · 기울임 · 밑줄까지). `base` 는 표 바깥의 서식 */
function visualTable(el: Element, base: NoteStyle): { table: NoteTable; truncated: boolean } | null {
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
      const head = tagOf(td) === "TH" || (!!tr.parentElement && tagOf(tr.parentElement) === "THEAD");
      const cell: NoteCell = cellWithRuns({ text: "" }, cellRunsOf(td, cellStyle(td, el, base), head));
      if (rowspan > 1) cell.rowspan = rowspan;
      if (colspan > 1) cell.colspan = colspan;
      const align = alignOf(td);
      if (align) cell.align = align;
      if (head) cell.head = true;
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

const sameText = (a: NoteStyle, b: NoteStyle) =>
  !!a.bold === !!b.bold && !!a.italic === !!b.italic && !!a.underline === !!b.underline && !!a.mark === !!b.mark && a.color === b.color && a.size === b.size;

/**
 * 클립보드 HTML → 글 · 표 조각. 표도 글자 서식(굵게 · 기울임 · 밑줄 · 우리 편집기의 서식)도 없으면 null —
 * 그때는 예전처럼 `text/plain` 을 붙여 넣는다 (줄 나눔 · 빈칸이 예전과 한 자도 다르지 않게).
 * `parse` 는 테스트가 브라우저 밖의 파서를 넣을 때만
 */
export function pasteParts(html: string, parse: (html: string) => Document = parseHtml): Pasted | null {
  if (!MAY_STYLE.test(html)) return null;
  const doc = parse(html);
  const root = doc.body ?? doc.documentElement;
  if (!root) return null;
  applySheet(doc);
  const parts: PastePart[] = [];
  let truncated = false;
  const out = new Lines();
  const flush = () => {
    const runs = finishRuns(out.take());
    const text = runsText(runs);
    if (!text) return;
    // 서식이 빈칸에만 걸렸으면(`<b> </b>`) 서식 없는 글 — 예전처럼 글자만 붙인다
    parts.push(runs.some((r) => hasStyle(r.style) && /\S/.test(r.text)) ? { kind: "text", text, runs } : { kind: "text", text });
  };
  walk(
    root,
    out,
    (el, style) => {
      const t = tableFrom(el, style);
      if (!t) return false;
      flush();
      parts.push({ kind: "table", table: t.table });
      truncated ||= t.truncated;
      return true;
    },
    false,
    styleWithin(root, {}),
  );
  flush();
  return parts.some((p) => p.kind === "table" || p.runs) ? { parts, truncated } : null;
}

/* ── text/plain 과 HTML 글자 맞추기 (2026-10-20) ── */

/** 맞춤의 상한 — 고칠 곳(넣기 · 빼기)이 이보다 많거나 일이 너무 크면 두 글이 다르다고 보고 HTML 에서 읽은 줄을 쓴다 */
const MAX_EDITS = 1000;
const MAX_WORK = 20_000_000;

/**
 * 두 글자 줄을 같은 글자끼리 차례대로 잇는다 (Myers 차이 — 고칠 곳이 적으면 빠르다). `a[i]` 와 이은 `b` 의 자리, 없으면 -1.
 * 앞뒤의 같은 부분은 먼저 잇는다(보통은 이것으로 끝난다 — 워드 목록 기호처럼 몇 글자만 다를 때만 가운데를 맞춘다). 상한을 넘으면 null
 */
function alignGlyphs(a: readonly string[], b: readonly string[]): Int32Array | null {
  const pairs = new Int32Array(a.length).fill(-1);
  let lo = 0;
  while (lo < a.length && lo < b.length && a[lo] === b[lo]) {
    pairs[lo] = lo;
    lo++;
  }
  let endA = a.length;
  let endB = b.length;
  while (endA > lo && endB > lo && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
    pairs[endA] = endB;
  }
  const n = endA - lo;
  const m = endB - lo;
  if (!n || !m) return pairs;
  const max = Math.min(MAX_EDITS, n + m);
  const off = max + 1;
  const v = new Int32Array(2 * max + 3);
  // trace[d - 1] = d 번째 고침을 시작할 때의 v (k = -(d-1) … d-1)
  const trace: Int32Array[] = [];
  let work = 0;
  for (let d = 0; d <= max; d++) {
    if (d > 0) trace.push(v.slice(off - d + 1, off + d));
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? v[off + k + 1] : v[off + k - 1] + 1;
      let y = x - k;
      const x0 = x;
      while (x < n && y < m && a[lo + x] === b[lo + y]) {
        x++;
        y++;
      }
      work += x - x0 + 1;
      v[off + k] = x;
      if (x >= n && y >= m) {
        // 거꾸로 따라가며 대각선(같은 글자)마다 잇는다
        for (let e = d; e > 0; e--) {
          const prev = trace[e - 1];
          const at = (kk: number) => prev[kk + e - 1];
          const kk = x - y;
          const down = kk === -e || (kk !== e && at(kk - 1) < at(kk + 1));
          const pk = down ? kk + 1 : kk - 1;
          const px = at(pk);
          const py = px - pk;
          const sx = down ? px : px + 1;
          const sy = down ? py + 1 : py;
          while (x > sx && y > sy) {
            x--;
            y--;
            pairs[lo + x] = lo + y;
          }
          x = px;
          y = py;
        }
        while (x > 0 && y > 0) {
          x--;
          y--;
          pairs[lo + x] = lo + y;
        }
        return pairs;
      }
      if (work > MAX_WORK) return null;
    }
  }
  return null;
}

/** 글자 · 숫자 — 맞춤이 그럴듯한지 셀 때 기호(목록 기호 · 문장 부호)는 세지 않는다 */
const WORDISH = /[\p{L}\p{N}]/u;
/** 사용자 영역 글자 — 기호 글꼴(Wingdings · Symbol)의 글자가 text/plain 에 이렇게 온다 (화면에는 네모나 빈칸) */
const isPrivateUse = (ch: string) => {
  const code = ch.codePointAt(0) ?? 0;
  return code >= 0xe000 && code <= 0xf8ff;
};

/** 이은 것이 그럴듯한가 — 양쪽 다 글자 · 숫자의 대부분(80% 이상, 짧으면 두 자까지 봐준다)이 이어졌을 때만 */
function closeEnough(a: readonly string[], b: readonly string[], pairs: Int32Array): boolean {
  const usedB = new Uint8Array(b.length);
  let wordA = 0;
  let missA = 0;
  pairs.forEach((j, i) => {
    const w = WORDISH.test(a[i]);
    if (w) wordA++;
    if (j >= 0) usedB[j] = 1;
    else if (w) missA++;
  });
  if (!usedB.some((u) => u === 1)) return false;
  let wordB = 0;
  let missB = 0;
  b.forEach((ch, j) => {
    if (!WORDISH.test(ch)) return;
    wordB++;
    if (!usedB[j]) missB++;
  });
  return missA <= 2 + wordA * 0.2 && missB <= 2 + wordB * 0.2;
}

/**
 * 표가 없는 붙여 넣기의 글자 조각 (2026-10-20) — 글자 · 줄 · 빈칸은 브라우저가 준 `text/plain` 그대로 두고(예전 붙여 넣기와 같게 — 문단 사이 빈 줄 · 두 칸 빈칸까지)
 * 서식만 HTML 에서 읽은 것(`pasteParts`)을 얹는다. 빈칸 · 줄바꿈 · 폭 없는 글자를 뺀 글자를 HTML 쪽과 차례대로 잇고(`alignGlyphs`), 이은 글자에 그 서식을 얹는다.
 * 몇 글자가 달라도 된다 — 워드는 text/plain 에 목록 기호를 `•` 로 적고 HTML 에는 기호 글꼴의 `·` 로 적는다(이 글자들만 잇지 못한다). 글자 · 숫자의 대부분이
 * 이어지지 않으면(`closeEnough` — 두 글이 다르다) HTML 에서 읽은 줄 그대로 쓴다 — 어느 쪽이든 굵게는 남는다.
 * 잇지 못한 글자와 빈칸은 앞뒤 글자가 같은 서식일 때만 그 서식을 잇는다(굵은 낱말 사이 빈칸은 굵게, 보통 글과 굵은 글 사이는 보통). 줄바꿈은 서식이 없다.
 * text/plain 의 사용자 영역 글자(U+E000~F8FF — 워드의 ✓ · ➢ 목록 기호)가 HTML 의 같은 자리 글자와 하나씩 짝지어지면 그 글자로 바꾼다(화면에 네모로 보이지 않게).
 * 폭 없는 글자 중 U+200B(네이버 빈 문단) · U+2060 · U+FEFF · U+FFFC 는 뺀다 — 이모지를 잇는 U+200D 는 둔다
 */
export function pastedTextRuns(pasted: Pasted, plain: string): NoteRun[] {
  const html: NoteRun[] = [];
  for (const p of pasted.parts) {
    if (p.kind !== "text") continue;
    if (html.length) html.push({ text: "\n", style: {} });
    html.push(...(p.runs ?? [{ text: p.text, style: {} }]));
  }
  const fromHtml = normalizeRuns(html);
  const glyphs: NoteRun[] = [];
  for (const r of fromHtml) for (const ch of Array.from(r.text)) if (!isGap(ch)) glyphs.push({ text: ch, style: r.style });
  const chars = Array.from(plain.replace(/\r\n?/g, "\n").replace(/[\u200B\u2060\uFEFF\uFFFC]/g, ""));
  // 빈칸이 아닌 글자들 (text/plain 의 자리)
  const at: number[] = [];
  chars.forEach((ch, k) => {
    if (!isGap(ch)) at.push(k);
  });
  if (!at.length || !glyphs.length) return fromHtml;
  const a = at.map((k) => chars[k]);
  const b = glyphs.map((g) => g.text);
  const pairs = alignGlyphs(a, b);
  if (!pairs || !closeEnough(a, b, pairs)) return fromHtml;
  const styles: (NoteStyle | null)[] = chars.map(() => null);
  pairs.forEach((j, i) => {
    if (j >= 0) styles[at[i]] = glyphs[j].style;
  });
  // 잇지 못한 사용자 영역 글자 — 앞뒤로 이은 글자 사이의 틈이 HTML 쪽과 같은 길이면 하나씩 그 글자로
  for (let i = 0; i < a.length; ) {
    if (pairs[i] >= 0) {
      i++;
      continue;
    }
    const start = i;
    while (i < a.length && pairs[i] < 0) i++;
    const from = start > 0 ? pairs[start - 1] + 1 : 0;
    const to = i < a.length ? pairs[i] : b.length;
    if (to - from !== i - start || !a.slice(start, i).every(isPrivateUse)) continue;
    for (let t = 0; t < i - start; t++) {
      chars[at[start + t]] = b[from + t];
      styles[at[start + t]] = glyphs[from + t].style;
    }
  }
  // 빈칸 · 잇지 못한 글자의 서식 — 같은 줄의 앞 글자와 뒤 글자 (줄바꿈에서 끊는다)
  const before: (NoteStyle | null)[] = [];
  let last: NoteStyle | null = null;
  chars.forEach((ch, k) => {
    if (ch === "\n") last = null;
    before[k] = last;
    if (styles[k]) last = styles[k];
  });
  const out: NoteRun[] = [];
  let next: NoteStyle | null = null;
  for (let k = chars.length - 1; k >= 0; k--) {
    const ch = chars[k];
    if (ch === "\n") next = null;
    const own = styles[k];
    const prev = before[k];
    out.push({ text: ch, style: own ?? (ch !== "\n" && prev && next && sameText(prev, next) ? prev : {}) });
    if (own) next = own;
  }
  return normalizeRuns(out.reverse());
}
