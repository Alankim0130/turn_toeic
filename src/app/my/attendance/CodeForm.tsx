"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { AttendanceResult } from "@/components/my/AttendanceResult";
import { submitAttendanceCode, type CodeState } from "./actions";

/** 강의실 화면의 6자리 코드로 입실·퇴실 (카메라가 사파리를 열어 로그인이 번거로울 때의 길) */
export function CodeForm() {
  const [state, action] = useActionState<CodeState, FormData>(submitAttendanceCode, {});
  return (
    <div className="space-y-3">
      {state.result && <AttendanceResult result={state.result} />}
      <form action={action} className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1">
          <label htmlFor="code" className="label">강의실 화면의 6자리 코드</label>
          <input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            required
            className="input text-center text-2xl font-black tracking-[0.4em] tabular-nums"
            placeholder="000000"
          />
        </div>
        <SubmitButton pendingText="확인 중…">입실 · 퇴실</SubmitButton>
      </form>
      <p className="text-xs text-slate">코드는 30초마다 바뀌어요. 처음 찍으면 입실, 수업이 끝나고 나갈 때 한 번 더 찍으면 퇴실이에요.</p>
    </div>
  );
}
