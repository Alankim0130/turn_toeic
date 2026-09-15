"use client";

import { useActionState, useEffect } from "react";
import { createCourse, type ActionState } from "@/app/admin/sections/actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Alert";

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
    <form action={action} className="space-y-3">
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
