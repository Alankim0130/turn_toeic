"use client";

import { useOptimistic, useState, useTransition } from "react";
import { toggleHandoverItem } from "@/app/admin/handover/actions";
import { cn } from "@/lib/utils";

/**
 * 인수인계 항목의 체크 칸 (2026-10-04). 누르면 바로 바뀌어 보이고(낙관적) 저장이 실패하면 되돌아오며 까닭을 적는다.
 * 체크 표시는 작아서 **도형(인라인 SVG)** 이다 — 이모지 · 아이콘 그림을 쓰지 않는다 (비대면 인증 격자와 같은 규칙).
 * 항목 제목 · 끝낸 사람 줄은 서버가 그려 `children` 으로 넘긴다.
 */
export function HandoverCheck({
  itemKey,
  label,
  checked,
  disabled,
  children,
}: {
  itemKey: string;
  /** 화면 낭독기용 이름 — `0-1 날짜와 기간을 정한다` */
  label: string;
  checked: boolean;
  disabled: boolean;
  children: React.ReactNode;
}) {
  const [shown, setShown] = useOptimistic(checked);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const flip = () =>
    start(async () => {
      const next = !shown;
      setShown(next);
      setError(null);
      const r = await toggleHandoverItem(itemKey, next);
      if (r.error) setError(r.error);
    });

  return (
    <div className="flex items-start gap-3">
      <button
        type="button"
        role="checkbox"
        aria-checked={shown}
        aria-label={label}
        title={disabled ? undefined : shown ? "체크 풀기" : "끝냈으면 체크"}
        disabled={disabled || pending}
        onClick={flip}
        className={cn(
          "mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg border-2 transition",
          shown ? "border-brand-500 bg-brand-500 text-white" : "border-line bg-white text-transparent hover:border-brand-300",
          disabled && "cursor-not-allowed opacity-50",
          pending && "opacity-70",
        )}
      >
        <svg viewBox="0 0 16 16" aria-hidden className="size-4">
          <path d="M3.2 8.6 6.4 11.6 12.8 4.8" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div className="min-w-0 flex-1">
        {children}
        {error && (
          <p role="alert" className="mt-1 text-xs font-bold text-red-700">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
