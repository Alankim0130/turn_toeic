"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { TRANSFER_HINT, TRANSFER_MAX_MB, transferFileProblem } from "@/lib/textbook-transfer";

/**
 * 주문 폼의 **이체 화면 캡처 고르기** (2026-11-04 Alan — "학생이 이체를 하고 난 뒤에, 해당 화면을 스크린샷찍어서 올려주면").
 * 선택이다 — 고르면 작은 미리보기와 이름, 빼기. 파일 칸에는 `name` 이 없어 폼 데이터에 실리지 않는다 (서버 액션 본문 한도 1MB) —
 * 보내기 직전에 폼이 저장소에 올리고 경로만 싣는다 (`TextbookForm`). 사진 미리보기는 `URL.createObjectURL` 이라 바꾸거나 빼면 풀어 준다.
 */
export function TransferPicker({ file, onChange, disabled = false }: { file: File | null; onChange: (file: File | null) => void; disabled?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  // 미리보기 주소는 파일에서 바로 만들고, 바뀌거나 빠지면 풀어 준다
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const pick = (list: FileList | null) => {
    const next = list?.[0] ?? null;
    if (inputRef.current) inputRef.current.value = "";
    if (!next) return;
    const bad = transferFileProblem(next);
    setProblem(bad);
    if (bad) return;
    onChange(next);
  };

  return (
    <div className="mt-4">
      <p className="label !mb-1">
        이체 화면 캡처 <span className="font-normal text-mist">(선택)</span>
      </p>
      <p className="mb-2 text-xs text-slate">{TRANSFER_HINT} 나중에 아래 내역에서 올려도 돼요.</p>
      {file && preview ? (
        <div className="flex items-center gap-3 rounded-xl border border-brand-200 bg-white p-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="고른 이체 화면 캡처 미리보기" className="h-16 w-16 shrink-0 rounded-lg object-cover ring-1 ring-line" />
          <span className="min-w-0 flex-1 text-sm">
            <span className="block truncate font-bold text-ink">{file.name}</span>
            <span className="block text-xs text-slate">{(file.size / (1024 * 1024)).toFixed(1)}MB</span>
          </span>
          <button type="button" onClick={() => onChange(null)} disabled={disabled} className="btn-ghost shrink-0 !px-3 !py-1.5 text-xs">
            빼기
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
          className={cn("btn-secondary w-full !py-2.5 text-sm sm:w-auto", disabled && "opacity-50")}
        >
          캡처 고르기
        </button>
      )}
      <input ref={inputRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => pick(e.target.files)} disabled={disabled} />
      {problem && (
        <p role="alert" className="mt-1 text-xs font-semibold text-amber-700">
          {problem} ({TRANSFER_MAX_MB}MB 이하)
        </p>
      )}
    </div>
  );
}
