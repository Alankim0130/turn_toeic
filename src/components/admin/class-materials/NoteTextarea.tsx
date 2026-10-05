"use client";

import { useImperativeHandle, useRef, useState } from "react";
import { CLASS_MATERIAL_NOTE_MAX, charCount } from "@/lib/class-materials";
import { NOTE_COLORS, NOTE_SIZES, noteWrap, stripNoteTags, type NoteColor, type NoteSize, type NoteWrap } from "@/lib/note-format";
import { MaterialNote } from "@/components/class-materials/MaterialNote";
import { cn } from "@/lib/utils";

const fmt = (n: number) => n.toLocaleString("ko-KR");

/**
 * 수업자료실 안내 · 스크립트 입력칸 — 올리기 · 수정이 함께 쓴다 (2026-10-05 Alan — "여기 안내에 스크립트를 올려줄예정이야. 그래서 글을 쫌 길게 적을 수 있어야해").
 * 글자 수를 늘 보여 주고 5만 자(`CLASS_MATERIAL_NOTE_MAX`)를 넘으면 빨갛게 알린다. **`maxLength` 를 두지 않는다** — 두면 붙여 넣은 스크립트의
 * 뒤가 소리 없이 잘려 학생이 끝이 빠진 스크립트를 받는다. 넘친 채로는 폼이 저장하지 않는다(`noteTooLong` — 서버 액션도 같은 말로 다시 본다).
 * 값은 예전 칸처럼 폼이 ref 로 읽는다.
 *
 * **서식 도구줄** (같은 날 Alan — "색상, 크기, 진하게, 밑줄 등 기본적인 것들") — 글을 골라 누르면 꺾쇠 태그(`[b]…[/b]`)로 감싼다
 * (`note-format.ts`). 칸에는 태그가 그대로 보이므로 `미리보기` 로 학생이 볼 모양을 확인한다. 태그도 글자 수에 든다(DB 가 저장된 글을 센다).
 * 감쌀 때는 `insertText` 로 넣어 되돌리기(Ctrl+Z)가 그대로 된다. 버튼은 누르는 순간 칸의 선택을 빼앗지 않게 `pointerdown` 기본 동작을 막는다.
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
  const inner = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => inner.current as HTMLTextAreaElement);
  const [text, setText] = useState(defaultValue);
  const [preview, setPreview] = useState(false);
  const length = charCount(text);
  const over = length > CLASS_MATERIAL_NOTE_MAX;

  function replaceSelection(make: (selected: string) => { text: string; selectFrom: number; selectTo: number }) {
    const el = inner.current;
    if (!el || disabled) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const { text: next, selectFrom, selectTo } = make(el.value.slice(start, end));
    el.focus();
    el.setSelectionRange(start, end);
    // 되돌리기(Ctrl+Z)가 남는 길 — 안 되는 브라우저에서는 바로 바꿔 넣는다
    let ok = false;
    try {
      ok = document.execCommand("insertText", false, next);
    } catch {}
    if (!ok || el.value.slice(start, start + next.length) !== next) el.setRangeText(next, start, end, "end");
    el.setSelectionRange(start + selectFrom, start + selectTo);
    setText(el.value);
  }

  const wrap = (w: NoteWrap) =>
    replaceSelection((sel) => ({ text: `${w.open}${sel}${w.close}`, selectFrom: w.open.length, selectTo: w.open.length + sel.length }));
  const clear = () =>
    replaceSelection((sel) => {
      const plain = stripNoteTags(sel);
      return { text: plain, selectFrom: 0, selectTo: plain.length };
    });

  return (
    <>
      <div role="toolbar" aria-label="글자 서식" aria-controls={id} className="mb-1.5 flex flex-wrap items-center gap-1">
        <Tool label="굵게" onUse={() => wrap(noteWrap.bold)} disabled={disabled}>
          <span className="font-black">가</span>
        </Tool>
        <Tool label="밑줄" onUse={() => wrap(noteWrap.underline)} disabled={disabled}>
          <span className="underline underline-offset-2">가</span>
        </Tool>
        <Tool label="기울임" onUse={() => wrap(noteWrap.italic)} disabled={disabled}>
          <span className="italic">가</span>
        </Tool>
        <Tool label="형광펜" onUse={() => wrap(noteWrap.mark)} disabled={disabled}>
          <span className="rounded-sm bg-yellow-200 px-0.5 text-ink">가</span>
        </Tool>
        <span aria-hidden className="mx-0.5 h-5 w-px bg-line" />
        {(Object.keys(NOTE_COLORS) as NoteColor[]).map((c) => (
          <Tool key={c} label={`글자 색 ${NOTE_COLORS[c].label}`} onUse={() => wrap(noteWrap.color(c))} disabled={disabled}>
            <span className={cn("block size-4 rounded-full", NOTE_COLORS[c].swatch)} />
          </Tool>
        ))}
        <span aria-hidden className="mx-0.5 h-5 w-px bg-line" />
        {(Object.keys(NOTE_SIZES) as NoteSize[]).map((s) => (
          <Tool key={s} label={`글자 크기 ${NOTE_SIZES[s].label}`} onUse={() => wrap(noteWrap.size(s))} disabled={disabled} wide>
            {NOTE_SIZES[s].label}
          </Tool>
        ))}
        <Tool label="고른 부분 서식 지우기" onUse={clear} disabled={disabled} wide>
          서식 지우기
        </Tool>
        <button
          type="button"
          aria-pressed={preview}
          onClick={() => setPreview((v) => !v)}
          className={cn(
            "ml-auto rounded-lg border px-2.5 py-1 text-xs font-bold transition",
            preview ? "border-brand-600 bg-brand-600 text-white" : "border-line bg-white text-ink-soft hover:border-brand-300",
          )}
        >
          미리보기
        </button>
      </div>
      <textarea
        id={id}
        ref={inner}
        rows={6}
        defaultValue={defaultValue}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={over || undefined}
        aria-describedby={`${id}-count`}
        onChange={(e) => setText(e.currentTarget.value)}
        className={cn("input min-h-32 resize-y !py-2 text-sm leading-relaxed", over && "!border-red-400 focus:!ring-red-100")}
      />
      <p id={`${id}-count`} className={cn("mt-1 text-right text-[11px] tabular-nums", over ? "font-bold text-red-600" : "text-mist")}>
        {over && <>{fmt(length - CLASS_MATERIAL_NOTE_MAX)}자를 줄여 주세요 · </>}
        {fmt(length)} / {fmt(CLASS_MATERIAL_NOTE_MAX)}자
      </p>
      {preview && (
        <div className="mt-1.5">
          <p className="mb-1 text-[11px] font-bold text-mist">학생에게 이렇게 보여요</p>
          {text.trim() ? (
            <MaterialNote note={text} className="bg-brand-50" />
          ) : (
            <p className="rounded-xl bg-brand-50 px-3 py-2 text-sm text-mist">안내를 적으면 여기에 보여요</p>
          )}
        </div>
      )}
    </>
  );
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
