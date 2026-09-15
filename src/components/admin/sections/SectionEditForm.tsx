"use client";

import { useActionState } from "react";
import { updateSection, type ActionState } from "@/app/admin/sections/actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Alert";
import { SectionFields } from "./SectionFields";

type Instructor = { id: string; name: string; role: string };

export function SectionEditForm({
  id,
  values,
  instructors,
  readOnly,
}: {
  id: number;
  values: Record<string, string>;
  instructors: Instructor[] | null;
  readOnly: boolean;
}) {
  const [state, action] = useActionState<ActionState, FormData>(updateSection, {});
  const v: Record<string, string | undefined> = { ...values, ...(state.values ?? {}) };

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="id" value={id} />
      {state.error && <Alert kind="warning">{state.error}</Alert>}
      {state.ok && <Alert kind="success">{state.message}</Alert>}

      <fieldset disabled={readOnly} className="space-y-5 disabled:opacity-70">
        <SectionFields values={v} mode="edit" />
        {instructors && (
          <div>
            <label htmlFor="instructor_id" className="label">담당 강사 (관리자만 변경 가능)</label>
            <select id="instructor_id" name="instructor_id" className="input" defaultValue={v.instructor_id ?? ""}>
              {instructors.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} ({i.role === "admin" ? "관리자" : "강사"})
                </option>
              ))}
            </select>
          </div>
        )}
        {!readOnly && <SubmitButton pendingText="저장 중…">기본 정보 저장</SubmitButton>}
      </fieldset>
    </form>
  );
}
