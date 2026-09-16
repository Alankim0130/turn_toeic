"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelLectureSignupByStaff } from "@/app/admin/lectures/actions";

/** 스태프가 학생 대신 특강 신청을 취소 (2단계 확인) */
export function CancelLectureSignupButton({ id, name }: { id: number; name: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className="btn-ghost !px-3 !py-1.5 text-xs text-slate hover:!text-red-600">
        취소
      </button>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-1">
      <button
        type="button"
        disabled={pending}
        aria-label={`${name} 특강 신청 취소 확정`}
        onClick={() =>
          startTransition(async () => {
            const res = await cancelLectureSignupByStaff(id);
            if (res.error) setError(res.error);
            else {
              setConfirming(false);
              router.refresh();
            }
          })
        }
        className="btn-dark !w-auto !bg-red-600 !px-3 !py-1.5 text-xs hover:!bg-red-700"
      >
        {pending ? "취소 중…" : "확정"}
      </button>
      <button type="button" onClick={() => setConfirming(false)} className="btn-ghost !px-3 !py-1.5 text-xs">
        닫기
      </button>
      {error && <span className="w-full text-right text-xs font-semibold text-red-600">{error}</span>}
    </span>
  );
}
