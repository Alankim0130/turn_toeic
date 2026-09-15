"use client";

import { useActionState } from "react";
import { signIn, type AuthState } from "../actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Alert";

export function LoginForm({ next }: { next?: string }) {
  const [state, action] = useActionState<AuthState, FormData>(signIn, {});

  return (
    <form action={action} className="space-y-4">
      {next && <input type="hidden" name="next" value={next} />}
      {state.error && <Alert kind="warning">{state.error}</Alert>}
      <div>
        <label htmlFor="email" className="label">이메일</label>
        <input id="email" name="email" type="email" autoComplete="email" required className="input" defaultValue={state.values?.email} />
      </div>
      <div>
        <label htmlFor="password" className="label">비밀번호</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="input" />
      </div>
      <SubmitButton className="w-full sm:w-full" pendingText="로그인 중…">로그인</SubmitButton>
    </form>
  );
}
