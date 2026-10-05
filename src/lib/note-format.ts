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
