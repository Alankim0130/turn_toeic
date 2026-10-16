"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setLectureOpen } from "@/app/admin/lectures/actions";
import { cn } from "@/lib/utils";

/**
 * **신청 받기 · 신청 마감** 버튼 (2026-10-16 Alan — "강사가 직접 '신청받기' 버튼을 누르면 바로 오픈되면서 신청을 받을 수 있도록").
 * 누르는 순간 저장된다 — 특강 신청 화면과 특강 설정 화면이 같이 쓴다. 마감은 한 번 더 묻는다 (학생 화면에서 바로 빠진다).
 */
export function LectureOpenButton({ lectureId, open, past, className }: { lectureId: number; open: boolean; past: boolean; className?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<{ error?: string; message?: string }>({});

  if (past) return <span className={cn("text-xs font-semibold text-mist", className)}>지난 특강</span>;

  const run = (next: boolean) =>
    startTransition(async () => {
      const res = await setLectureOpen(lectureId, next);
      setResult(res);
      setConfirming(false);
      if (res.ok) router.refresh();
    });

  return (
    <span className={cn("inline-flex flex-wrap items-center justify-end gap-1.5", className)}>
      {!open ? (
        <button type="button" disabled={pending} onClick={() => run(true)} className="btn-primary !w-auto !px-4 !py-1.5 text-xs">
          {pending ? "여는 중…" : "신청 받기"}
        </button>
      ) : confirming ? (
        <>
          <button type="button" disabled={pending} onClick={() => run(false)} className="btn-dark !w-auto !bg-red-600 !px-3 !py-1.5 text-xs hover:!bg-red-700">
            {pending ? "마감 중…" : "마감 확정"}
          </button>
          <button type="button" onClick={() => setConfirming(false)} className="btn-ghost !px-3 !py-1.5 text-xs">
            닫기
          </button>
        </>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} className="btn-secondary !w-auto !px-4 !py-1.5 text-xs">
          신청 마감
        </button>
      )}
      {result.error && <span className="w-full text-right text-xs font-semibold text-red-600">{result.error}</span>}
      {result.message && !result.error && <span className="w-full text-right text-xs font-semibold text-brand-600">{result.message}</span>}
    </span>
  );
}
