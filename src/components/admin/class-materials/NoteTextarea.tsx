"use client";

import { useEffect, useImperativeHandle, useRef, useState } from "react";
import { CLASS_MATERIAL_NOTE_MAX, charCount } from "@/lib/class-materials";
import {
  NOTE_COLORS,
  NOTE_SIZES,
  applyNoteChange,
  parseNote,
  runClassName,
  runsToNote,
  normalizeRuns,
  spliceRuns,
  type NoteChange,
  type NoteColor,
  type NoteRun,
  type NoteSize,
  type NoteStyle,
} from "@/lib/note-format";
import { cn } from "@/lib/utils";

const fmt = (n: number) => n.toLocaleString("ko-KR");

/**
 * 수업자료실 안내 · 스크립트 입력칸 — 올리기 · 수정이 함께 쓴다 (2026-10-05 Alan — "여기 안내에 스크립트를 올려줄예정이야. 그래서 글을 쫌 길게 적을 수 있어야해").
 * 글자 수를 늘 보여 주고 5만 자(`CLASS_MATERIAL_NOTE_MAX`)를 넘으면 빨갛게 알린다. **잘라 넣지 않는다** — 붙여 넣은 스크립트의 뒤가 소리 없이 잘리면
 * 학생이 끝이 빠진 스크립트를 받는다. 넘친 채로는 폼이 저장하지 않는다(`noteTooLong` — 서버 액션도 같은 말로 다시 본다).
 *
 * **서식이 바로 보이는 편집기** (같은 날 Alan — "색상, 크기, 진하게, 밑줄 등" → "강사화면에 코드로 보이고 미리보기에는 제대로 나오고 있어.
 * 이러면 강사들이 헷갈릴것 같아. 바로 미리보기처럼 보여주면 좋겠어"):
 * - 칸은 `contentEditable` 이고 글자가 학생 화면과 같은 모양(`runClassName`)으로 보인다. 저장하는 값은 그대로 꺾쇠 태그 글이다(`runsToNote`) —
 *   폼은 예전처럼 ref 의 `.value` 를 읽는다(숨은 textarea).
 * - 서식은 **우리 조각 모델로만** 건다(`applyNoteChange`) — 브라우저 `execCommand("bold")` 는 `<b>`·`<font>` 를 제멋대로 만든다.
 *   칸을 다시 그리는 것은 버튼 · 줄바꿈 · 붙여 넣기 때뿐이다 — **글자를 치는 동안 다시 그리면 한글 조합이 깨진다.**
 * - 붙여 넣기는 글자만 받는다(다른 곳의 색 · 글꼴이 딸려 오지 않게). 줄바꿈은 글자 `\n` 으로 넣는다(브라우저마다 `<div>` · `<br>` 이 달라서).
 * - 버튼은 누르는 순간 칸의 선택을 빼앗지 않게 `pointerdown` 기본 동작을 막고, 그래도 놓치는 휴대폰을 위해 마지막 선택을 기억해 둔다.
 * - 같은 버튼을 다시 누르면 그 서식이 풀린다. Ctrl(⌘)+B · U · I 도 된다. 글자를 고르지 않고 누르면 "글자를 먼저 골라 주세요".
 */
