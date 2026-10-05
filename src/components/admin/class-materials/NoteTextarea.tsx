"use client";

import { useState } from "react";
import { CLASS_MATERIAL_NOTE_MAX, charCount } from "@/lib/class-materials";
import { cn } from "@/lib/utils";

const fmt = (n: number) => n.toLocaleString("ko-KR");

/**
 * 수업자료실 안내 · 스크립트 입력칸 — 올리기 · 수정이 함께 쓴다 (2026-10-05 Alan — "여기 안내에 스크립트를 올려줄예정이야. 그래서 글을 쫌 길게 적을 수 있어야해").
 * 글자 수를 늘 보여 주고 5만 자(`CLASS_MATERIAL_NOTE_MAX`)를 넘으면 빨갛게 알린다. **`maxLength` 를 두지 않는다** — 두면 붙여 넣은 스크립트의
 * 뒤가 소리 없이 잘려 학생이 끝이 빠진 스크립트를 받는다. 넘친 채로는 폼이 저장하지 않는다(`noteTooLong` — 서버 액션도 같은 말로 다시 본다).
 * 값은 예전 칸처럼 폼이 ref 로 읽는다.
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
  const [length, setLength] = useState(() => charCount(defaultValue));
  const over = length > CLASS_MATERIAL_NOTE_MAX;
  return (
    <>
      <textarea
        id={id}
        ref={ref}
        rows={6}
        defaultValue={defaultValue}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={over || undefined}
        aria-describedby={`${id}-count`}
        onChange={(e) => setLength(charCount(e.currentTarget.value))}
        className={cn("input min-h-32 resize-y !py-2 text-sm leading-relaxed", over && "!border-red-400 focus:!ring-red-100")}
      />
      <p id={`${id}-count`} className={cn("mt-1 text-right text-[11px] tabular-nums", over ? "font-bold text-red-600" : "text-mist")}>
        {over && <>{fmt(length - CLASS_MATERIAL_NOTE_MAX)}자를 줄여 주세요 · </>}
        {fmt(length)} / {fmt(CLASS_MATERIAL_NOTE_MAX)}자
      </p>
    </>
  );
}

