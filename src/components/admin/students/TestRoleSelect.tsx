"use client";

import { useActionState, useState } from "react";
import { setTestRole, type TesterActionState } from "@/app/admin/students/tester-actions";
import { SubmitButton } from "@/components/ui/SubmitButton";

export type TestRoleOption = { value: string; label: string; hint: string };

/** 테스터 계정의 테스트 등급 (없음 · 회원 · 수강생 · 졸업생). 고른 값이 지금과 다를 때만 저장 버튼이 열린다 */
export function TestRoleSelect({ id, current, options }: { id: string; current: string; options: TestRoleOption[] }) {
  const [state, action] = useActionState<TesterActionState, FormData>(setTestRole, {});
  const [picked, setPicked] = useState(current);
  const changed = picked !== current;
  const hint = options.find((o) => o.value === picked)?.hint;

  // 저장에 성공하면 current 가 바뀌어 다시 잠긴다 (렌더 중 파생 상태 갱신)
  const [seen, setSeen] = useState(current);
  if (current !== seen) {
    setSeen(current);
    setPicked(current);
  }

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`test-role-${id}`} className="sr-only">테스트 등급</label>
        <select id={`test-role-${id}`} name="test_role" value={picked} onChange={(e) => setPicked(e.target.value)} className="input !w-auto !py-2 text-sm font-bold">
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {changed && (
          <SubmitButton className="!w-auto !px-4 !py-2 text-sm" pendingText="바꾸는 중…">
            {picked ? "테스트 등급 켜기" : "테스트 끝내기"}
          </SubmitButton>
        )}
      </div>
      {hint && <p className="text-xs text-slate">{hint}</p>}
      {state.error && <p className="text-sm font-semibold text-red-600">{state.error}</p>}
      {state.ok && state.message && <p className="text-sm font-semibold text-brand-600">{state.message}</p>}
    </form>
  );
}
