/**
 * 수업자료실 안내 · 스크립트의 글자 서식 (2026-10-05 Alan — "수업자료실에 안내글 올리는곳에 색상, 크기, 진하게, 밑줄 등 기본적인 것들을 쫌 추가 할 수 있을까?").
 *
 * - **글로 저장한다** — `class_materials.note` 는 그대로 text 이고 서식은 꺾쇠 태그다: `[b]굵게[/b]` · `[u]밑줄[/u]` · `[i]기울임[/i]` ·
 *   `[mark]형광펜[/mark]` · `[color=red]빨강[/color]` · `[size=lg]크게[/size]`. 마이그레이션이 없고, 서식이 없는 예전 안내는 그대로 보인다.
 * - **HTML 을 저장하지 않는다** — 학생 화면에 강사가 쓴 HTML 을 그대로 넣으면(`dangerouslySetInnerHTML`) 스크립트가 끼어들 길이 생긴다.
 *   여기서 글자 조각(`NoteRun`)으로 풀고, 화면은 정해 둔 클래스(`NOTE_COLORS` · `NOTE_SIZES`)만 붙인 `<span>` 으로 그린다.
 * - **토익 지문의 빈칸(`______` · `-------`)과 겹치지 않게** 마크다운(`**` · `__`)을 쓰지 않았다.
 * - 모르는 태그 · 짝이 없는 닫는 태그 · 목록에 없는 색은 **적힌 그대로 글자로** 보인다 (조용히 사라지지 않는다). 닫지 않은 태그는 끝까지 적용된다.
 * - 글자 수 상한(5만 자)은 태그까지 센다 — DB check 가 저장된 글 전체를 보기 때문이다.
 * - **줄 정렬**(같은 날 Alan "줄 단위로 왼쪽정렬, 가운데정렬, 오른쪽 정렬") — 줄 맨 앞의 `[center]` · `[right]` (왼쪽은 표시 없음). 줄 가운데에 있으면 글자다.
 * - **이미지**(같은 날 — 수업자료실 공지 "블로그랑 같다고 생각하면") — `[img=images/….webp w=50]`. 글에서는 한 글자(`OBJ`)로 세고 너비는 칸의 몇 %(10~100)다.
 *   그림 주소는 글에 없다 — 저장소 경로만 두고 보여 줄 때 보는 사람의 세션으로 서명 주소를 만든다(남이 주소를 들고 가도 곧 만료된다).
 * - **표**(2026-10-07 Alan — "안내사항에 이런표도 넣고싶어 … 다른 블로그에서 복사 붙여넣기로 했을때 표를 그대로 가져오는게 가능할까?") —
 *   `[table][tr][td rowspan=4 align=center]When\nWho[/td]…[/tr][/table]` 한 줄. 그림처럼 글에서는 한 글자(`OBJ`)다.
 *   칸에는 글자만(줄바꿈은 `\n`, `[` · `\` 는 앞에 `\`) · 합친 칸(rowspan · colspan) · 정렬(가운데 · 오른쪽) · 머리칸(`th`)만 둔다 — 색 · 굵기 · 글꼴은 글자 붙여 넣기처럼 따라오지 않는다.
 *   못 읽는 표는 글자 그대로 보인다(태그와 같은 규칙). 붙여 넣은 HTML 을 표로 바꾸는 일은 `note-paste.ts`.
 */

export const NOTE_COLORS = {
  pink: { label: "분홍", className: "text-brand-600", swatch: "bg-brand-600" },
  red: { label: "빨강", className: "text-red-600", swatch: "bg-red-600" },
  blue: { label: "파랑", className: "text-blue-600", swatch: "bg-blue-600" },
  green: { label: "초록", className: "text-emerald-600", swatch: "bg-emerald-600" },
  gray: { label: "회색", className: "text-slate-500", swatch: "bg-slate-500" },
} as const;
export type NoteColor = keyof typeof NOTE_COLORS;

export const NOTE_SIZES = {
  sm: { label: "작게", className: "text-xs" },
  lg: { label: "크게", className: "text-base sm:text-lg" },
  xl: { label: "아주 크게", className: "text-lg sm:text-xl" },
} as const;
export type NoteSize = keyof typeof NOTE_SIZES;

