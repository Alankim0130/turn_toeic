"use client";

import { useActionState, useState } from "react";
import { updateLectureSignup, type LectureSettingsState } from "@/app/admin/lectures/actions";
import { SubmitButton } from "@/components/ui/SubmitButton";

/** 신청 받기 · 정원 · 신청 시작. 특강 날짜·강사·종류는 반 편성 달력에서 정한다 */
export function LectureSignupForm({
  lectureId,
  signup,
  capacity,
  signupOpensAt,
  appliedCount,
}: {
  lectureId: number;
  signup: boolean;
  capacity: number | null;
  /** KST 로 맞춘 datetime-local 값 (YYYY-MM-DDTHH:mm) 또는 "" */
  signupOpensAt: string;
  appliedCount: number;
}) {
  const [state, action] = useActionState<LectureSettingsState, FormData>(updateLectureSignup, {});
  const [on, setOn] = useState(signup);

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="lecture_id" value={lectureId} />
      <label className="flex items-center gap-2 text-sm font-bold text-ink">
        <input type="checkbox" name="signup" checked={on} onChange={(e) => setOn(e.target.checked)} className="h-4 w-4 accent-brand-500" />
        신청 받기
      </label>

      {on && (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block">
            <span className="label">정원 <span className="font-semibold text-slate">(비우면 제한 없음)</span></span>
            <input
              name="capacity"
              inputMode="numeric"
              defaultValue={capacity ?? ""}
              placeholder="예: 40"
              className="input !py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="label">신청 시작 <span className="font-semibold text-slate">(비우면 바로)</span></span>
            <input name="signup_opens_at" type="datetime-local" defaultValue={signupOpensAt} className="input !py-2 text-sm" />
          </label>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-mist">
          {appliedCount > 0 ? `신청 ${appliedCount}명 — 정원을 이보다 적게 줄일 수 없어요` : "신청은 특강 당일까지 받습니다"}
        </p>
        <SubmitButton variant="secondary" className="!w-auto !px-4 !py-1.5 text-xs" pendingText="저장 중…">
          저장
        </SubmitButton>
      </div>

      {state.error && <p className="text-xs font-semibold text-red-600">{state.error}</p>}
      {state.ok && state.message && <p className="text-xs font-semibold text-brand-600">{state.message}</p>}
    </form>
  );
}