export function NoteTextarea({
  id,
  ref,
  defaultValue = "",
  disabled,
  placeholder,
}: {
  id: string;
  ref?: React.Ref<HTMLTextAreaElement>;
  defaultValue?: string;
  disabled?: boolean;
  placeholder?: string;
}) {
  const hidden = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => hidden.current as HTMLTextAreaElement);
  const editor = useRef<HTMLDivElement>(null);
  const lastRange = useRef<[number, number] | null>(null);
  const [value, setValue] = useState(defaultValue);
  const [hint, setHint] = useState<string | null>(null);
  const length = charCount(value);
  const over = length > CLASS_MATERIAL_NOTE_MAX;

  function commit(runs: NoteRun[]) {
    const note = runsToNote(runs);
    if (hidden.current) hidden.current.value = note;
    setValue(note);
  }

  // 처음 한 번 그린다 — 그 뒤로는 칸이 스스로 글자를 받는다
  useEffect(() => {
    if (editor.current) paint(editor.current, normalizeRuns(parseNote(defaultValue)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 칸 안의 선택을 기억해 둔다 — 버튼을 누를 때 선택이 풀리는 휴대폰 대비
  useEffect(() => {
    const onSelect = () => {
      const el = editor.current;
      const r = el && readSelection(el);
      if (r) lastRange.current = r;
    };
    document.addEventListener("selectionchange", onSelect);
    return () => document.removeEventListener("selectionchange", onSelect);
  }, []);

  function current(): NoteRun[] {
    return editor.current ? readRuns(editor.current) : [];
  }

  function change(c: NoteChange) {
    const el = editor.current;
    if (!el || disabled) return;
    const range = readSelection(el) ?? lastRange.current;
    if (!range || range[0] === range[1]) {
      setHint("서식을 넣을 글자를 먼저 골라 주세요.");
      return;
    }
    setHint(null);
    const runs = applyNoteChange(current(), range[0], range[1], c);
    paint(el, runs);
    el.focus();
    writeSelection(el, range[0], range[1]);
    commit(runs);
  }

  function insert(text: string) {
    const el = editor.current;
    if (!el || disabled) return;
    const range = readSelection(el) ?? lastRange.current ?? [0, 0];
    const runs = spliceRuns(current(), range[0], range[1], text);
    paint(el, runs);
    const caret = range[0] + Array.from(text).length;
    writeSelection(el, caret, caret);
    commit(runs);
  }

  return (
    <>
      <textarea ref={hidden} defaultValue={defaultValue} hidden readOnly tabIndex={-1} aria-hidden />
      <div role="toolbar" aria-label="글자 서식" aria-controls={id} className="mb-1.5 flex flex-wrap items-center gap-1">
        <Tool label="굵게 (Ctrl+B)" onUse={() => change({ kind: "flag", flag: "bold" })} disabled={disabled}>
          <span className="font-black">가</span>
        </Tool>
        <Tool label="밑줄 (Ctrl+U)" onUse={() => change({ kind: "flag", flag: "underline" })} disabled={disabled}>
          <span className="underline underline-offset-2">가</span>
        </Tool>
        <Tool label="기울임 (Ctrl+I)" onUse={() => change({ kind: "flag", flag: "italic" })} disabled={disabled}>
          <span className="italic">가</span>
        </Tool>
        <Tool label="형광펜" onUse={() => change({ kind: "flag", flag: "mark" })} disabled={disabled}>
          <span className="rounded-sm bg-yellow-200 px-0.5 text-ink">가</span>
        </Tool>
        <span aria-hidden className="mx-0.5 h-5 w-px bg-line" />
        {(Object.keys(NOTE_COLORS) as NoteColor[]).map((c) => (
          <Tool key={c} label={`글자 색 ${NOTE_COLORS[c].label}`} onUse={() => change({ kind: "color", color: c })} disabled={disabled}>
            <span className={cn("block size-4 rounded-full", NOTE_COLORS[c].swatch)} />
          </Tool>
        ))}
        <span aria-hidden className="mx-0.5 h-5 w-px bg-line" />
        {(Object.keys(NOTE_SIZES) as NoteSize[]).map((s) => (
          <Tool key={s} label={`글자 크기 ${NOTE_SIZES[s].label}`} onUse={() => change({ kind: "size", size: s })} disabled={disabled} wide>
            {NOTE_SIZES[s].label}
          </Tool>
        ))}
        <Tool label="고른 부분 서식 지우기" onUse={() => change({ kind: "clear" })} disabled={disabled} wide>
          서식 지우기
        </Tool>
      </div>
      <div
        id={id}
        ref={editor}
        role="textbox"
        aria-multiline
        aria-invalid={over || undefined}
        aria-describedby={`${id}-count`}
        aria-disabled={disabled || undefined}
        contentEditable={!disabled}
        suppressContentEditableWarning
        data-placeholder={placeholder}
        data-empty={value === "" || undefined}
        onInput={(e) => {
          const runs = readRuns(e.currentTarget);
          commit(runs);
          setHint(null);
        }}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === "Enter") {
            e.preventDefault();
            insert("\n");
            return;
          }
          if (e.metaKey || e.ctrlKey) {
            const flag = ({ b: "bold", u: "underline", i: "italic" } as const)[e.key.toLowerCase() as "b" | "u" | "i"];
            if (flag) {
              e.preventDefault();
              change({ kind: "flag", flag });
            }
          }
        }}
        onPaste={(e) => {
          e.preventDefault();
          insert(e.clipboardData.getData("text/plain").replace(/\r\n?/g, "\n"));
        }}
        onDrop={(e) => e.preventDefault()}
        className={cn(
          "input min-h-32 max-h-[60vh] overflow-y-auto resize-y !py-2 text-sm leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere] text-ink-soft",
          "data-[empty]:before:pointer-events-none data-[empty]:before:text-mist data-[empty]:before:content-[attr(data-placeholder)]",
          disabled && "opacity-60",
          over && "!border-red-400 focus:!ring-red-100",
        )}
      />
      <p id={`${id}-count`} className={cn("mt-1 flex justify-between gap-2 text-[11px] tabular-nums", over ? "font-bold text-red-600" : "text-mist")}>
        <span className={cn(hint && "font-bold text-brand-700")}>{hint ?? "글자를 골라 위 버튼을 누르면 학생 화면과 같은 모양으로 바로 바뀌어요."}</span>
        <span className="shrink-0">
          {over && <>{fmt(length - CLASS_MATERIAL_NOTE_MAX)}자를 줄여 주세요 · </>}
          {fmt(length)} / {fmt(CLASS_MATERIAL_NOTE_MAX)}자
        </span>
      </p>
    </>
  );
}

