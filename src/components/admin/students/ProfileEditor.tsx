"use client";

import { useActionState, useState } from "react";
import { updateStudentProfile, type StudentActionState } from "@/app/admin/students/actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Alert";
import { FormError, GenderField, NameField, PhoneField, SchoolFields } from "@/app/(auth)/ProfileFields";

export type EditableProfile = { id: string; name: string; phone: string | null; university: string | null; department: string | null; gender: string | null };

/**
 * 학생 개인정보 수정 (2026-10-02 Alan 요청). 강사·관리자만 — 조교에게는 이 폼이 안 보인다.
 * 칸은 회원가입·내 정보와 같은 `ProfileFields` 라 문구·검사 규칙이 같다. 등급은 옆 칸에서 따로 바꾼다.
 * 접어 두고 "수정하기" 를 눌러야 열린다 — 보는 일이 대부분이라 늘 폼이 펼쳐져 있으면 화면이 길어진다.
 */
export function ProfileEditor({ profile }: { profile: EditableProfile }) {
  const [state, action] = useActionState<StudentActionState, FormData>(updateStudentProfile, {});
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <div className="mt-4">
        {state.message && <Alert kind="success" className="mb-3">{state.message}</Alert>}
        <button type="button" onClick={() => setOpen(true)} className="btn-secondary !py-2 text-sm">
          개인정보 수정하기
        </button>
        <p className="mt-2 text-xs text-mist">가입할 때 이름을 잘못 적었거나 번호가 바뀌었을 때 여기서 고칩니다. 이름을 고치면 멈춰 있던 수강증을 다시 확인해요.</p>
      </div>
    );
  }

  return (
    <form action={action} className="mt-4 space-y-4 rounded-xl border border-brand-200 bg-brand-50/40 p-4">
      <input type="hidden" name="id" value={profile.id} />
      <FormError error={state.error} stateKey={state} />
      {state.message && <Alert kind="success">{state.message}</Alert>}

      <NameField defaultValue={profile.name} />
      <p className="-mt-2 text-xs text-mist">수강증의 `수강생` 칸과 같아야 자동 등업이 돼요. 고치면 이름 때문에 멈춰 있던 수강증을 다시 봅니다.</p>
      <PhoneField defaultValue={profile.phone ?? ""} />
      <SchoolFields university={profile.university ?? ""} department={profile.department ?? ""} />
      <GenderField defaultValue={profile.gender ?? ""} />

      <div className="flex flex-wrap gap-2">
        <SubmitButton pendingText="저장 중…">저장</SubmitButton>
        <button type="button" onClick={() => setOpen(false)} className="btn-ghost !py-2 text-sm">닫기</button>
      </div>
    </form>
  );
}
