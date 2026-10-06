"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setClassNoticePublished } from "@/app/admin/class-materials/notice-actions";
import { publishToggleLabel } from "@/lib/class-notices";
import { cn } from "@/lib/utils";

/**
 * 공지 내리기 · 다시 올리기 토글 (2026-10-06 Alan). 관리자 수업자료실 공지 줄과 공지 고치기 화면이 함께 쓴다.
 * 올라가 있으면 `공지 내리기`(테두리), 내려 있으면 `다시 올리기`(분홍) — 글자가 곧 다음 동작이라 지금 상태는 옆 배지(`공지` · `내림`)가 말해 준다.
 */
export function NoticePublishToggle({ id, published, title, className }: { id: number; published: boolean; title: string; className?: string }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const next = !published;

  return (
    <span className={cn("inline-flex flex-col items-end gap-1", className)}>
      <button
        type="button"
        aria-pressed={published}
        aria-label={`${title} — ${publishToggleLabel(published)}`}
        disabled={busy}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await setClassNoticePublished(id, next);
            if (!res.ok) return setError(res.error ?? "바꾸지 못했어요.");
            router.refresh();
          })
        }
        className={cn(
          "shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold transition disabled:opacity-50",
          published ? "border border-line bg-white text-ink-soft hover:border-brand-300 hover:text-brand-600" : "bg-brand-500 text-white shadow-pink hover:bg-brand-600",
        )}
      >
        {busy ? "바꾸는 중…" : publishToggleLabel(published)}
      </button>
      {error && (
        <span role="alert" className="text-xs font-bold text-red-600">
          {error}
        </span>
      )}
    </span>
  );
}