export type NoteAlign = "left" | "center" | "right";
export const NOTE_ALIGNS: NoteAlign[] = ["left", "center", "right"];
export const NOTE_ALIGN_LABEL: Record<NoteAlign, string> = { left: "왼쪽 정렬", center: "가운데 정렬", right: "오른쪽 정렬" };
export const alignClassName = (a: NoteAlign) => (a === "center" ? "text-center" : a === "right" ? "text-right" : "");

export type NoteImage = { path: string; w: number };
/** 글 속 그림 한 장이 차지하는 글자 (U+FFFC OBJECT REPLACEMENT CHARACTER) */
export const OBJ = "\uFFFC";
export const IMAGE_WIDTHS = [25, 50, 75, 100] as const;
export const IMAGE_MIN_W = 10;
const clampWidth = (w: number) => (Number.isFinite(w) ? Math.min(100, Math.max(IMAGE_MIN_W, Math.round(w))) : 100);

/** 표 한 칸의 정렬 — 왼쪽은 표시 없음 */
export type NoteCellAlign = "center" | "right";
/** 표 한 칸 — 글자(줄바꿈만, 서식 없음) · 합친 칸 · 정렬 · 머리칸(th) */
export type NoteCell = { text: string; rowspan?: number; colspan?: number; align?: NoteCellAlign; head?: boolean };
/** 표 — 줄마다 칸. 위 줄에서 합쳐 내려온 칸 자리는 그 줄에 없다 (HTML 표와 같다) */
export type NoteTable = { rows: NoteCell[][] };
/** 한 표의 줄 · 칸 상한 — 붙여 넣을 때 넘치는 줄 · 칸은 잘라 넣고 알린다 (`note-paste.ts`) */
export const TABLE_MAX_ROWS = 100;
export const TABLE_MAX_COLS = 12;

export type NoteStyle = {
  img?: NoteImage;
  table?: NoteTable;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  mark?: boolean;
  color?: NoteColor;
  size?: NoteSize;
};
export type NoteRun = { text: string; style: NoteStyle };

/** 켜고 끄는 서식 — 태그 이름 → 스타일 칸 */
const FLAGS = { b: "bold", i: "italic", u: "underline", mark: "mark" } as const;
type FlagTag = keyof typeof FLAGS;

const TAG = /\[(\/?)(b|i|u|mark|color|size|center|right)(?:=([a-z]+))?\]|\[img=([a-z0-9][a-z0-9/._-]{0,200})(?: w=(\d{1,3}))?\]/g;
/**
 * 글을 훑는 토큰 — 표 한 덩어리(`[table]…[/table]`, 줄바꿈 없이 한 줄) 또는 위의 태그.
 * 표 안은 `\.`(이스케이프) · `[` 가 아닌 글자 · `[/table]` 이 아닌 `[` 만 — 칸 글자의 `[` 는 늘 `\[` 라 칸 안의 `[/table]` 에서 끊기지 않는다
 */
