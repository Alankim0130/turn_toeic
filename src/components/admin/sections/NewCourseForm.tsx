"use client";

import { useActionState, useEffect } from "react";
import { createCourse, type ActionState } from "@/app/admin/sections/actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Alert";
import { submitWithoutReset } from "@/lib/form-submit";

export function NewCourseForm({ onDone }: { onDone?: () => void }) {
  const [state, action] = useActionState<ActionState, FormData>(createCourse, {});
  const v = state.values ?? {};

  useEffect(() => {
    if (state.ok) {
      const t = setTimeout(() => onDone?.(), 1200);
      return () => clearTimeout(t);
    }
  }, [state.ok, onDone]);

  return (
    // 보내기는 직접 한다 (2026-10-29) — 오류(코드 겹침 등) 뒤 초기화되면 유형이 '종합' 으로 돌아가, 코드만 고쳐 다시 추가하면 단과 강좌가 종합으로 생겼다
    <form action={action} onSubmit={submitWithoutReset(action)} className="space-y-3">
      <p className="text-sm font-bold text-ink">새 강좌 추가</p>
      {state.error && <Alert kind="warning">{state.error}</Alert>}
      {state.ok && <Alert kind="success">{state.message} 위의 강좌 목록에서 선택할 수 있어요.</Alert>}
      <div className="grid gap-3 sm:grid-cols-4">
        <div>
          <label htmlFor="course_code" className="label">코드</label>
          <input id="course_code" name="code" required className="input" placeholder="FULL750" defaultValue={v.code} />
        </div>
        <div>
          <label htmlFor="course_name" className="label">강좌명</label>
          <input id="course_name" name="name" required className="input" placeholder="750 목표 종합반" defaultValue={v.name} />
        </div>
        <div>
          <label htmlFor="course_type" className="label">유형</label>
          <select id="course_type" name="course_type" required className="input" defaultValue={v.course_type ?? "full"}>
            <option value="full">종합</option>
            <option value="lc">단과 LC</option>
            <option value="rc">단과 RC</option>
          </select>
        </div>
        <div>
          <label htmlFor="course_target" className="label">
            목표 점수 <span className="font-normal text-mist">(선택)</span>
          </label>
          <input id="course_target" name="target_score" type="number" min={10} max={990} step={5} className="input" placeholder="750" defaultValue={v.target_score} />
        </div>
      </div>
      <SubmitButton variant="dark" pendingText="추가 중…">강좌 추가</SubmitButton>
    </form>
  );
}
