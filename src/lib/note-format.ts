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

export type NoteStyle = {
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

const TAG = /\[(\/?)(b|i|u|mark|color|size)(?:=([a-z]+))?\]/g;

type Open = { tag: string; style: NoteStyle };

const isColor = (v: string | undefined): v is NoteColor => !!v && Object.hasOwn(NOTE_COLORS, v);
const isSize = (v: string | undefined): v is NoteSize => !!v && Object.hasOwn(NOTE_SIZES, v);

function styleOf(stack: Open[]): NoteStyle {
  const s: NoteStyle = {};
  for (const o of stack) Object.assign(s, o.style);
  return s;
}

const sameStyle = (a: NoteStyle, b: NoteStyle) =>
  !!a.bold === !!b.bold && !!a.italic === !!b.italic && !!a.underline === !!b.underline && !!a.mark === !!b.mark && a.color === b.color && a.size === b.size;

function push(runs: NoteRun[], text: string, style: NoteStyle) {
  if (!text) return;
  const last = runs.at(-1);
  if (last && sameStyle(last.style, style)) last.text += text;
  else runs.push({ text, style });
}

/** 저장된 글 → 글자 조각. 같은 서식이 이어지면 한 조각으로 합친다 */
export function parseNote(note: string): NoteRun[] {
  const runs: NoteRun[] = [];
  const stack: Open[] = [];
  let at = 0;
  for (const m of note.matchAll(TAG)) {
    const [whole, close, tag, value] = m;
    push(runs, note.slice(at, m.index), styleOf(stack));
    at = m.index + whole.length;

    let ok = false;
    if (close) {
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
    if (!ok) push(runs, whole, styleOf(stack));
  }
  push(runs, note.slice(at), styleOf(stack));
  return runs;
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
export function spliceRuns(runs: NoteRun[], start: number, end: number, text: string): NoteRun[] {
  const [a, i] = splitAt(runs, start);
  const [b, j] = splitAt(a, end);
  const before = b.slice(0, i);
  const style = before.at(-1)?.style ?? b[i]?.style ?? {};
  return normalizeRuns([...before, { text, style: { ...style } }, ...b.slice(j)]);
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
  const all = (pred: (s: NoteStyle) => boolean) => middle.every((r) => pred(r.style));
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
  const clean = (s: NoteStyle): NoteStyle => Object.fromEntries(Object.entries(s).filter(([, v]) => v !== undefined && v !== false));
  return normalizeRuns([...b.slice(0, i), ...middle.map((r) => ({ text: r.text, style: clean(next(r.style)) })), ...b.slice(j)]);
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
    if (pos < to && pos + len > from) styles.push(r.style);
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
