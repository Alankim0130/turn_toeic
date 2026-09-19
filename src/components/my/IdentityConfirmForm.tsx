"use client";

import { useActionState } from "react";
import { confirmIdentity, type AccountState } from "@/app/my/account/actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Alert";

/**
 * 수강증 인증 뒤 **이름·전화번호 확인** (2026-09-18 Alan 요청 — 동명이인 방지).
 *
 * 이름은 가입 실명과 같은지 **확인만** 한다 (바꾸려면 강사에게 — 수강증 대조 기준이 가입 실명이다).
 * 전화번호는 여기서 저장한다. 판정은 DB 의 `public.confirm_identity` 가 한다.
 * 확인이 끝나면 같은 이름·전화번호 계정이 있을 때만 **계정 합치기 카드**가 이어서 뜬다 (2026-09-19 Alan).
 */
export function IdentityConfirmForm({ phone, done = false }: { phone: string | null; done?: boolean }) {
  const [state, action] = useActionState<AccountState, FormData>(confirmIdentity, {});

  return (
    <form action={action} className="space-y-3">
      {state.error && <Alert kind="warning">{state.error}</Alert>}
      {/* 합칠 계정이 있으면 이 폼 바로 옆 카드가 뜬다 (등업신청·내 계정 둘 다) —
          여기서 "내 계정에서 합칠 수 있어요" 라고 미리 말하지 않는다. 계정이 하나뿐인 학생에게는 없는 이야기다 */}
      {state.message && <Alert kind="success">{state.message}</Alert>}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="identity-name" className="label">이름</label>
          <input id="identity-name" name="name" required autoComplete="name" className="input" placeholder="가입할 때 적은 실명" />
        </div>
        <div>
          <label htmlFor="identity-phone" className="label">전화번호</label>
          <input
            id="identity-phone"
            name="phone"
            required
            inputMode="numeric"
            autoComplete="tel"
            className="input"
            placeholder="010-1234-5678"
            defaultValue={phone ?? ""}
          />
        </div>
      </div>

      <SubmitButton pendingText="확인 중…" className="w-full sm:w-auto">
        {done ? "다시 확인하기" : "확인하기"}
      </SubmitButton>
    </form>
  );
}
