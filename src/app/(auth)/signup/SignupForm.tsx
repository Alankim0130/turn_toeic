"use client";

import { useActionState } from "react";
import { signUp, type AuthState } from "../actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Alert";

const GENDERS = [
  { value: "female", label: "여성" },
  { value: "male", label: "남성" },
  { value: "other", label: "기타" },
  { value: "undisclosed", label: "응답 안 함" },
];

export function SignupForm() {
  const [state, action] = useActionState<AuthState, FormData>(signUp, {});
  const v = state.values ?? {};

  if (state.message) {
    return <Alert kind="success" title="인증 메일을 보냈어요">{state.message}</Alert>;
  }

  return (
    <form action={action} className="space-y-4">
      {state.error && <Alert kind="warning">{state.error}</Alert>}

      <div>
        <label htmlFor="name" className="label">실명</label>
        <input id="name" name="name" required autoComplete="name" className="input" placeholder="수강증에 적힌 이름과 같아야 해요" defaultValue={v.name} />
      </div>
      <div>
        <label htmlFor="email" className="label">이메일</label>
        <input id="email" name="email" type="email" required autoComplete="email" className="input" defaultValue={v.email} />
      </div>
      <div>
        <label htmlFor="password" className="label">비밀번호</label>
        <input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" className="input" placeholder="8자 이상" />
      </div>
      <div>
        <label htmlFor="phone" className="label">휴대폰 번호</label>
        <input id="phone" name="phone" type="tel" required inputMode="numeric" autoComplete="tel" className="input" placeholder="01012345678" defaultValue={v.phone} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="university" className="label">대학교 <span className="font-normal text-mist">(선택)</span></label>
          <input id="university" name="university" className="input" placeholder="예: 부산대학교" defaultValue={v.university} />
        </div>
        <div>
          <label htmlFor="department" className="label">학과 <span className="font-normal text-mist">(선택)</span></label>
          <input id="department" name="department" className="input" placeholder="예: 경영학과" defaultValue={v.department} />
        </div>
      </div>

      <fieldset>
        <legend className="label">성별 <span className="font-normal text-mist">(선택)</span></legend>
        <div className="grid grid-cols-4 gap-2">
          {GENDERS.map((g) => (
            <label key={g.value} className="cursor-pointer">
              <input type="radio" name="gender" value={g.value} defaultChecked={(v.gender ?? "undisclosed") === g.value} className="peer sr-only" />
              <span className="block rounded-xl border border-line bg-paper px-2 py-2.5 text-center text-sm font-semibold text-slate transition peer-checked:border-brand-400 peer-checked:bg-brand-50 peer-checked:text-brand-700 peer-focus-visible:ring-4 peer-focus-visible:ring-brand-100">
                {g.label}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="flex items-start gap-2 text-sm text-slate">
        <input type="checkbox" name="agree" className="mt-1 h-4 w-4 accent-brand-500" required />
        <span>
          수강 관리와 학습 안내를 위해 실명·연락처·대학·학과·성별을 수집·이용하는 데 동의합니다. 대학·학과·성별은 통계 목적으로만 사용됩니다.
        </span>
      </label>

      <SubmitButton className="w-full sm:w-full" pendingText="가입 중…">가입하기</SubmitButton>
    </form>
  );
}
