"use client";

import { useRef } from "react";
import { Icon } from "@/components/ui/Icon";
import { CLASS_MATERIAL_FILES_MAX, CLASS_MATERIAL_MAX_BYTES, fileKindLabel } from "@/lib/class-materials";
import { formatBytes } from "@/lib/study";

/** 고른 파일 — 아직 올리지 않았다 (올리기를 누르면 브라우저가 저장소에 올린다) */
export type PickedFile = { key: string; file: File };

/**
 * 수업자료실 파일 고르기 — 여러 개를 한 번에, 더 고르면 뒤에 붙는다 (2026-10-06 Alan — "파일을 한번에 여러개 올릴 수 있도록").
 * 올리기 폼과 수정 폼이 함께 쓴다. **골라도 되고 안 골라도 된다** — 파일 없이 글만 올리는 자료가 있다
 * (예전에는 칸이 `required` 라 파일 없이 누르면 브라우저가 "파일을 선택하세요" 로 막았다).
 * 50MB 를 넘는 파일 · 같은 파일 두 번 · `room` 을 넘는 만큼은 빼고 까닭을 `onProblem` 으로 알린다.
 * 칸이 `sr-only` 라 고르는 길은 점선 상자(label)다 — 숙제 사진 고르기와 같은 꼴.
 */
export function MaterialFilePicker({
  id,
  files,
  onChange,
  onProblem,
  room = CLASS_MATERIAL_FILES_MAX,
  disabled = false,
}: {
  id: string;
  files: PickedFile[];
  onChange: (files: PickedFile[]) => void;
  /** 빠진 파일의 까닭 — 문제가 없으면 null */
  onProblem: (message: string | null) => void;
  /** 이번에 더할 수 있는 파일 수 (수정이면 남겨 둔 파일만큼 줄어든다) */
  room?: number;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  function pick(list: FileList | null) {
    const incoming = [...(list ?? [])];
    if (inputRef.current) inputRef.current.value = ""; // 같은 파일을 빼고 다시 골라도 onChange 가 나게
    if (incoming.length === 0) return;
    const problems: string[] = [];
    const next: PickedFile[] = [];
    for (const f of incoming) {
      if (f.size > CLASS_MATERIAL_MAX_BYTES) {
        problems.push(`${f.name}: 50MB 이하만 올릴 수 있어요`);
        continue;
      }
      // 같은 파일을 두 번 고르면 한 번만 — 이름 · 크기가 같으면 같은 파일로 본다 (수정 시각은 보지 않는다:
      // 아이폰 사진첩에서 고르면 고를 때마다 새로 만들어져 같은 사진도 시각이 다르다)
      const same = (p: PickedFile) => p.file.name === f.name && p.file.size === f.size;
      if (files.some(same) || next.some(same)) continue;
      next.push({ key: crypto.randomUUID(), file: f });
    }
    const left = Math.max(room - files.length, 0);
    if (next.length > left) problems.push(`파일은 한 자료에 ${CLASS_MATERIAL_FILES_MAX}개까지라 ${next.length - left}개는 빠졌어요`);
    onChange([...files, ...next.slice(0, left)]);
    onProblem(problems.length ? problems.join(" · ") : null);
  }

  return (
    <div className="space-y-1.5">
      {files.length > 0 && (
        <ul className="space-y-1.5" aria-label="고른 파일">
          {files.map((p) => (
            <li key={p.key} className="flex items-center gap-2 rounded-lg border border-line bg-paper px-2.5 py-1.5 text-sm">
              <span className="shrink-0 rounded-md bg-brand-50 px-1.5 py-0.5 text-[10px] font-black text-brand-700">{fileKindLabel(p.file.name, p.file.type)}</span>
              <span className="min-w-0 flex-1 text-ink [overflow-wrap:anywhere]">{p.file.name}</span>
              <span className="shrink-0 text-xs tabular-nums text-mist">{formatBytes(p.file.size)}</span>
              <button
                type="button"
                onClick={() => {
                  onProblem(null);
                  onChange(files.filter((x) => x.key !== p.key));
                }}
                disabled={disabled}
                aria-label={`${p.file.name} 빼기`}
                className="shrink-0 rounded-full px-2 py-0.5 text-xs font-bold text-slate transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
              >
                빼기
              </button>
            </li>
          ))}
        </ul>
      )}
      {files.length < room && (
        <label
          htmlFor={id}
          className="relative flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line bg-paper px-3 py-2.5 text-center text-sm font-bold text-ink transition focus-within:border-brand-300 focus-within:ring-2 focus-within:ring-brand-100 hover:border-brand-300 hover:bg-brand-50/50"
        >
          <input id={id} ref={inputRef} type="file" multiple className="sr-only" onChange={(e) => pick(e.target.files)} disabled={disabled} />
          <Icon name="upload" size={18} />
          {files.length > 0 ? "파일 더 고르기" : "파일 고르기 · 여러 개를 한 번에 골라도 돼요"}
        </label>
      )}
    </div>
  );
}