const TABLE_BLOCK = /\[table\]((?:\\.|[^\\[\n]|\[(?!\/table\]))*)\[\/table\]/;
const TOKEN = new RegExp(`${TABLE_BLOCK.source}|${TAG.source}`, "g");

type Open = { tag: string; style: NoteStyle };

const isColor = (v: string | undefined): v is NoteColor => !!v && Object.hasOwn(NOTE_COLORS, v);
const isSize = (v: string | undefined): v is NoteSize => !!v && Object.hasOwn(NOTE_SIZES, v);

function styleOf(stack: Open[]): NoteStyle {
  const s: NoteStyle = {};
  for (const o of stack) Object.assign(s, o.style);
  return s;
}

/** 그림 · 표 — 글에서 한 글자(`OBJ`)를 차지하는 덩어리. 서식이 붙지 않고 옆 조각과 합치지 않는다 */
export const isObjStyle = (s: NoteStyle) => !!(s.img || s.table);

const sameStyle = (a: NoteStyle, b: NoteStyle) =>
  !isObjStyle(a) &&
  !isObjStyle(b) &&
  !!a.bold === !!b.bold && !!a.italic === !!b.italic && !!a.underline === !!b.underline && !!a.mark === !!b.mark && a.color === b.color && a.size === b.size;

function push(runs: NoteRun[], text: string, style: NoteStyle) {
  if (!text) return;
  if (isObjStyle(style)) {
    runs.push({ text: OBJ, style });
    return;
  }
  const last = runs.at(-1);
  if (last && sameStyle(last.style, style)) last.text += text;
  else runs.push({ text, style });
}

/** 글 한 편 = 글자 조각 + 줄마다 정렬 (`aligns.length` = 줄 수) */
export type NoteDoc = { runs: NoteRun[]; aligns: NoteAlign[] };

/** 저장된 글 → 글자 조각. 같은 서식이 이어지면 한 조각으로 합친다 */
export function parseNote(note: string): NoteRun[] {
  return parseDoc(note).runs;
}

/** 저장된 글 → 글자 조각 + 줄 정렬 */
export function parseDoc(note: string): NoteDoc {
  const runs: NoteRun[] = [];
  const aligns: NoteAlign[] = ["left"];
  const stack: Open[] = [];
  let lineEmpty = true;
  const emit = (text: string, style: NoteStyle) => {
    if (!text) return;
    push(runs, text, style);
    const parts = text.split("\n");
    for (let k = 1; k < parts.length; k++) aligns.push("left");
    lineEmpty = parts.length > 1 ? parts.at(-1) === "" : lineEmpty && text === "";
  };
  let at = 0;
  for (const m of note.matchAll(TOKEN)) {
    const [whole, tableBody, close, tag, value, imgPath, imgW] = m;
    emit(note.slice(at, m.index), styleOf(stack));
    at = m.index + whole.length;

    if (tableBody !== undefined) {
      const table = parseTableBody(tableBody);
      if (table) {
        runs.push({ text: OBJ, style: { table } });
        lineEmpty = false;
      } else emit(whole, styleOf(stack)); // 못 읽는 표는 글자 그대로 (태그와 같은 규칙)
      continue;
    }
    if (imgPath !== undefined) {
      runs.push({ text: OBJ, style: { img: { path: imgPath, w: imgW === undefined ? 100 : clampWidth(Number(imgW)) } } });
      lineEmpty = false;
      continue;
    }
    let ok = false;
    if (tag === "center" || tag === "right") {
      // 줄 맨 앞에서만 정렬 — 줄 가운데의 [center] 는 글자다
      if (!close && value === undefined && lineEmpty) {
        aligns[aligns.length - 1] = tag;
        ok = true;
      }
    } else if (close) {
      if (value === undefined) {
        const i = stack.findLastIndex((o) => o.tag === tag);
        if (i >= 0) {
          stack.splice(i, 1);
          ok = true;
        }
      }
    } else if (tag in FLAGS) {
      if (value === undefined) {
        stack.push({ tag, style: { [FLAGS[tag as FlagTag]]: true } });
        ok = true;
      }
    } else if (tag === "color" && isColor(value)) {
      stack.push({ tag, style: { color: value } });
      ok = true;
    } else if (tag === "size" && isSize(value)) {
      stack.push({ tag, style: { size: value } });
      ok = true;
    }
    if (!ok) emit(whole, styleOf(stack));
  }
  emit(note.slice(at), styleOf(stack));
  return { runs, aligns };
}

/** 서식을 뺀 글 — 접을지 · 몇 자인지는 학생에게 보이는 글자로 센다 */
export const runsText = (runs: NoteRun[]) => runs.map((r) => r.text).join("");

/** 앞뒤 빈칸 · 빈 줄을 걷어 낸 조각 (`note.trim()` 과 같은 뜻) */
export function trimRuns(runs: NoteRun[]): NoteRun[] {
  const out = runs.map((r) => ({ ...r }));
  while (out.length && !(out[0].text = out[0].text.trimStart())) out.shift();
  while (out.length && !(out[out.length - 1].text = out[out.length - 1].text.trimEnd())) out.pop();
  return out;
}

/** 앞에서 `count` 글자(코드 포인트)만 — 접힌 안내의 앞부분을 서식째 보여 준다 */
export function sliceRuns(runs: NoteRun[], count: number): NoteRun[] {
  const out: NoteRun[] = [];
  let left = count;
  for (const r of runs) {
    if (left <= 0) break;
    const chars = Array.from(r.text);
    out.push({ text: chars.slice(0, left).join(""), style: r.style });
    left -= chars.length;
  }
  return out;
}

/** 조각 하나에 붙일 클래스 — 정해 둔 것만 (값을 그대로 CSS 에 넣지 않는다) */
export function runClassName(s: NoteStyle): string {
  return [
    s.bold && "font-bold",
    s.italic && "italic",
    s.underline && "underline decoration-1 underline-offset-2",
    s.mark && "rounded-sm bg-yellow-200 px-0.5 text-ink",
    s.color && NOTE_COLORS[s.color].className,
    s.size && NOTE_SIZES[s.size].className,
  ]
    .filter(Boolean)
    .join(" ");
}

/** 서식 태그를 모두 지운 글 — `서식 지우기` 버튼이 고른 부분에 쓴다 */
export const stripNoteTags = (text: string) => text.replace(TAG, "");

/** 줄마다 자른 조각 — 보여 줄 때 줄마다 정렬이 다르다 */
export function splitLines(runs: NoteRun[]): NoteRun[][] {
  const lines: NoteRun[][] = [[]];
  for (const r of runs) {
    const parts = r.text.split("\n");
    parts.forEach((part, k) => {
      if (k > 0) lines.push([]);
      if (part) lines[lines.length - 1].push({ text: part, style: r.style });
    });
  }
  return lines;
}

/** 글에 든 그림 경로 — 서명 주소를 만들고, 공지를 고칠 때 빠진 그림을 저장소에서 지운다 */
export function noteImagePaths(note: string): string[] {
  return [...new Set(parseNote(note).flatMap((r) => (r.style.img ? [r.style.img.path] : [])))];
}

/** 앞뒤 빈칸 · 빈 줄을 걷어 낸 글 — 걷어 낸 줄만큼 정렬도 뺀다 */
export function trimDoc(doc: NoteDoc): NoteDoc {
  const plain = runsText(doc.runs);
  const lead = plain.match(/^\s*/)?.[0] ?? "";
  const runs = trimRuns(doc.runs);
  const dropped = lead.split("\n").length - 1;
  const lines = runsText(runs).split("\n").length;
  return { runs, aligns: doc.aligns.slice(dropped, dropped + lines) };
}

/** 고른 글을 감쌀 여는 · 닫는 태그 */
export type NoteWrap = { open: string; close: string };
export const noteWrap = {
  bold: { open: "[b]", close: "[/b]" },
  italic: { open: "[i]", close: "[/i]" },
  underline: { open: "[u]", close: "[/u]" },
  mark: { open: "[mark]", close: "[/mark]" },
  color: (c: NoteColor): NoteWrap => ({ open: `[color=${c}]`, close: "[/color]" }),
  size: (s: NoteSize): NoteWrap => ({ open: `[size=${s}]`, close: "[/size]" }),
};

/* ── 바로 보이는 편집기(`NoteEditor`)가 쓰는 조각 연산 — 2026-10-05 Alan "강사화면에 코드로 보이고 … 바로 미리보기처럼 보여주면 좋겠어" ── */

const charsOf = (s: string) => Array.from(s);
const runLength = (r: NoteRun) => charsOf(r.text).length;

/** 조각 → 저장할 글. 조각마다 여는 · 닫는 태그를 따로 붙인다 (겹침이 없어 다시 읽으면 같은 조각이 나온다) */
export function runsToNote(runs: NoteRun[]): string {
  let out = "";
  for (const r of runs) {
    if (!r.text) continue;
    const s = r.style;
    if (s.img) {
      out += `[img=${s.img.path}${s.img.w === 100 ? "" : ` w=${s.img.w}`}]`;
      continue;
    }
    if (s.table) {
      out += tableToNote(s.table);
      continue;
    }
    const wraps: NoteWrap[] = [];
    if (s.bold) wraps.push(noteWrap.bold);
    if (s.italic) wraps.push(noteWrap.italic);
    if (s.underline) wraps.push(noteWrap.underline);
    if (s.mark) wraps.push(noteWrap.mark);
    if (s.color) wraps.push(noteWrap.color(s.color));
    if (s.size) wraps.push(noteWrap.size(s.size));
    out += wraps.map((w) => w.open).join("") + r.text + wraps.reverse().map((w) => w.close).join("");
  }
  return out;
}

/** 글 한 편 → 저장할 글. 줄마다 정렬 표시를 맨 앞에 */
export function docToNote(doc: NoteDoc): string {
  return splitLines(doc.runs)
    .map((line, i) => {
      const a = doc.aligns[i] ?? "left";
      return (a === "left" ? "" : `[${a}]`) + runsToNote(line);
    })
    .join("\n");
}

/** 같은 서식끼리 잇고 빈 조각을 버린다 */
export function normalizeRuns(runs: NoteRun[]): NoteRun[] {
  const out: NoteRun[] = [];
  for (const r of runs) push(out, r.text, { ...r.style });
  return out;
}

/** `at` 글자 앞에서 조각을 가른다 — 돌려준 배열에서 그 자리가 몇 번째 조각부터인지와 함께 */
function splitAt(runs: NoteRun[], at: number): [NoteRun[], number] {
  const out: NoteRun[] = [];
  let pos = 0;
  let index = -1;
  for (const r of runs) {
    const chars = charsOf(r.text);
    if (index < 0 && at > pos && at < pos + chars.length) {
      out.push({ text: chars.slice(0, at - pos).join(""), style: r.style }, { text: chars.slice(at - pos).join(""), style: r.style });
      index = out.length - 1;
    } else {
      if (index < 0 && at <= pos) index = out.length;
      out.push(r);
    }
    pos += chars.length;
  }
  return [out, index < 0 ? out.length : index];
}

/** [start, end) 를 `text`(서식 없음 · 앞 글자의 서식을 잇는다)로 바꾼다 — 붙여 넣기 · 줄바꿈 */
export function spliceRuns(runs: NoteRun[], start: number, end: number, insert: string | NoteRun[]): NoteRun[] {
  const [a, i] = splitAt(runs, start);
  const [b, j] = splitAt(a, end);
  const before = b.slice(0, i);
  // 그림 · 표 옆에 친 글자가 그림 · 표가 되지 않게 — 그 서식은 잇지 않는다
  const near = [...before].reverse().find((r) => !isObjStyle(r.style))?.style ?? b.slice(i).find((r) => !isObjStyle(r.style))?.style ?? {};
  const added = typeof insert === "string" ? [{ text: insert, style: { ...near, img: undefined, table: undefined } }] : insert;
  return normalizeRuns([...before, ...added, ...b.slice(j)].map((r) => ({ text: r.text, style: stripUndefined(r.style) })));
}

const stripUndefined = (s: NoteStyle): NoteStyle => Object.fromEntries(Object.entries(s).filter(([, v]) => v !== undefined && v !== false));

/** `offset` 글자가 몇 번째 줄인가 */
export const lineOf = (runs: NoteRun[], offset: number) => (Array.from(runsText(runs)).slice(0, offset).join("").match(/\n/g) ?? []).length;

/** 글 한 편에서 [start, end) 를 바꾼다 — 새 줄은 그 줄의 정렬을 잇고, 지운 줄의 정렬은 빠진다 */
export function spliceDoc(doc: NoteDoc, start: number, end: number, insert: string | NoteRun[]): NoteDoc {
  const l1 = lineOf(doc.runs, start);
  const l2 = lineOf(doc.runs, end);
  const text = typeof insert === "string" ? insert : runsText(insert);
  const k = (text.match(/\n/g) ?? []).length;
  const keep = doc.aligns[l1] ?? "left";
  return {
    runs: spliceRuns(doc.runs, start, end, insert),
    aligns: [...doc.aligns.slice(0, l1 + 1), ...Array(k).fill(keep), ...doc.aligns.slice(l2 + 1)],
  };
}

/** 고른 줄들의 정렬 — 이미 다 그 정렬이면 왼쪽으로 되돌린다 (서식 버튼과 같이 한 번 더 누르면 풀린다) */
export function alignDoc(doc: NoteDoc, start: number, end: number, align: NoteAlign): NoteDoc {
  const l1 = lineOf(doc.runs, start);
  const l2 = lineOf(doc.runs, end);
  const off = align !== "left" && doc.aligns.slice(l1, l2 + 1).every((a) => a === align);
  return { runs: doc.runs, aligns: doc.aligns.map((a, i) => (i >= l1 && i <= l2 ? (off ? "left" : align) : a)) };
}

/** `offset` 자리의 그림 너비를 바꾼다 */
export function resizeImage(doc: NoteDoc, offset: number, w: number): NoteDoc {
  let pos = 0;
  const runs = doc.runs.map((r) => {
    const here = pos;
    pos += runLength(r);
    return here === offset && r.style.img ? { text: r.text, style: { ...r.style, img: { ...r.style.img, w: clampWidth(w) } } } : r;
  });
  return { runs, aligns: doc.aligns };
}

/** 그림 한 장 조각 */
export const imageRun = (path: string, w = 100): NoteRun => ({ text: OBJ, style: { img: { path, w: clampWidth(w) } } });

/* ── 표 (2026-10-07) ── */

/** 칸 글자 → 글. `\` · `[` 앞에 `\`, 줄바꿈은 `\n` — 표가 한 줄로 남고 칸 안의 `[/td]` · `[/table]` 이 태그로 읽히지 않는다 */
const escapeCell = (s: string) => s.replace(/[\\[\n]/g, (c) => (c === "\n" ? "\\n" : `\\${c}`));

/** 표 → 저장할 글 (한 줄). 기본값(rowspan · colspan 1 · 왼쪽 정렬 · td)은 적지 않는다 */
export function tableToNote(t: NoteTable): string {
  let out = "[table]";
  for (const row of t.rows) {
    out += "[tr]";
    for (const c of row) {
      const tag = c.head ? "th" : "td";
      const attrs =
        (c.rowspan && c.rowspan > 1 ? ` rowspan=${c.rowspan}` : "") + (c.colspan && c.colspan > 1 ? ` colspan=${c.colspan}` : "") + (c.align ? ` align=${c.align}` : "");
      out += `[${tag}${attrs}]${escapeCell(c.text)}[/${tag}]`;
    }
    out += "[/tr]";
  }
  return `${out}[/table]`;
}

const CELL_OPEN = /\[(td|th)((?: [a-z]+=[a-z0-9]+)*)\]/y;

/** 칸 여는 태그의 값 — 아는 것(rowspan · colspan · align)만 한 번씩. 모르는 값이면 null (그 표는 글자 그대로 보인다) */
function cellAttrs(src: string): Omit<NoteCell, "text"> | null {
  const out: Omit<NoteCell, "text"> = {};
  for (const part of src.split(" ")) {
    if (!part) continue;
    const [k, v] = part.split("=");
    const n = /^\d{1,3}$/.test(v) ? Number(v) : 0;
    if (k === "rowspan" && out.rowspan === undefined && n >= 1 && n <= TABLE_MAX_ROWS) out.rowspan = n;
    else if (k === "colspan" && out.colspan === undefined && n >= 1 && n <= TABLE_MAX_COLS) out.colspan = n;
    else if (k === "align" && out.align === undefined && (v === "center" || v === "right")) out.align = v;
    else return null;
  }
  if (out.rowspan === 1) delete out.rowspan;
  if (out.colspan === 1) delete out.colspan;
  return out;
}

/** `[table]` 과 `[/table]` 사이 → 표. 꼴이 틀리거나 상한을 넘으면 null */
export function parseTableBody(src: string): NoteTable | null {
  const rows: NoteCell[][] = [];
  let cells = 0;
  let i = 0;
  while (i < src.length) {
    if (!src.startsWith("[tr]", i)) return null;
    i += 4;
    const row: NoteCell[] = [];
    while (!src.startsWith("[/tr]", i)) {
      CELL_OPEN.lastIndex = i;
      const m = CELL_OPEN.exec(src);
      const attrs = m && cellAttrs(m[2]);
      if (!m || !attrs) return null;
      i = CELL_OPEN.lastIndex;
      const close = `[/${m[1]}]`;
      let text = "";
      for (;;) {
        const ch = src[i];
        if (ch === undefined) return null;
        if (ch === "\\") {
          const next = src[i + 1];
          if (next === "n") text += "\n";
          else if (next === "\\" || next === "[") text += next;
          else return null;
          i += 2;
        } else if (ch === "[") {
          if (!src.startsWith(close, i)) return null;
          i += close.length;
          break;
        } else {
          text += ch;
          i += 1;
        }
      }
      row.push({ text, ...attrs, ...(m[1] === "th" ? { head: true } : {}) });
      if (row.length > TABLE_MAX_COLS) return null;
    }
    i += 5;
    rows.push(row);
    cells += row.length;
    if (rows.length > TABLE_MAX_ROWS) return null;
  }
  return cells > 0 ? { rows } : null;
}

/** 칸 글자 다듬기 — 줄바꿈을 `\n` 하나로, 글 속 덩어리 글자(`OBJ`)는 뺀다 (칸 글자는 서식 없는 글자뿐이다) */
export const cleanCellText = (s: string) => s.replace(/\r\n?/g, "\n").replaceAll(OBJ, "");

/**
 * 밖에서 온 값(편집기 칸의 data-table · 붙여 넣기) → 표. 꼴이 틀리면 null.
 * 줄 · 칸 수가 상한을 넘으면 받지 않는다 — 붙여 넣기는 그 전에 잘라 둔다(`note-paste.ts`)
 */
export function asNoteTable(v: unknown): NoteTable | null {
  if (!v || typeof v !== "object" || !Array.isArray((v as NoteTable).rows)) return null;
  const rows: NoteCell[][] = [];
  let cells = 0;
  for (const row of (v as NoteTable).rows) {
    if (!Array.isArray(row) || row.length > TABLE_MAX_COLS) return null;
    const out: NoteCell[] = [];
    for (const c of row as unknown[]) {
      if (!c || typeof c !== "object" || typeof (c as NoteCell).text !== "string") return null;
      const { text, rowspan, colspan, align, head } = c as NoteCell;
      const cell: NoteCell = { text: cleanCellText(text) };
      if (Number.isInteger(rowspan) && rowspan! > 1) cell.rowspan = Math.min(rowspan!, TABLE_MAX_ROWS);
      if (Number.isInteger(colspan) && colspan! > 1) cell.colspan = Math.min(colspan!, TABLE_MAX_COLS);
      if (align === "center" || align === "right") cell.align = align;
      if (head === true) cell.head = true;
      out.push(cell);
    }
    rows.push(out);
    cells += out.length;
  }
  return cells > 0 && rows.length <= TABLE_MAX_ROWS ? { rows } : null;
}

/** 표 한 개 조각 */
export const tableRun = (table: NoteTable): NoteRun => ({ text: OBJ, style: { table } });

/** 표의 크기 — 합친 칸을 펼친 줄 수 · 칸 수 (`2줄 · 4칸`) */
export function tableSize(t: NoteTable): { rows: number; cols: number } {
  const taken: number[] = [];
  let cols = 0;
  for (const row of t.rows) {
    let c = 0;
    for (const cell of row) {
      while ((taken[c] ?? 0) > 0) c++;
      const span = cell.colspan ?? 1;
      for (let k = 0; k < span; k++) taken[c + k] = cell.rowspan ?? 1;
      c += span;
      cols = Math.max(cols, c);
    }
    for (let k = 0; k < taken.length; k++) if ((taken[k] ?? 0) > 0) taken[k]--;
  }
  return { rows: t.rows.length, cols };
}

/** `offset` 자리의 표를 바꾼다 (표 고치기 팝업의 적용) */
export function replaceTable(doc: NoteDoc, offset: number, table: NoteTable): NoteDoc {
  let pos = 0;
  const runs = doc.runs.map((r) => {
    const here = pos;
    pos += runLength(r);
    return here === offset && r.style.table ? { text: r.text, style: { table } } : r;
  });
  return { runs, aligns: doc.aligns };
}

/**
 * 표 모양 — 학생 화면(`NoteBody`)과 편집기가 같은 클래스를 쓴다. 표는 칸 폭을 꽉 채우고, 휴대폰에서 칸이 모자라면 표만 옆으로 민다
 * (낱말 가운데서 끊지 않는다 — 안내 글의 `overflow-wrap:anywhere` 를 표 안에서는 끈다). 줄 정렬이 표 칸에 번지지 않게 왼쪽이 기본이다.
 * 휴대폰에서는 칸 여백을 줄인다 — 네 칸 표가 320px 에 들어가야 한다
 */
export const NOTE_TABLE_WRAP = "my-1 max-w-full overflow-x-auto";
export const NOTE_TABLE = "w-full border-collapse text-left break-keep [overflow-wrap:break-word]";
export function cellClassName(c: NoteCell): string {
  return [
    "border border-slate-300 px-2 py-1.5 align-middle whitespace-pre-wrap sm:px-3",
    c.head && "bg-brand-50 font-bold text-ink",
    c.align === "center" && "text-center",
    c.align === "right" && "text-right",
  ]
    .filter(Boolean)
    .join(" ");
}

export type NoteChange =
  | { kind: "flag"; flag: "bold" | "italic" | "underline" | "mark" }
  | { kind: "color"; color: NoteColor }
  | { kind: "size"; size: NoteSize }
  | { kind: "clear" };

/** 고른 글자 [start, end) 에 서식을 건다. 고른 글자가 이미 다 그 서식이면 푼다 (굵게를 한 번 더 누르면 풀린다) */
export function applyNoteChange(runs: NoteRun[], start: number, end: number, change: NoteChange): NoteRun[] {
  if (end <= start) return runs;
  const [a, i] = splitAt(runs, start);
  const [b, j] = splitAt(a, end);
  const middle = b.slice(i, j);
  // 그림 · 표는 서식을 받지 않고, 켜졌나를 셀 때도 빠진다 — 글자와 표를 함께 골라 굵게를 두 번 누르면 풀려야 한다
  const texts = middle.filter((r) => !isObjStyle(r.style));
  if (texts.length === 0) return runs;
  const all = (pred: (s: NoteStyle) => boolean) => texts.every((r) => pred(r.style));
  let next: (s: NoteStyle) => NoteStyle;
  if (change.kind === "clear") next = () => ({});
  else if (change.kind === "flag") {
    const off = all((s) => !!s[change.flag]);
    next = (s) => ({ ...s, [change.flag]: off ? undefined : true });
  } else if (change.kind === "color") {
    const off = all((s) => s.color === change.color);
    next = (s) => ({ ...s, color: off ? undefined : change.color });
  } else {
    const off = all((s) => s.size === change.size);
    next = (s) => ({ ...s, size: off ? undefined : change.size });
  }
  return normalizeRuns([
    ...b.slice(0, i),
    ...middle.map((r) => (isObjStyle(r.style) ? r : { text: r.text, style: stripUndefined(next(r.style)) })),
    ...b.slice(j),
  ]);
}

/** 조각 전체 글자 수 (코드 포인트) */
export const runsLength = (runs: NoteRun[]) => runs.reduce((n, r) => n + runLength(r), 0);

const WORD_CHAR = /[\p{L}\p{N}_'’]/u;

/**
 * 커서만 둔 채 서식 버튼을 누르면 그 단어 전체에 — 워드와 같은 동작 (2026-10-05 Alan "다시 그 글자에 진하게를 또 클릭하면 진하게가 취소되면 좋겠어.
 * 워드에서 적용되는 방법"). 커서가 단어 안이나 끝에 붙어 있으면 그 단어의 [시작, 끝), 빈칸 · 문장부호 사이면 null
 */
export function wordRangeAt(text: string, caret: number): [number, number] | null {
  const chars = Array.from(text);
  let start = caret;
  let end = caret;
  while (start > 0 && WORD_CHAR.test(chars[start - 1])) start--;
  while (end < chars.length && WORD_CHAR.test(chars[end])) end++;
  return end > start ? [start, end] : null;
}

/**
 * 고른 부분의 서식 — 도구줄 버튼을 눌린 모양으로 보이는 데 쓴다. 고른 글자가 **모두** 그 서식일 때만 켜진다 (그래야 누르면 풀린다).
 * 커서만 있으면 바로 앞 글자의 서식 (맨 앞이면 뒤 글자)
 */
export function styleAt(runs: NoteRun[], start: number, end: number): NoteStyle {
  const styles: NoteStyle[] = [];
  let pos = 0;
  const from = end > start ? start : Math.max(0, start - 1);
  const to = end > start ? end : from + 1;
  for (const r of runs) {
    const len = runLength(r);
    if (pos < to && pos + len > from && !isObjStyle(r.style)) styles.push(r.style);
    pos += len;
  }
  if (!styles.length) return {};
  const [first, ...rest] = styles;
  const out: NoteStyle = {};
  for (const k of ["bold", "italic", "underline", "mark"] as const) if (styles.every((s) => s[k])) out[k] = true;
  if (first.color && rest.every((s) => s.color === first.color)) out.color = first.color;
  if (first.size && rest.every((s) => s.size === first.size)) out.size = first.size;
  return out;
}
