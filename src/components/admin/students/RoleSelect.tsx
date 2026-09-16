"use client";

import { useActionState, useState } from "react";
import { updateStudentRole, type StudentActionState } from "@/app/admin/students/actions";
import { SubmitButton } from "@/components/ui/SubmitButton";

export type RoleOption = { value: string; label: string; hint: string };

/** 등급 바꾸기 (관리자 전용). 고른 값이 지금과 다를 때만 저장 버튼이 열린다 */
export function RoleSelect({ id, current, options }: { id: string; current: string; options: RoleOption[] }) {
  const [state, action] = useActionState<StudentActionState, FormData>(updateStudentRole, {});
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
        <label htmlFor={`role-${id}`} className="sr-only">등급</label>
        <select id={`role-${id}`} name="role" value={picked} onChange={(e) => setPicked(e.target.value)} className="input !w-auto !py-2 text-sm font-bold">
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {changed && <SubmitButton className="!w-auto !px-4 !py-2 text-sm" pendingText="바꾸는 중…">등급 바꾸기</SubmitButton>}
      </div>
      {hint && <p className="text-xs text-slate">{hint}</p>}
      {state.error && <p className="text-sm font-semibold text-red-600">{state.error}</p>}
      {state.ok && state.message && <p className="text-sm font-semibold text-brand-600">{state.message}</p>}
    </form>
  );
}
