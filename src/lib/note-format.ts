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
 *   칸에는 글자(줄바꿈은 `\n`, `[` · `\` 는 앞에 `\`) · 합친 칸(rowspan · colspan) · 정렬(가운데 · 오른쪽) · 머리칸(`th`)을 둔다.
 *   다른 곳에서 붙여 넣은 표의 색 · 굵기 · 글꼴은 글자 붙여 넣기처럼 따라오지 않는다.
 *   못 읽는 표는 글자 그대로 보인다(태그와 같은 규칙). 붙여 넣은 HTML 을 표로 바꾸는 일은 `note-paste.ts`.
 * - **표 칸 글자 서식**(2026-10-19 Alan — "표를 복사해서 넣고 난 뒤에 표 안에 정답을 진하게 표시하고 싶은데, 본문내용을 마우스로 쭈욱 드래그가 안잡혀") —
 *   편집기에서 칸 글자를 골라 굵게 · 밑줄 · 기울임 · 형광펜 · 색 · 크기를 건다. 칸 안에 안내 글과 같은 태그로 적는다: `[td](A) [b]Reduce electricity use[/b][/td]`.
 *   칸 글자의 `[` 는 처음부터 늘 `\[` 라(예전 표도) 칸 안의 맨 `[` 는 태그뿐이다 — 예전 글은 그대로 읽히고, 아는 태그 · 짝이 맞는 것만 받는다(아니면 그 표는 글자 그대로).
 *   글 모델에서는 칸의 `runs`(서식 조각 — 이은 글자가 늘 `text`)이고, 서식이 없는 칸은 예전처럼 `text` 뿐이다.
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
/**
 * 표 한 칸 — 글자(줄바꿈) · 글자 서식 · 합친 칸 · 정렬 · 머리칸(th).
 * `runs` 는 칸 글자를 서식째 나눈 조각이다 (2026-10-19) — 이은 글자가 늘 `text` 와 같고, 서식이 하나도 없으면 두지 않는다.
 * 그림 · 표는 칸 안에 없다. 글자만 필요한 곳(엑셀 글 · 크기 · 비교)은 그대로 `text` 를 읽고, 서식이 필요한 곳은 `cellRuns` 로 읽는다
 */
export type NoteCell = { text: string; runs?: NoteRun[]; rowspan?: number; colspan?: number; align?: NoteCellAlign; head?: boolean };
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
/** 그 자리의 `[` 가 태그로 읽히나 (글자를 적을 때 — `lineNote`) */
const TAG_AT = new RegExp(TAG.source, "y");
/**
 * **글자로 적은 `[`** — 저장할 때 그 바로 뒤에 보이지 않는 글자(WORD JOINER, U+2060)를 붙여 태그 · 표로 읽히지 않게 하고, 읽을 때 뗀다
 * (2026-10-22 오류 점검 — 발음 기호 `[b]` · `[i]` · `[u]` 나 글자로 적은 `[center]` · `[img=…]` · `[table]` 이 저장한 뒤 다시 읽으면
 * 서식 태그로 읽혀 굵게 · 기울임 · 정렬로 바뀌거나 그 줄의 표가 글자로 풀렸다. 편집기는 다시 열 때까지 글자로 보여 줘 쓴 사람은 몰랐다).
 * `\[` 로 이스케이프하지 않은 것은 **예전 글 때문**이다 — 예전 글에는 `\` 바로 뒤에 진짜 태그가 오는 글(₩ 를 `\` 로 친 `\[b]15,000[/b]`)이 있을 수 있어
 * `\[` 를 글자로 읽기 시작하면 그 글의 서식이 풀린다. U+2060 은 예전 글에 없고 화면에도 안 보인다 (보이지 않는 글자 — 혹시 남아도 모양은 같다)
 */
const LITERAL_MARK = "⁠";
const LITERAL_BRACKET = `[${LITERAL_MARK}`;

type Open = { tag: string; style: NoteStyle };

const isColor = (v: string | undefined): v is NoteColor => !!v && Object.hasOwn(NOTE_COLORS, v);
const isSize = (v: string | undefined): v is NoteSize => !!v && Object.hasOwn(NOTE_SIZES, v);

function styleOf(stack: Open[]): NoteStyle {
  const s: NoteStyle = {};
  for (const o of stack) Object.assign(s, o.style);
  return s;
}

/**
 * 글자 서식 태그 하나를 쌓는다 — 여는 태그는 아는 서식 · 아는 값만, 닫는 태그는 같은 이름이 열려 있을 때만. 받으면 true
 * (안내 글과 표 칸이 같은 규칙으로 읽는다)
 */
function stackTag(stack: Open[], close: boolean, tag: string, value: string | undefined): boolean {
  if (close) {
    if (value !== undefined) return false;
    const i = stack.findLastIndex((o) => o.tag === tag);
    if (i < 0) return false;
    stack.splice(i, 1);
    return true;
  }
  if (tag in FLAGS) {
    if (value !== undefined) return false;
    stack.push({ tag, style: { [FLAGS[tag as FlagTag]]: true } });
    return true;
  }
  if (tag === "color" && isColor(value)) {
    stack.push({ tag, style: { color: value } });
    return true;
  }
  if (tag === "size" && isSize(value)) {
    stack.push({ tag, style: { size: value } });
    return true;
  }
  return false;
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
  const emit = (raw: string, style: NoteStyle) => {
    // 글자로 적은 `[` 의 보이지 않는 표시는 뗀다 (`LITERAL_MARK`)
    const text = raw.includes(LITERAL_BRACKET) ? raw.replaceAll(LITERAL_BRACKET, "[") : raw;
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
    } else ok = stackTag(stack, !!close, tag, value);
    if (!ok) emit(whole, styleOf(stack));
  }
  emit(note.slice(at), styleOf(stack));
  return { runs, aligns };
}

/** 서식을 뺀 글 — 접을지 · 몇 자인지는 학생에게 보이는 글자로 센다 */
export const runsText = (runs: readonly NoteRun[]) => runs.map((r) => r.text).join("");

/** 앞뒤 빈칸 · 빈 줄을 걷어 낸 조각 (`note.trim()` 과 같은 뜻) */
export function trimRuns(runs: NoteRun[]): NoteRun[] {
  const out = runs.map((r) => ({ ...r }));
  while (out.length && !(out[0].text = out[0].text.trimStart())) out.shift();
  while (out.length && !(out[out.length - 1].text = out[out.length - 1].text.trimEnd())) out.pop();
  return out;
}

/**
 * 앞에서 `count` 글자(코드 포인트)만 — 접힌 안내의 앞부분을 서식째 보여 준다.
 * 조각에 붙은 다른 칸(링크 표시 — `note-links.ts`)도 그대로 따라간다
 */
export function sliceRuns<T extends NoteRun>(runs: readonly T[], count: number): T[] {
  const out: T[] = [];
  let left = count;
  for (const r of runs) {
    if (left <= 0) break;
    const chars = Array.from(r.text);
    out.push({ ...r, text: chars.slice(0, left).join("") });
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

/** 줄마다 자른 조각 — 보여 줄 때 줄마다 정렬이 다르다. 조각에 붙은 다른 칸(링크 표시)도 그대로 따라간다 */
export function splitLines<T extends NoteRun>(runs: readonly T[]): T[][] {
  const lines: T[][] = [[]];
  for (const r of runs) {
    const parts = r.text.split("\n");
    parts.forEach((part, k) => {
      if (k > 0) lines.push([]);
      if (part) lines[lines.length - 1].push({ ...r, text: part });
    });
  }
  return lines;
}

/** 글에 든 그림 경로 — 서명 주소를 만들고, 공지를 고칠 때 빠진 그림을 저장소에서 지운다 */
export function noteImagePaths(note: string): string[] {
  return [...new Set(parseNote(note).flatMap((r) => (r.style.img ? [r.style.img.path] : [])))];
}

/**
 * 글 속 그림 경로를 바꾼다 (2026-10-21 — 직원 게시판 ↔ 수업자료실 옮기기: 사진을 다른 버킷으로 복사하면 경로가 새로 생긴다).
 * **그림 태그만** 바꾸고 나머지 글자는 한 자도 건드리지 않는다 (너비 `w=` 도 그대로). `parseNote` 와 같은 토큰으로 훑어서
 * 표 안의 `[img=…]` 꼴 글자(칸 글자 — 그림이 아니다)는 그대로 둔다. `paths` 에 없는 그림도 그대로
 */
export function rewriteNoteImages(note: string, paths: ReadonlyMap<string, string>): string {
  if (paths.size === 0) return note;
  return note.replace(TOKEN, (match: string, ...groups: (string | undefined)[]) => {
    // TOKEN = 표 덩어리(1) | 태그 — 닫음(2) · 이름(3) · 값(4) · 그림 경로(5) · 그림 너비(6)
    const [, , , , path, width] = groups;
    const to = path !== undefined ? paths.get(path) : undefined;
    return to ? `[img=${to}${width !== undefined ? ` w=${width}` : ""}]` : match;
  });
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

/** 글자 조각 하나를 감쌀 태그들 (여는 순서 — 닫을 때는 거꾸로) */
function wrapsOf(s: NoteStyle): NoteWrap[] {
  const wraps: NoteWrap[] = [];
  if (s.bold) wraps.push(noteWrap.bold);
  if (s.italic) wraps.push(noteWrap.italic);
  if (s.underline) wraps.push(noteWrap.underline);
  if (s.mark) wraps.push(noteWrap.mark);
  if (s.color) wraps.push(noteWrap.color(s.color));
  if (s.size) wraps.push(noteWrap.size(s.size));
  return wraps;
}

/** 글자를 그 조각의 태그로 감싼다 */
function wrapText(s: NoteStyle, text: string): string {
  const wraps = wrapsOf(s);
  return wraps.map((w) => w.open).join("") + text + wraps.reverse().map((w) => w.close).join("");
}

/**
 * 한 줄 → 저장할 글. 정렬 표시 · 서식 태그 · 그림 · 표는 그대로 적고, 글자의 `[` 는 **다시 읽을 때 태그 · 표로 읽힐 자리만**
 * 바로 뒤에 `LITERAL_MARK` 를 붙인다 (2026-10-22 오류 점검) — 그 자리에서 태그(`TAG`)나 `[table]` 로 시작하는 `[` 다.
 * 태그는 줄 · 조각을 넘지 않고(이름 · 값에 `[` 가 없다) 서식이 다른 조각 사이에는 늘 태그가 끼므로 한 번 훑으면 된다.
 * 그래서 `[b]와 [v] 발음`(발음 기호) · 글자로 적은 `[center]` · `[img=…]` · `[table]` 이 다시 읽어도 글자이고, 그런 글자가 없는 글은 예전과 같다
 */
function lineNote(line: readonly NoteRun[], align: NoteAlign): string {
  const parts: { s: string; text: boolean }[] = [];
  if (align !== "left") parts.push({ s: `[${align}]`, text: false });
  for (const r of line) {
    if (!r.text) continue;
    const s = r.style;
    if (s.img) parts.push({ s: `[img=${s.img.path}${s.img.w === 100 ? "" : ` w=${s.img.w}`}]`, text: false });
    else if (s.table) parts.push({ s: tableToNote(s.table), text: false });
    else {
      // 조각마다 여는 · 닫는 태그를 따로 붙인다 (겹침이 없어 다시 읽으면 같은 조각이 나온다)
      const wraps = wrapsOf(s);
      for (const w of wraps) parts.push({ s: w.open, text: false });
      parts.push({ s: r.text, text: true });
      for (const w of wraps.reverse()) parts.push({ s: w.close, text: false });
    }
  }
  const raw = parts.map((p) => p.s).join("");
  if (!parts.some((p) => p.text && p.s.includes("["))) return raw;
  let out = "";
  let at = 0;
  for (const p of parts) {
    if (!p.text) {
      out += p.s;
      at += p.s.length;
      continue;
    }
    for (let k = 0; k < p.s.length; k++, at++) {
      const c = p.s[k];
      if (c !== "[") {
        out += c;
        continue;
      }
      TAG_AT.lastIndex = at;
      out += raw.startsWith("[table]", at) || TAG_AT.test(raw) ? LITERAL_BRACKET : "[";
    }
  }
  return out;
}

/** 조각 → 저장할 글 (정렬 표시 없이 — 줄이 여럿이어도 한 덩어리로) */
export function runsToNote(runs: NoteRun[]): string {
  return lineNote(runs, "left");
}

/** 글 한 편 → 저장할 글. 줄마다 정렬 표시를 맨 앞에 */
export function docToNote(doc: NoteDoc): string {
  return splitLines(doc.runs)
    .map((line, i) => lineNote(line, doc.aligns[i] ?? "left"))
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

/**
 * 글자에 걸 수 있는 서식만 — 굵게 · 기울임 · 밑줄 · 형광펜 · 아는 색 · 아는 크기 (그림 · 표 · 모르는 값은 뺀다 — 밖에서 온 값도 이것만 받는다).
 * 칸 글자와 붙여 넣은 우리 편집기 글(`data-note`, `note-paste.ts`)이 쓴다
 */
export function textStyle(s: NoteStyle | null | undefined): NoteStyle {
  const out: NoteStyle = {};
  if (!s || typeof s !== "object") return out;
  for (const k of ["bold", "italic", "underline", "mark"] as const) if (s[k] === true) out[k] = true;
  if (typeof s.color === "string" && isColor(s.color)) out.color = s.color;
  if (typeof s.size === "string" && isSize(s.size)) out.size = s.size;
  return out;
}

const hasStyle = (s: NoteStyle) => Object.keys(s).length > 0;

/** 서식을 가진 칸 · 격자 셀 (`NoteCell` · `GridCell`) */
type StyledText = { text: string; runs?: NoteRun[] };

/** 칸 글자 조각 — 서식이 없으면 글자 한 조각, 빈 칸은 빈 배열. `runs` 가 글자와 어긋나면(다른 곳에서 글자만 고친 값) 글자만 믿는다 */
export function cellRuns(c: StyledText): NoteRun[] {
  if (c.runs?.length && runsText(c.runs) === c.text) return c.runs;
  return c.text ? [{ text: c.text, style: {} }] : [];
}

/** 칸 글자를 조각으로 바꾼 칸 — `text` 는 조각을 이은 글자, 서식이 하나도 없으면 `runs` 를 두지 않는다 (예전 칸과 같은 모양) */
export function cellWithRuns<T extends StyledText>(c: T, runs: readonly NoteRun[]): T {
  const clean = normalizeRuns(runs.map((r) => ({ text: r.text, style: textStyle(r.style) })));
  const out: T = { ...c, text: runsText(clean) };
  delete out.runs;
  if (clean.some((r) => hasStyle(r.style))) out.runs = clean;
  return out;
}

/** 칸 글자 → 칸 안에 적을 글 — 서식은 안내 글과 같은 태그로 감싸고 글자는 `escapeCell` (그래서 태그의 `[` 와 글자의 `\[` 가 갈린다) */
const cellNote = (c: NoteCell) => cellRuns(c).map((r) => wrapText(r.style, escapeCell(r.text))).join("");

/** 표 → 저장할 글 (한 줄). 기본값(rowspan · colspan 1 · 왼쪽 정렬 · td)은 적지 않는다 */
export function tableToNote(t: NoteTable): string {
  let out = "[table]";
  for (const row of t.rows) {
    out += "[tr]";
    for (const c of row) {
      const tag = c.head ? "th" : "td";
      const attrs =
        (c.rowspan && c.rowspan > 1 ? ` rowspan=${c.rowspan}` : "") + (c.colspan && c.colspan > 1 ? ` colspan=${c.colspan}` : "") + (c.align ? ` align=${c.align}` : "");
      out += `[${tag}${attrs}]${cellNote(c)}[/${tag}]`;
    }
    out += "[/tr]";
  }
  return `${out}[/table]`;
}

const CELL_OPEN = /\[(td|th)((?: [a-z]+=[a-z0-9]+)*)\]/y;
/** 칸 글자 속 서식 태그 — 안내 글의 글자 서식과 같은 것만 (줄 정렬 · 그림은 칸 안에 없다) */
const CELL_TAG = /\[(\/?)(b|i|u|mark|color|size)(?:=([a-z]+))?\]/y;

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

/**
 * `[table]` 과 `[/table]` 사이 → 표. 꼴이 틀리거나 상한을 넘으면 null.
 * 칸 글자 속 맨 `[` 는 서식 태그뿐이다(글자의 `[` 는 늘 `\[`) — 모르는 태그 · 짝이 없는 닫기 · 닫지 않은 서식이면 null (그 표는 글자 그대로 보인다)
 */
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
      const runs: NoteRun[] = [];
      const stack: Open[] = [];
      let text = "";
      const flush = () => {
        push(runs, text, styleOf(stack));
        text = "";
      };
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
          if (src.startsWith(close, i)) {
            i += close.length;
            break;
          }
          CELL_TAG.lastIndex = i;
          const t = CELL_TAG.exec(src);
          if (!t) return null;
          flush();
          if (!stackTag(stack, t[1] === "/", t[2], t[3])) return null;
          i = CELL_TAG.lastIndex;
        } else {
          text += ch;
          i += 1;
        }
      }
      flush();
      if (stack.length > 0) return null; // 닫지 않은 서식
      row.push(cellWithRuns({ text: "", ...attrs, ...(m[1] === "th" ? { head: true } : {}) }, runs));
      if (row.length > TABLE_MAX_COLS) return null;
    }
    i += 5;
    rows.push(row);
    cells += row.length;
    if (rows.length > TABLE_MAX_ROWS) return null;
  }
  return cells > 0 ? { rows } : null;
}

/** 칸 글자 다듬기 — 줄바꿈을 `\n` 하나로, 글 속 덩어리 글자(`OBJ`)는 뺀다 (칸에는 그림 · 표가 없다) */
export const cleanCellText = (s: string) => s.replace(/\r\n?/g, "\n").replaceAll(OBJ, "");

/** 표 고치기의 `적용` — 칸 글자를 다듬고(`cleanCellText`) 앞뒤 빈칸 · 빈 줄을 걷는다. 서식은 그대로 남는다 */
export function tidyCell<T extends StyledText>(c: T): T {
  return cellWithRuns(c, trimRuns(cellRuns(c).map((r) => ({ text: cleanCellText(r.text), style: r.style }))));
}

/**
 * 밖에서 온 값(편집기 칸의 data-table · 붙여 넣기) → 표. 꼴이 틀리면 null.
 * 줄 · 칸 수가 상한을 넘으면 받지 않는다 — 붙여 넣기는 그 전에 잘라 둔다(`note-paste.ts`).
 * 칸 서식(`runs`)은 아는 서식만 받고, 이은 글자가 칸 글자와 다르면 버린다 (글자는 남는다)
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
      const { text, runs, rowspan, colspan, align, head } = c as NoteCell;
      let cell: NoteCell = { text: cleanCellText(text) };
      if (Array.isArray(runs) && runs.every((r) => !!r && typeof r === "object" && typeof r.text === "string")) {
        const parts = runs.map((r) => ({ text: cleanCellText(r.text), style: textStyle(r.style) }));
        if (runsText(parts) === cell.text) cell = cellWithRuns(cell, parts);
      }
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

/* ── 표 옮기기 (2026-10-19 Alan — "본문에 표를 삽입하려고 해서 위치 이동을 시킬려고 하니깐 위치이동이 안돼") ── */

/** 덩어리를 놓을 자리 — `line` 째 줄의 앞(before) · 뒤(after)에 제 줄로 선다 */
export type ObjectPlace = { line: number; place: "before" | "after" };

type DocLine = { runs: NoteRun[]; align: NoteAlign };

const docLines = (doc: NoteDoc): DocLine[] => splitLines(doc.runs).map((runs, i) => ({ runs, align: doc.aligns[i] ?? "left" }));
const lineLength = (l: DocLine) => l.runs.reduce((n, r) => n + runLength(r), 0);
/** `index` 째 줄이 시작하는 글자 자리 */
const lineStartOf = (lines: DocLine[], index: number) => lines.slice(0, index).reduce((n, l) => n + lineLength(l) + 1, 0);

function joinLines(lines: DocLine[]): NoteDoc {
  const runs: NoteRun[] = [];
  lines.forEach((l, i) => {
    if (i > 0) runs.push({ text: "\n", style: {} });
    runs.push(...l.runs);
  });
  return { runs: normalizeRuns(runs), aligns: lines.map((l) => l.align) };
}

/** `offset` 자리의 덩어리(표 · 그림)가 몇째 줄 · 그 줄의 몇째 조각인가 */
function findObject(lines: DocLine[], offset: number): { line: number; index: number } | null {
  let pos = 0;
  for (let i = 0; i < lines.length; i++) {
    for (let k = 0; k < lines[i].runs.length; k++) {
      const r = lines[i].runs[k];
      if (pos === offset && isObjStyle(r.style)) return { line: i, index: k };
      pos += runLength(r);
    }
    pos += 1;
  }
  return null;
}

/**
 * `offset` 자리의 덩어리를 글에서 뺀다 — 혼자 있던 줄은 줄째 빠지고, 앞뒤에 글자가 있던 줄은 그 자리에서 두 줄로 나뉜다
 * (표는 칸 폭을 다 차지해 화면에서 그 둘을 가르고 있었다 — 그냥 빼면 두 줄이 한 줄로 붙는다). 덩어리가 없으면 null.
 * `before` · `after` 는 그 줄에서 덩어리 앞 · 뒤에 있던 글자 줄 (없으면 null) — 뺀 뒤 `line` 째부터 차례로 선다
 */
function takeObject(doc: NoteDoc, offset: number) {
  const lines = docLines(doc);
  const at = findObject(lines, offset);
  if (!at) return null;
  const { runs, align } = lines[at.line];
  const part = (rs: NoteRun[]): DocLine | null => (rs.length ? { runs: rs, align } : null);
  const before = part(runs.slice(0, at.index));
  const after = part(runs.slice(at.index + 1));
  const rest = [before, after].filter((l): l is DocLine => l !== null);
  return { total: lines.length, obj: runs[at.index], line: at.line, before, rest, lines: [...lines.slice(0, at.line), ...rest, ...lines.slice(at.line + 1)] };
}

/**
 * 덩어리 하나를 `to` 줄의 앞 · 뒤로 옮긴다 — 옮긴 덩어리는 늘 제 줄에 혼자 선다 (표 넣기 · 붙여 넣기와 같은 규칙).
 * `to.line` 은 옮기기 전의 줄 번호다. 덩어리 줄은 원래 줄의 정렬을 가져간다. 돌려주는 `offset` 은 옮긴 덩어리의 새 자리 · 덩어리가 없으면 null
 */
export function moveObject(doc: NoteDoc, offset: number, to: ObjectPlace): { doc: NoteDoc; offset: number } | null {
  const taken = takeObject(doc, offset);
  if (!taken || !Number.isInteger(to.line) || to.line < 0 || to.line >= taken.total) return null;
  const { lines, obj, line, rest } = taken;
  // 넣을 자리 — 덩어리를 뺀 뒤의 줄 번호로 (원래 줄 자리에는 남은 글자 0 ~ 2 줄이 선다)
  let index: number;
  if (to.line === line) index = to.place === "before" ? line : line + rest.length;
  else {
    const at = to.line < line ? to.line : to.line - 1 + rest.length;
    index = to.place === "before" ? at : at + 1;
  }
  lines.splice(index, 0, { runs: [obj], align: doc.aligns[line] ?? "left" });
  return { doc: joinLines(lines), offset: lineStartOf(lines, index) };
}

/**
 * 위로 · 아래로 한 칸 — 앞(뒤) 줄과 자리를 바꾼다. 같은 줄에 글자가 있으면 먼저 그 글자 위(아래)의 제 줄로 떼어 낸다.
 * 더 갈 데가 없으면(맨 위 · 맨 아래) null
 */
export function objectStep(doc: NoteDoc, offset: number, dir: "up" | "down"): ObjectPlace | null {
  const lines = docLines(doc);
  const at = findObject(lines, offset);
  if (!at) return null;
  const { line, index } = at;
  if (dir === "up") return index > 0 ? { line, place: "before" } : line > 0 ? { line: line - 1, place: "before" } : null;
  return index < lines[line].runs.length - 1 ? { line, place: "after" } : line < lines.length - 1 ? { line: line + 1, place: "after" } : null;
}

/** 덩어리를 뺀다 — 잘라내기. `offset` 은 뺀 자리(커서를 둘 곳 — 앞 글자가 있었으면 그 끝). 덩어리가 없으면 null */
export function removeObject(doc: NoteDoc, offset: number): { doc: NoteDoc; offset: number } | null {
  const taken = takeObject(doc, offset);
  if (!taken) return null;
  const { lines, line, before } = taken;
  if (lines.length === 0) return { doc: { runs: [], aligns: ["left"] }, offset: 0 };
  // 마지막 줄이 통째로 빠졌으면 글 끝
  const caret = line < lines.length ? lineStartOf(lines, line) + (before ? lineLength(before) : 0) : lineStartOf(lines, lines.length) - 1;
  return { doc: joinLines(lines), offset: caret };
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

/** [start, end) 의 글자 서식들 (조각마다 하나) — 그림 · 표는 빼고 */
export function stylesIn(runs: readonly NoteRun[], start: number, end: number): NoteStyle[] {
  const out: NoteStyle[] = [];
  let pos = 0;
  for (const r of runs) {
    const len = runLength(r);
    if (pos < end && pos + len > start && !isObjStyle(r.style)) out.push(r.style);
    pos += len;
  }
  return out;
}

/**
 * 고른 글자들의 서식 → 그 글자들에 걸 바꾸기. 고른 글자가 이미 **다** 그 서식이면 푼다 (굵게를 한 번 더 누르면 풀린다).
 * 표 칸 여럿 · 표 밖 글자를 함께 골라도 한 번에 센다 (2026-10-19) — 칸마다 따로 세면 이미 굵은 칸은 풀리고 다른 칸만 굵어진다
 */
export function noteStyleChanger(change: NoteChange, styles: readonly NoteStyle[]): (s: NoteStyle) => NoteStyle {
  // 고른 글자가 없으면 거는 쪽이다 (빈 목록의 every 는 참이라 그대로 두면 푸는 쪽이 된다)
  const all = (pred: (s: NoteStyle) => boolean) => styles.length > 0 && styles.every(pred);
  if (change.kind === "clear") return () => ({});
  if (change.kind === "flag") {
    const off = all((s) => !!s[change.flag]);
    return (s) => ({ ...s, [change.flag]: off ? undefined : true });
  }
  if (change.kind === "color") {
    const off = all((s) => s.color === change.color);
    return (s) => ({ ...s, color: off ? undefined : change.color });
  }
  const off = all((s) => s.size === change.size);
  return (s) => ({ ...s, size: off ? undefined : change.size });
}

/** [start, end) 의 글자에 `next` 를 건다 — 그림 · 표는 그대로 */
export function restyleRuns(runs: NoteRun[], start: number, end: number, next: (s: NoteStyle) => NoteStyle): NoteRun[] {
  if (end <= start) return runs;
  const [a, i] = splitAt(runs, start);
  const [b, j] = splitAt(a, end);
  return normalizeRuns([
    ...b.slice(0, i),
    ...b.slice(i, j).map((r) => (isObjStyle(r.style) ? r : { text: r.text, style: stripUndefined(next(r.style)) })),
    ...b.slice(j),
  ]);
}

/** 고른 글자 [start, end) 에 서식을 건다. 고른 글자가 이미 다 그 서식이면 푼다 (굵게를 한 번 더 누르면 풀린다) */
export function applyNoteChange(runs: NoteRun[], start: number, end: number, change: NoteChange): NoteRun[] {
  if (end <= start) return runs;
  // 그림 · 표는 서식을 받지 않고, 켜졌나를 셀 때도 빠진다 — 글자와 표를 함께 골라 굵게를 두 번 누르면 풀려야 한다
  const styles = stylesIn(runs, start, end);
  if (styles.length === 0) return runs;
  return restyleRuns(runs, start, end, noteStyleChanger(change, styles));
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
  const from = end > start ? start : Math.max(0, start - 1);
  const to = end > start ? end : from + 1;
  return commonStyle(stylesIn(runs, from, to));
}

/** 서식들이 **모두** 가진 서식 — 도구줄 버튼의 눌린 모양 (표 칸 글자를 함께 골랐을 때도 같은 규칙) */
export function commonStyle(styles: readonly NoteStyle[]): NoteStyle {
  if (!styles.length) return {};
  const [first, ...rest] = styles;
  const out: NoteStyle = {};
  for (const k of ["bold", "italic", "underline", "mark"] as const) if (styles.every((s) => s[k])) out[k] = true;
  if (first.color && rest.every((s) => s.color === first.color)) out.color = first.color;
  if (first.size && rest.every((s) => s.size === first.size)) out.size = first.size;
  return out;
}

/* ── 표 칸 글자 서식 (2026-10-19 Alan — "표 안에 정답을 진하게 표시하고 싶은데, 본문내용을 마우스로 쭈욱 드래그가 안잡혀") ── */

/**
 * 표 칸 안의 고른 글자 — `row` 째 줄의 `index` 째 칸(그 줄에서 시작하는 칸만 센다 — 저장 모양과 같다)에서 [start, end).
 * 자리는 칸 글자의 글자 수(코드 포인트, 줄바꿈 한 글자)다
 */
export type CellRange = { row: number; index: number; start: number; end: number };

const cellOf = (t: NoteTable, r: CellRange): NoteCell | undefined => t.rows[r.row]?.[r.index];

/** 고른 칸 글자의 서식들 */
export function cellStylesIn(t: NoteTable, ranges: readonly CellRange[]): NoteStyle[] {
  return ranges.flatMap((r) => {
    const c = cellOf(t, r);
    return c ? stylesIn(cellRuns(c), r.start, r.end) : [];
  });
}

/** 고른 칸 글자에 `next` 를 건 표 — 고르지 않은 칸 · 글자는 그대로 */
export function restyleCells(t: NoteTable, ranges: readonly CellRange[], next: (s: NoteStyle) => NoteStyle): NoteTable {
  const rows = t.rows.map((row) => [...row]);
  for (const r of ranges) {
    const c = rows[r.row]?.[r.index];
    if (c) rows[r.row][r.index] = cellWithRuns(c, restyleRuns(cellRuns(c), r.start, r.end, next));
  }
  return { rows };
}

/** 고른 칸들의 정렬 (왼쪽 = 표시 없음) — 모두 같으면 그 정렬, 다르면 null */
export function cellsAlign(t: NoteTable, ranges: readonly CellRange[]): NoteAlign | null {
  const aligns = ranges.flatMap((r): NoteAlign[] => {
    const c = cellOf(t, r);
    return c ? [c.align ?? "left"] : [];
  });
  return aligns.length > 0 && aligns.every((a) => a === aligns[0]) ? aligns[0] : null;
}

/** 고른 칸들을 그 정렬로 (왼쪽 = 표시 없음) — 이미 다 그 정렬이면 왼쪽으로 되돌리는 판단은 쓰는 쪽이 한다 (표 여럿을 한 번에 세야 해서) */
export function setCellsAlign(t: NoteTable, ranges: readonly CellRange[], align: NoteAlign): NoteTable {
  const rows = t.rows.map((row) => [...row]);
  for (const r of ranges) {
    const c = rows[r.row]?.[r.index];
    if (!c) continue;
    const next = { ...c };
    if (align === "left") delete next.align;
    else next.align = align;
    rows[r.row][r.index] = next;
  }
  return { rows };
}

/** `offset` 자리의 표 (없으면 null) */
export function tableAt(doc: NoteDoc, offset: number): NoteTable | null {
  let pos = 0;
  for (const r of doc.runs) {
    if (pos === offset) return r.style.table ?? null;
    pos += runLength(r);
    if (pos > offset) return null;
  }
  return null;
}

/**
 * 고른 글자 [start, end) 가 표에 닿았나 — 표를 품었거나 바로 뒤(`end`) 글자가 표 (표 바로 앞에서 끝나는 선택).
 * 편집기는 이런 선택을 지우거나 그 위에 칠 때 브라우저에 맡기지 않고 글 모델로 한다 (2026-10-19 — 크롬이 표 윗줄을 줄바꿈까지 지우다 표를 잃었다).
 * 표 바로 뒤에서 시작하는 선택은 크롬이 제대로 해서 넣지 않는다
 */
export function tableNear(runs: readonly NoteRun[], start: number, end: number): boolean {
  let pos = 0;
  for (const r of runs) {
    if (pos > end) return false;
    if (r.style.table && pos >= start) return true;
    pos += runLength(r);
  }
  return false;
}

/**
 * 칸 글자를 고친 뒤의 조각 — 표 고치기 팝업의 글자 칸(서식이 보이지 않는 textarea)에서 글자를 고쳐도 서식이 남게.
 * 앞뒤로 같은 글자는 서식째 그대로 두고, 바뀐 자리에 새로 든 글자는 바뀌기 전 그 자리 첫 글자(지운 글자가 없으면 바로 앞 글자, 맨 앞이면 뒤 글자)의 서식을 잇는다 — 워드처럼
 */
export function editRunsText(runs: NoteRun[], next: string): NoteRun[] {
  const a = Array.from(runsText(runs));
  const b = Array.from(next);
  let p = 0;
  while (p < a.length && p < b.length && a[p] === b[p]) p++;
  let s = 0;
  while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
  const cut = a.length - s;
  const added = b.slice(p, b.length - s).join("");
  if (p === cut && !added) return runs;
  const from = p < cut ? p : Math.max(0, p - 1);
  const style = stylesIn(runs, from, from + 1)[0] ?? {};
  return spliceRuns(runs, p, cut, added ? [{ text: added, style: { ...style } }] : []);
}
