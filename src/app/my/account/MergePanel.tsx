"use client";

import { useActionState } from "react";
import { cancelMerge, confirmMerge, requestMerge, type AccountState } from "./actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Alert";
import { formatDate } from "@/lib/utils";

export type MergeCandidate = { user_id: string; email_hint: string; joined_at: string; has_records: boolean };
export type MergeRequest = {
  id: number;
  from_user: string;
  to_user: string;
  requested_by: string;
  created_at: string;
};

/**
 * 계정 통합 (2026-09-18 Alan 확정).
 * - 어떤 계정을 남길지는 **학생이 고른다.**
 * - 신청한 계정에서는 확인 버튼이 없다 — **반대쪽 계정으로 로그인해야** 합쳐진다 (본인 확인).
 */
export function MergePanel({ me, candidates, requests }: { me: string; candidates: MergeCandidate[]; requests: MergeRequest[] }) {
  const [reqState, reqAction] = useActionState<AccountState, FormData>(requestMerge, {});
  const [okState, okAction] = useActionState<AccountState, FormData>(confirmMerge, {});
  const [cancelState, cancelAction] = useActionState<AccountState, FormData>(cancelMerge, {});
  const state = okState.error || okState.message ? okState : cancelState.error || cancelState.message ? cancelState : reqState;

  return (
    <div className="space-y-4">
      {state.error && <Alert kind="warning">{state.error}</Alert>}
      {state.message && <Alert kind="success">{state.message}</Alert>}

      {requests.map((r) => {
        const iAsked = r.requested_by === me;
        const keepIsMe = r.to_user === me;
        return (
          <div key={r.id} className="rounded-xl border border-brand-200 bg-brand-50 p-4">
            <p className="text-sm font-black text-brand-700">통합 신청 {formatDate(r.created_at, { month: "long", day: "numeric" })}</p>
            <p className="mt-1 text-sm text-ink">
              합친 뒤 남는 계정: <b>{keepIsMe ? "지금 로그인한 계정" : "다른 계정"}</b> · 숙제·스터디·특강·교재주문·수강 기록이 남는 계정으로 모두 옮겨집니다.
            </p>
            {iAsked ? (
              <p className="mt-2 text-sm text-slate">
                <b>다른 계정으로 로그인해서 확인</b>해 주세요. 두 계정 모두에 로그인할 수 있어야 합쳐집니다.
              </p>
            ) : (
              <form action={okAction} className="mt-3">
                <input type="hidden" name="request_id" value={r.id} />
                <SubmitButton pendingText="합치는 중…" className="w-full sm:w-auto">계정 합치기</SubmitButton>
              </form>
            )}
            <form action={cancelAction} className="mt-2">
              <input type="hidden" name="request_id" value={r.id} />
              <SubmitButton pendingText="취소 중…" className="btn-secondary !py-2 w-full sm:w-auto">신청 취소</SubmitButton>
            </form>
          </div>
        );
      })}

      {requests.length === 0 &&
        candidates.map((c) => (
          <div key={c.user_id} className="rounded-xl border border-line p-4">
            <p className="text-sm font-black text-ink">{c.email_hint}</p>
            <p className="mt-0.5 text-sm text-slate">
              {formatDate(c.joined_at, { year: "numeric", month: "long", day: "numeric" })} 가입
              {c.has_records ? " · 숙제·수강 기록이 있어요" : " · 기록 없음"}
            </p>
            <p className="mt-2 text-sm text-ink">어느 계정을 남길까요?</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <form action={reqAction}>
                <input type="hidden" name="other" value={c.user_id} />
                <input type="hidden" name="keep" value={me} />
                <SubmitButton pendingText="신청 중…" className="w-full sm:w-full">지금 계정을 남기기</SubmitButton>
              </form>
              <form action={reqAction}>
                <input type="hidden" name="other" value={c.user_id} />
                <input type="hidden" name="keep" value={c.user_id} />
                <SubmitButton pendingText="신청 중…" className="btn-secondary w-full sm:w-full">이 계정을 남기기</SubmitButton>
              </form>
            </div>
          </div>
        ))}
    </div>
  );
}