/* ── 칸(DOM) ↔ 조각 ── */

/** 조각마다 서식을 data- 로 적어 두어 다시 읽을 때 쓴다 (클래스는 보이는 모양만) */
function paint(root: HTMLElement, runs: NoteRun[]) {
  root.replaceChildren();
  for (const r of runs) {
    const cls = runClassName(r.style);
    if (!cls) {
      root.append(document.createTextNode(r.text));
      continue;
    }
    const span = document.createElement("span");
    span.className = cls;
    span.dataset.note = JSON.stringify(r.style);
    span.textContent = r.text;
    root.append(span);
  }
  // 끝이 줄바꿈이면 빈 줄이 보이도록 받침 하나 (글자로 세지 않는다)
  if (runs.at(-1)?.text.endsWith("\n")) {
    const br = document.createElement("br");
    br.dataset.sentinel = "1";
    root.append(br);
  }
}

function styleOfNode(node: Node, root: HTMLElement): NoteStyle {
  let style: NoteStyle = {};
  for (let el = node.parentElement; el && el !== root; el = el.parentElement) {
    if (el.dataset.note) {
      try {
        style = { ...(JSON.parse(el.dataset.note) as NoteStyle), ...style };
      } catch {}
    }
  }
  return style;
}

const isBlock = (n: Node) => n instanceof HTMLElement && /^(DIV|P|LI)$/.test(n.tagName);

/**
 * 칸을 차례로 훑는다 — 글자 · 줄바꿈(`<br>` · 브라우저가 만든 `<div>`)을 하나의 글로 본다.
 * `stop` 지점(선택의 끝점)을 만나면 그때까지 센 글자 수를 돌려준다
 */
