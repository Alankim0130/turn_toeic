"use client";

import { useActionState, useState } from "react";
import { cancelStudyLevelRequest, cancelStudySignup, requestStudyLevel, signupStudy, type SignupState } from "./actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { cn } from "@/lib/utils";
import { studyLevelLabel } from "@/lib/study";

/** 신청 / 시간대 변경. 비대면은 `level`(학생이 고른 레벨)을 함께 보낸다 (2026-10-12) */
export function StudySignupButton({
  studyId,
  slotId,
  level,
  label,
  variant = "primary",
  className,
}: {
  studyId: number;
  slotId: number | null;
  /** 비대면 — 고른 레벨. 단어 스터디는 시간대의 레벨이라 보내지 않는다 */
  level?: number | null;
  label: string;
  variant?: "primary" | "secondary" | "dark";
  className?: string;
}) {
  const [state, action] = useActionState<SignupState, FormData>(signupStudy, {});
  return (
    <form action={action} className={cn("flex flex-col items-end gap-1", className)}>
      <input type="hidden" name="study_id" value={studyId} />
      <input type="hidden" name="slot_id" value={slotId ?? ""} />
      <input type="hidden" name="level" value={level ?? ""} />
      <SubmitButton variant={variant} className="!w-auto !px-4 !py-2 text-xs sm:text-sm" pendingText="처리 중…">
        {label}
      </SubmitButton>
      {state.error && <p className="max-w-[16rem] text-right text-xs font-semibold text-red-600">{state.error}</p>}
    </form>
  );
}

/**
 * 비대면 신청 — 레벨(1 · 2 · 3)을 고르고 신청한다 (2026-10-12 Alan "레벨은 학생이 직접 고르는걸로"). 고르기 전에는 버튼이 잠긴다.
 * 칸은 상태로 쥔다 — `<form action>` 이 끝나면 React 가 폼을 초기화해 고른 레벨이 사라진다 (교재주문 폼과 같은 함정)
 */
export function OnlineSignupForm({ studyId, levels }: { studyId: number; levels: readonly number[] }) {
  const [state, action] = useActionState<SignupState, FormData>(signupStudy, {});
  const [level, setLevel] = useState<number | null>(null);
  return (
    <form action={action} className="flex w-full flex-col gap-2">
      <input type="hidden" name="study_id" value={studyId} />
      <input type="hidden" name="slot_id" value="" />
      <input type="hidden" name="level" value={level ?? ""} />
      <LevelPicker name="level-pick" levels={levels} value={level} onChange={setLevel} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-slate">{level ? `${studyLevelLabel(level)} 자료를 받아요` : "내 레벨을 골라 주세요"}</span>
        <SubmitButton className="!w-auto !px-4 !py-2 text-xs sm:text-sm" pendingText="처리 중…" disabled={level === null}>
          신청하기
        </SubmitButton>
      </div>
      {state.error && <p className="text-right text-xs font-semibold text-red-600">{state.error}</p>}
    </form>
  );
}

/** 레벨 고르기 칸 — 알약 버튼 (라디오) */
export function LevelPicker({ name, levels, value, onChange, disabled }: { name: string; levels: readonly number[]; value: number | null; onChange: (v: number) => void; disabled?: boolean }) {
  return (
    <div role="radiogroup" aria-label="레벨" className="flex flex-wrap gap-1.5">
      {levels.map((l) => (
        <label key={l} className="cursor-pointer">
          <input type="radio" name={name} value={l} checked={value === l} onChange={() => onChange(l)} disabled={disabled} className="peer sr-only" />
          <span className="block rounded-full border border-line bg-paper px-3 py-1.5 text-xs font-bold text-ink transition peer-checked:border-brand-500 peer-checked:bg-brand-500 peer-checked:text-white peer-focus-visible:ring-4 peer-focus-visible:ring-brand-100 peer-disabled:opacity-50">
            {studyLevelLabel(l)}
          </span>
        </label>
      ))}
    </div>
  );
}

/**
 * 레벨 변경 요청 — 단어 스터디에서 **다른 레벨의 시간대**를 누르면 바로 바꾸지 않고 요청을 낸다 (조교 · 강사 승인, 2026-10-12 Alan).
 * 레벨이 없던 신청은 DB 함수가 바로 적용한다 — 그때는 "바뀌었어요" 로 말한다
 */
export function LevelRequestButton({ signupId, slotId, level, label, className }: { signupId: number; slotId?: number | null; level?: number | null; label: string; className?: string }) {
  const [state, action] = useActionState<SignupState, FormData>(requestStudyLevel, {});
  return (
    <form action={action} className={cn("flex flex-col items-end gap-1", className)}>
      <input type="hidden" name="signup_id" value={signupId} />
      <input type="hidden" name="slot_id" value={slotId ?? ""} />
      <input type="hidden" name="level" value={level ?? ""} />
      <SubmitButton variant="secondary" className="!w-auto !px-4 !py-2 text-xs sm:text-sm" pendingText="처리 중…">
        {label}
      </SubmitButton>
      {state.ok && <p className="max-w-[16rem] text-right text-xs font-semibold text-brand-600">{state.applied ? "레벨이 정해졌어요." : "변경을 요청했어요. 조교 · 강사가 승인하면 바뀌어요."}</p>}
      {state.error && <p className="max-w-[16rem] text-right text-xs font-semibold text-red-600">{state.error}</p>}
    </form>
  );
}

/** 변경 요청 취소 */
export function LevelRequestCancelButton({ signupId }: { signupId: number }) {
  const [state, action] = useActionState<SignupState, FormData>(cancelStudyLevelRequest, {});
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="signup_id" value={signupId} />
      <SubmitButton variant="secondary" className="!w-auto !px-3 !py-1.5 text-xs" pendingText="취소 중…">
        요청 취소
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
