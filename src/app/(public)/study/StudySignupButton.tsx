"use client";

import { useActionState, useState } from "react";
import { cancelStudySignup, signupStudy, type SignupState } from "./actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { cn } from "@/lib/utils";

/** 신청 / 시간대 변경 */
export function StudySignupButton({
  studyId,
  slotId,
  label,
  variant = "primary",
  className,
}: {
  studyId: number;
  slotId: number | null;
  label: string;
  variant?: "primary" | "secondary" | "dark";
  className?: string;
}) {
  const [state, action] = useActionState<SignupState, FormData>(signupStudy, {});
  return (
    <form action={action} className={cn("flex flex-col items-end gap-1", className)}>
      <input type="hidden" name="study_id" value={studyId} />
      <input type="hidden" name="slot_id" value={slotId ?? ""} />
      <SubmitButton variant={variant} className="!w-auto !px-4 !py-2 text-xs sm:text-sm" pendingText="처리 중…">
        {label}
      </SubmitButton>
      {state.error && <p className="max-w-[16rem] text-right text-xs font-semibold text-red-600">{state.error}</p>}
    </form>
  );
}

/** 신청 취소 (한 번 더 확인) */
export function StudyCancelButton({ studyId, warning }: { studyId: number; warning?: string }) {
  const [state, action] = useActionState<SignupState, FormData>(cancelStudySignup, {});
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className="btn-ghost !px-3 !py-1.5 text-xs text-slate hover:!text-red-600">
        신청 취소
      </button>
    );
  }
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="study_id" value={studyId} />
      {warning && <p className="max-w-[16rem] text-right text-xs text-slate">{warning}</p>}
      <span className="flex gap-1">
        <SubmitButton variant="dark" className="!w-auto !bg-red-600 !px-3 !py-1.5 text-xs hover:!bg-red-700" pendingText="취소 중…">
          취소 확정
        </SubmitButton>
        <button type="button" onClick={() => setConfirming(false)} className="btn-ghost !px-3 !py-1.5 text-xs">
          닫기
        </button>
      </span>
      {state.error && <p className="max-w-[16rem] text-right text-xs font-semibold text-red-600">{state.error}</p>}
    </form>
  );
}
