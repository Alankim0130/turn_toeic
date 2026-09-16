"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteHomeworkSubmission } from "@/app/my/homework/actions";

/** 점검 전 제출 취소. 한 번 더 물어본 뒤 지운다 */
export function DeleteSubmissionButton({ id }: { id: number }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = () =>
    startTransition(async () => {
      setError(null);
      const res = await deleteHomeworkSubmission(id);
      if (res.ok) {
        setConfirming(false);
        router.refresh();
      } else {
        setError(res.error ?? "취소하지 못했어요.");
      }
    });

  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className="btn-ghost !px-3 !py-1.5 text-xs">
        제출 취소
      </button>
    );
  }
  return (
    <span className="flex flex-wrap items-center justify-end gap-1.5 text-xs">
      <span className="font-semibold text-ink">사진도 같이 지워져요. 취소할까요?</span>
      <button type="button" onClick={run} disabled={pending} className="rounded-full bg-red-600 px-3 py-1.5 font-bold text-white transition hover:bg-red-700 disabled:opacity-50">
        {pending ? "취소하는 중…" : "네, 취소"}
      </button>
      <button type="button" onClick={() => setConfirming(false)} disabled={pending} className="btn-ghost !px-3 !py-1.5 text-xs">
        아니요
      </button>
      {error && <span className="w-full text-right font-semibold text-red-600">{error}</span>}
    </span>
  );
}
