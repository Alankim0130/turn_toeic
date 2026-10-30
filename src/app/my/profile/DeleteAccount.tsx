"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Dialog } from "@/components/ui/Dialog";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { DELETE_CONFIRM_WORD } from "@/lib/account";
import { submitWithoutReset } from "@/lib/form-submit";
import { deleteMyAccount, type DeleteState } from "./actions";

/**
 * 회원 탈퇴 버튼과 확인 팝업 (2026-10-30 — App Store 심사 5.1.1(v) · Alan "전부 지우기").
 * 되돌릴 수 없어서 팝업에서 "탈퇴" 를 직접 적어야 버튼이 열린다. 바깥을 눌러도 닫히지 않는다 (적던 것을 잃지 않게).
 */
export function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [state, action] = useActionState<DeleteState, FormData>(deleteMyAccount, {});
  const ready = typed.trim() === DELETE_CONFIRM_WORD;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn-secondary w-full !text-red-600 sm:w-auto">
        회원 탈퇴
      </button>
      <Dialog open={open} tone="warning" title="정말 탈퇴할까요?" onClose={() => setOpen(false)} dismissible={false}>
        <p className="text-slate">
          계정과 기록이 <span className="font-bold text-ink">바로 모두 지워지고 되돌릴 수 없어요.</span> 등업 · 숙제 · 출석 기록도 다시 살릴 수 없어요.
        </p>
        <form action={action} onSubmit={submitWithoutReset(action)} className="mt-4 space-y-3">
          <div>
            <label htmlFor="delete-confirm" className="label">
              확인을 위해 <span className="text-red-600">{DELETE_CONFIRM_WORD}</span> 라고 적어 주세요
            </label>
            <input
              id="delete-confirm"
              name="confirm"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              autoCapitalize="off"
              className="input"
            />
          </div>
          {state.error && <Alert kind="warning">{state.error}</Alert>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => setOpen(false)} className="btn-ghost w-full sm:w-auto">
              취소
            </button>
            <SubmitButton variant="dark" disabled={!ready} pendingText="지우는 중…" className="!bg-red-600 hover:!bg-red-700">
              탈퇴하기
            </SubmitButton>
          </div>
        </form>
      </Dialog>
    </>
  );
}
