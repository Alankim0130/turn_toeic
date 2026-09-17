"use client";

import { useActionState } from "react";
import { completeProfile, type AuthState } from "../../actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { AgreeField, FormError, GenderField, NameField, PhoneField, SchoolFields } from "../../ProfileFields";

/** 구글로 들어온 회원의 가입 정보 입력 폼. 실명은 이미 정해져 있으면(이름은 있고 휴대폰만 없는 계정) 잠가서 보여 준다 */
export function CompleteProfileForm({ next, lockedName }: { next: string; lockedName: string | null }) {
  const [state, action] = useActionState<AuthState, FormData>(completeProfile, {});
  const v = state.values ?? {};

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <FormError error={state.error} stateKey={state} />

      <NameField defaultValue={lockedName ?? v.name} readOnly={lockedName !== null} />
      <PhoneField defaultValue={v.phone} />
      <SchoolFields university={v.university} department={v.department} />
      <GenderField defaultValue={v.gender} />
      <AgreeField defaultChecked={v.agree === "on"} />

      <SubmitButton className="w-full sm:w-full" pendingText="저장 중…">저장하고 시작하기</SubmitButton>
    </form>
  );
}