function walk(root: HTMLElement, visit: (text: string, node: Node) => void, stop?: { node: Node; offset: number }): number | null {
  let count = 0;
  let found: number | null = null;
  const chars = (s: string) => Array.from(s).length;
  const emit = (text: string, node: Node) => {
    visit(text, node);
    count += chars(text);
  };
  const rec = (node: Node) => {
    if (found !== null) return;
    if (stop && node === stop.node && node.nodeType === Node.TEXT_NODE) {
      found = count + chars((node.textContent ?? "").slice(0, stop.offset));
      return;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      emit(node.textContent ?? "", node);
      return;
    }
    if (node instanceof HTMLBRElement) {
      // 받침 · 블록 끝의 채움 <br>(브라우저가 빈 줄을 세우려고 넣는다)은 줄바꿈이 아니다
      if (!node.dataset.sentinel && node.nextSibling) emit("\n", node);
      return;
    }
    if (node !== root && isBlock(node) && count > 0) emit("\n", node);
    node.childNodes.forEach((child, i) => {
      if (found !== null) return;
      if (stop && node === stop.node && i === stop.offset) found = count;
      else rec(child);
    });
    if (found === null && stop && node === stop.node && stop.offset >= node.childNodes.length) found = count;
  };
  rec(root);
  return found;
}

function readRuns(root: HTMLElement): NoteRun[] {
  const runs: NoteRun[] = [];
  walk(root, (text, node) => runs.push({ text, style: text === "\n" ? {} : styleOfNode(node, root) }));
  // 줄바꿈은 앞 글자 서식을 잇는다 (태그가 줄마다 끊기지 않게)
  for (let i = 1; i < runs.length; i++) if (runs[i].text === "\n") runs[i].style = runs[i - 1].style;
  return normalizeRuns(runs);
}

function readSelection(root: HTMLElement): [number, number] | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const r = sel.getRangeAt(0);
  if (!root.contains(r.startContainer) || !root.contains(r.endContainer)) return null;
  const a = walk(root, () => {}, { node: r.startContainer, offset: r.startOffset }) ?? 0;
  const b = walk(root, () => {}, { node: r.endContainer, offset: r.endOffset }) ?? a;
  return [Math.min(a, b), Math.max(a, b)];
}

/** 다시 그린 칸에 선택을 되살린다 — 칸에는 글자 노드만 있다(받침 `<br>` 빼고) */
function writeSelection(root: HTMLElement, start: number, end: number) {
  const sentinel = root.lastChild instanceof HTMLBRElement && root.lastChild.dataset.sentinel ? root.lastChild : null;
  const total = Array.from(root.textContent ?? "").length;
  const point = (target: number): [Node, number] => {
    // 끝의 빈 새 줄 — 받침 앞에 커서를 둔다
    if (sentinel && target >= total) return [root, root.childNodes.length - 1];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let pos = 0;
    let last: Text | null = null;
    for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
      const chars = Array.from(n.data);
      if (target <= pos + chars.length) return [n, chars.slice(0, target - pos).join("").length];
      pos += chars.length;
      last = n;
    }
    return last ? [last, last.data.length] : [root, root.childNodes.length];
  };
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  const [sn, so] = point(start);
  const [en, eo] = point(end);
  range.setStart(sn, so);
  range.setEnd(en, eo);
  sel.removeAllRanges();
  sel.addRange(range);
}

function Tool({
  label,
  onUse,
  disabled,
  wide,
  children,
}: {
  label: string;
  onUse: () => void;
  disabled?: boolean;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onPointerDown={(e) => e.preventDefault()}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onUse}
      className={cn(
        "inline-flex h-8 items-center justify-center rounded-lg border border-line bg-white text-sm text-ink transition hover:border-brand-300 hover:bg-brand-50 disabled:opacity-50",
        wide ? "px-2 text-xs font-bold" : "w-8",
      )}
    >
      {children}
    </button>
  );
}
