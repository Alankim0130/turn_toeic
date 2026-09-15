"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelSignupByStaff } from "@/app/admin/study/actions";

/** 스태프가 학생 대신 스터디 신청을 취소 (2단계 확인) */
export function CancelSignupButton({ id, name }: { id: number; name: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className="btn-ghost !px-3 !py-1.5 text-xs text-slate hover:!text-red-600">
        신청 취소
      </button>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-1">
      <button
        type="button"
        disabled={pending}
        aria-label={`${name} 신청 취소 확정`}
        onClick={() =>
          startTransition(async () => {
            const res = await cancelSignupByStaff(id);
            if (res.ok) router.refresh();
            else setError(res.error ?? "취소하지 못했어요.");
          })
        }
        className="btn-dark !bg-red-600 !px-3 !py-1.5 text-xs hover:!bg-red-700"
      >
        {pending ? "취소 중…" : "취소 확정"}
      </button>
      <button type="button" onClick={() => setConfirming(false)} className="btn-ghost !px-3 !py-1.5 text-xs">
        닫기
      </button>
      {error && <span className="w-full text-right text-xs font-semibold text-red-600">{error}</span>}
    </span>
  );
}
