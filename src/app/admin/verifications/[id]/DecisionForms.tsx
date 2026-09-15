"use client";

import { useActionState } from "react";
import { approveVerification, rejectVerification, updateEnrollment, type ActionState } from "../actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Alert";
import { StatusBadge } from "@/components/admin/StatusBadge";

export type Candidate = { id: number; label: string };
export type OrderInfo = {
  id: number;
  months: number;
  status: string;
  activates_on: string;
  access_until: string;
  enrollments: { id: number; section_id: number | null; mode: string; status: string; label: string }[];
};

export function DecisionForms({
  verificationId,
  result,
  candidates,
  order,
}: {
  verificationId: number;
  result: string | null;
  candidates: Candidate[];
  order: OrderInfo | null;
}) {
  const [approveState, approveAction] = useActionState<ActionState, FormData>(approveVerification, {});
  const [rejectState, rejectAction] = useActionState<ActionState, FormData>(rejectVerification, {});

  if (result === "approved") {
    return (
      <section className="card p-5">
        <h2 className="mb-1 font-black text-ink">배정 수정 (오배정 정정)</h2>
        <p className="mb-4 text-sm text-slate">반이나 수강 방식이 잘못 들어갔다면 여기서 바로 고칩니다. 시청 만료일은 자동으로 다시 계산됩니다.</p>
        {!order || order.enrollments.length === 0 ? (
          <p className="text-sm text-slate">연결된 배정이 없습니다.</p>
        ) : (
          <ul className="space-y-3">
            {order.enrollments.map((e) => (
              <li key={e.id}>
                <EnrollmentEditor verificationId={verificationId} enrollment={e} candidates={candidates} />
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  return (
    <>
      <section className="card p-5">
        <h2 className="mb-1 font-black text-ink">수동 승인</h2>
        <p className="mb-4 text-sm text-slate">
          수강증에 적힌 반을 아래에서 고르세요. 주5일이면 월수금·화목금 두 반을 모두 체크합니다. 개강일 전이면 예비등록생으로 만들어지고 개강일에 자동 전환됩니다.
        </p>
        <form action={approveAction} className="space-y-4">
          <input type="hidden" name="verification_id" value={verificationId} />
          {approveState.error && <Alert kind="warning">{approveState.error}</Alert>}

          <fieldset>
            <legend className="label">배정할 반 (열려 있는 반만 표시)</legend>
            {candidates.length === 0 ? (
              <p className="rounded-xl bg-brand-50/60 px-4 py-4 text-sm text-slate">열려 있는 반이 없습니다. 먼저 반 편성에서 반을 개설해 주세요.</p>
            ) : (
              <ul className="max-h-72 space-y-1.5 overflow-y-auto rounded-xl border border-line p-2">
                {candidates.map((c) => (
                  <li key={c.id}>
                    <label className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-brand-50">
                      <input type="checkbox" name="section_ids" value={c.id} className="mt-1 h-4 w-4 accent-brand-500" />
                      <span className="text-ink-soft">{c.label}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <fieldset>
              <legend className="label">등록 기간</legend>
              <div className="grid grid-cols-2 gap-2">
                {[1, 2].map((m) => (
                  <label key={m} className="cursor-pointer">
                    <input type="radio" name="months" value={m} defaultChecked={m === 1} className="peer sr-only" />
                    <span className="block rounded-xl border border-line px-3 py-2 text-center text-sm font-bold text-slate peer-checked:border-brand-400 peer-checked:bg-brand-50 peer-checked:text-brand-700">{m}개월</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="label">수강 방식</legend>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { v: "onsite", l: "현장" },
                  { v: "live", l: "불라방" },
                ].map((o) => (
                  <label key={o.v} className="cursor-pointer">
                    <input type="radio" name="mode" value={o.v} defaultChecked={o.v === "onsite"} className="peer sr-only" />
                    <span className="block rounded-xl border border-line px-3 py-2 text-center text-sm font-bold text-slate peer-checked:border-brand-400 peer-checked:bg-brand-50 peer-checked:text-brand-700">{o.l}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>

          <div>
            <label htmlFor="receipt_no" className="label">영수증 번호 <span className="font-normal text-mist">(선택 · 중복 등업 방지)</span></label>
            <input id="receipt_no" name="receipt_no" className="input" placeholder="수강증의 영수증/주문 번호" />
          </div>

          <SubmitButton pendingText="승인 처리 중…" className="w-full sm:w-full">승인하고 등업하기</SubmitButton>
        </form>
      </section>

      {result !== "rejected" && (
        <section className="card p-5">
          <h2 className="mb-1 font-black text-ink">반려</h2>
          <p className="mb-4 text-sm text-slate">사유는 학생의 마이페이지에 그대로 표시됩니다.</p>
          <form action={rejectAction} className="space-y-3">
            <input type="hidden" name="verification_id" value={verificationId} />
            {rejectState.error && <Alert kind="warning">{rejectState.error}</Alert>}
            <textarea name="reject_reason" rows={3} className="input resize-y" placeholder="예: 수강증의 이름이 가입 실명과 다릅니다. 실명으로 다시 올려 주세요." />
            <SubmitButton variant="dark" pendingText="반려 처리 중…" className="w-full sm:w-full">반려하기</SubmitButton>
          </form>
        </section>
      )}
    </>
  );
}

function EnrollmentEditor({
  verificationId,
  enrollment,
  candidates,
}: {
  verificationId: number;
  enrollment: OrderInfo["enrollments"][number];
  candidates: Candidate[];
}) {
  const [state, action] = useActionState<ActionState, FormData>(updateEnrollment, {});
  return (
    <form action={action} className="rounded-xl2 border border-line p-3">
      <input type="hidden" name="verification_id" value={verificationId} />
      <input type="hidden" name="enrollment_id" value={enrollment.id} />
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
        <span className="font-bold text-ink">{enrollment.label}</span>
        <StatusBadge status={enrollment.mode} />
        {enrollment.status !== "active" && <StatusBadge status={enrollment.status} />}
      </div>
      {state.error && <Alert kind="warning" className="mb-2">{state.error}</Alert>}
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <select name="section_id" defaultValue={enrollment.section_id ?? ""} className="input !py-2 text-sm" aria-label="반 변경">
          <option value="" disabled>반 선택</option>
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>
        <select name="mode" defaultValue={enrollment.mode} className="input !py-2 text-sm" aria-label="수강 방식">
          <option value="onsite">현장</option>
          <option value="live">불라방</option>
        </select>
        <SubmitButton variant="secondary" pendingText="저장 중…" className="!py-2">저장</SubmitButton>
      </div>
    </form>
  );
}
