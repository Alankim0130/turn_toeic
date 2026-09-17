"use client";

import { useActionState } from "react";
import { signUp, type AuthState } from "../actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Alert";
import { AgreeField, FormError, GenderField, NameField, PhoneField, SchoolFields } from "../ProfileFields";

export function SignupForm() {
  const [state, action] = useActionState<AuthState, FormData>(signUp, {});
  const v = state.values ?? {};

  if (state.message) {
    return <Alert kind="success" title="인증 메일을 보냈어요">{state.message}</Alert>;
  }

  return (
    <form action={action} className="space-y-4">
      <FormError error={state.error} stateKey={state} />

      <NameField defaultValue={v.name} />
      <div>
        <label htmlFor="email" className="label">이메일</label>
        <input id="email" name="email" type="email" required autoComplete="email" className="input" defaultValue={v.email} />
      </div>
      <div>
        <label htmlFor="password" className="label">비밀번호</label>
        <input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" className="input" placeholder="8자 이상" />
      </div>
      <PhoneField defaultValue={v.phone} />
      <SchoolFields university={v.university} department={v.department} />
      <GenderField defaultValue={v.gender} />
      <AgreeField defaultChecked={v.agree === "on"} />

      <SubmitButton className="w-full sm:w-full" pendingText="가입 중…">가입하기</SubmitButton>
    </form>
  );
}
