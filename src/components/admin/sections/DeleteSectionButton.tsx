"use client";

import { useActionState, useState } from "react";
import { deleteSection, type ActionState } from "@/app/admin/sections/actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Alert";

export function DeleteSectionButton({ sectionId, disabled }: { sectionId: number; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<ActionState, FormData>(deleteSection, {});

  if (!open) {
    return (
      <button type="button" disabled={disabled} onClick={() => setOpen(true)} className="btn border border-red-300 bg-paper text-red-700 hover:bg-red-50">
        이 반 삭제하기
      </button>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={sectionId} />
      {state.error && <Alert kind="warning">{state.error}</Alert>}
      <label htmlFor="confirm-delete" className="label">
        정말 삭제하려면 <span className="font-mono text-red-700">DELETE</span> 를 입력하세요
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input id="confirm-delete" name="confirm" className="input sm:max-w-xs" autoComplete="off" />
        <SubmitButton variant="dark" className="!bg-red-600 hover:!bg-red-700 sm:w-auto" pendingText="삭제 중…">
          삭제 확정
        </SubmitButton>
        <button type="button" onClick={() => setOpen(false)} className="btn-ghost">
          취소
        </button>
      </div>
    </form>
  );
}
