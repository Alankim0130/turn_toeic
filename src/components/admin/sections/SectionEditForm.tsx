"use client";

import { useActionState } from "react";
import { updateSection, type ActionState } from "@/app/admin/sections/actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Alert";
import { SectionFields } from "./SectionFields";
import { submitWithoutReset } from "@/lib/form-submit";

type Instructor = { id: string; name: string; role: string };

export function SectionEditForm({
  id,
  values,
  instructors,
  readOnly,
  bookSetNote,
  plan,
}: {
  id: number;
  values: Record<string, string>;
  instructors: Instructor[] | null;
  readOnly: boolean;
  /** 교재를 고를 수 없는 반(묶음 반 · 스파르타 반)의 안내 */
  bookSetNote?: string;
  /** 그 달 시간표가 과정·과목을 정하는 반 — 값과 고치러 가는 길 */
  plan?: { text: string; href: string };
}) {
  const [state, action] = useActionState<ActionState, FormData>(updateSection, {});
  const v: Record<string, string | undefined> = { ...values, ...(state.values ?? {}) };
  // 지금 담당이 목록에 있나 — 없으면(미지정 · 목록에서 빠진 계정) 빈 칸을 맨 앞에 두고 골라 둔다. 빈 칸이 없으면 브라우저가
  // 첫 사람을 골라 두어 '기본 정보 저장' 만 눌러도 그 사람이 담당이 됐다 (2026-10-19). 빈 칸은 담당을 바꾸지 않는다 (updateSection)
  const listed = !!v.instructor_id && !!instructors?.some((i) => i.id === v.instructor_id);

  return (
    // 보내기는 직접 한다 (2026-10-29) — `<form action>` 이 끝나면 React 가 폼을 초기화해 담당 강사 고르기가 처음 모양으로 돌아갔다.
    // 빈 칸에서 강사를 골라 저장하면 빈 칸이 목록에서 빠져 첫 강사가 골라진 채로 보였고, 정원만 고쳐 다시 저장하면 그 강사가 담당이 됐다
    <form action={action} onSubmit={submitWithoutReset(action)} className="space-y-5">
      <input type="hidden" name="id" value={id} />
      {state.error && <Alert kind="warning">{state.error}</Alert>}
      {state.ok && <Alert kind="success">{state.message}</Alert>}

      <fieldset disabled={readOnly} className="space-y-5 disabled:opacity-70">
        <SectionFields values={v} mode="edit" bookSetNote={bookSetNote} plan={plan} />
        {instructors && (
          <div>
            <label htmlFor="instructor_id" className="label">담당 강사 (관리자만 변경 가능)</label>
            <select id="instructor_id" name="instructor_id" className="input" defaultValue={listed ? v.instructor_id : ""}>
              {!listed && <option value="">{v.instructor_id ? "지금 담당 그대로" : "자동 — 편성표대로"}</option>}
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
