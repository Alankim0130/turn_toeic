"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { mergeStudentAccounts, type StudentActionState } from "@/app/admin/students/actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Alert";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { formatDate } from "@/lib/utils";

export type StaffMergeCandidate = {
  user_id: string;
  name: string;
  phone: string | null;
  email_hint: string;
  joined_at: string;
  role: string;
  same_name: boolean;
  same_phone: boolean;
  has_records: boolean;
};

/**
 * 스태프가 직접 계정 합치기 (2026-09-18 Alan 요청).
 *
 * 학생 쪽 통합은 두 계정 모두에 로그인해야 하지만, 여기서는 **강사가 확인하고 바로** 합친다.
 * 되돌리기 어려운 일이라 **"같은 사람이 맞다"를 체크해야** 버튼이 열린다.
 */
export function MergeAccounts({ student, candidates }: { student: { id: string; name: string }; candidates: StaffMergeCandidate[] }) {
  const [state, action] = useActionState<StudentActionState, FormData>(mergeStudentAccounts, {});
  const [confirmed, setConfirmed] = useState<string | null>(null);

  if (candidates.length === 0) {
    return <p className="mt-2 text-sm text-slate">이름이나 전화번호가 같은 다른 계정이 없어요.</p>;
  }

  return (
    <div className="mt-3 space-y-3">
      {state.error && <Alert kind="warning">{state.error}</Alert>}
      {state.message && <Alert kind="success">{state.message}</Alert>}

      <p className="text-sm text-slate">
        합치면 <b>숙제·스터디·특강 신청·교재주문·문의·수강 등록과 반 배정</b>이 남길 계정으로 옮겨지고, 비워진 계정은 <b>로그인만 막힙니다</b> (기록은 보존).
      </p>

      {candidates.map((c) => {
        const open = confirmed === c.user_id;
        return (
          <div key={c.user_id} className="rounded-xl border border-line p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/admin/students/${c.user_id}`} className="font-black text-ink underline">{c.name || "이름 없음"}</Link>
              <StatusBadge status={c.role} />
              {c.same_name && <span className="rounded-lg bg-brand-50 px-2 py-0.5 text-xs font-bold text-brand-700">이름 같음</span>}
              {c.same_phone && <span className="rounded-lg bg-brand-50 px-2 py-0.5 text-xs font-bold text-brand-700">전화번호 같음</span>}
            </div>
            <p className="mt-1 text-sm text-slate">
              {c.phone ?? "전화번호 없음"} · {c.email_hint} · {formatDate(c.joined_at, { year: "numeric", month: "long", day: "numeric" })} 가입
              {c.has_records ? " · 숙제·수강 기록 있음" : " · 기록 없음"}
            </p>

            <label className="mt-3 flex items-start gap-2 text-sm text-ink">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={open}
                onChange={(e) => setConfirmed(e.target.checked ? c.user_id : null)}
              />
              <span>
                <b>{student.name}</b> 님과 <b>{c.name}</b> 님이 같은 사람이 맞습니다. (합친 뒤에는 되돌리기 어렵습니다)
              </span>
            </label>

            {open && (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <form action={action}>
                  <input type="hidden" name="from_user" value={c.user_id} />
                  <input type="hidden" name="to_user" value={student.id} />
                  <SubmitButton pendingText="합치는 중…" className="w-full sm:w-full">이 학생에게 합치기</SubmitButton>
                </form>
                <form action={action}>
                  <input type="hidden" name="from_user" value={student.id} />
                  <input type="hidden" name="to_user" value={c.user_id} />
                  <SubmitButton pendingText="합치는 중…" className="btn-secondary w-full sm:w-full">저 계정에 합치기</SubmitButton>
                </form>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
