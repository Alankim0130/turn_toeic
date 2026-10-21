"use client";

import { cn } from "@/lib/utils";

/**
 * 고르기 칩 — 눌린 것은 브랜드색으로 꽉 차고, 아닌 것은 테두리만 (수업자료실 공지 범위 · 직원 게시판 레벨 · 옮기기 대화창이 함께 쓴다).
 * 누르는 곳이라 `aria-pressed` 로 지금 고른 것을 화면 낭독기에 알린다
 */
export function ChoiceChip({ on, onClick, disabled, children }: { on: boolean; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded-full border px-3 py-1.5 text-sm font-bold transition disabled:opacity-50",
        on ? "border-brand-600 bg-brand-600 text-white" : "border-line bg-white text-ink-soft hover:border-brand-300",
      )}
    >
      {children}
    </button>
  );
}
