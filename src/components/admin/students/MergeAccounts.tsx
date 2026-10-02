"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { cancelMergeRequest, mergeStudentAccounts, requestMergeChoice, type StudentActionState } from "@/app/admin/students/actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Alert";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { formatDate } from "@/lib/utils";
import { loginLine, newestLogin } from "@/lib/account";

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
  providers: string[];
  last_sign_in_at: string | null;
};
export type MergeRequestRow = { id: number; from_user: string; to_user: string; status: string; created_at: string };
export type StudentLogin = { providers: string[]; last_sign_in_at: string | null };

/**
 * 스태프가 직접 계정 합치기 (2026-09-18 Alan 요청, 2026-10-02 보강).
 *
 * 학생 쪽 통합은 두 계정 모두에 로그인해야 하지만, 여기서는 **강사가 확인하고 바로** 합친다.
 * 되돌리기 어려운 일이라 **"같은 사람이 맞다"를 체크해야** 버튼이 열린다.
 * 2026-10-02: 계정마다 **로그인 방법 · 최근 로그인**을 적고 가장 최근 계정에 표시를 둔다 — "어느 계정을 쓰고 있나" 가 남길 기준이다.
 * 그리고 **학생이 고르게 보내기** — 두 계정에 알림이 가고 학생이 어느 계정에서든 남길 계정을 고르면 그 자리에서 합쳐진다.
 */
export function MergeAccounts({
  student,
  studentLogin,
  candidates,
  requests,
  today,
}: {
  student: { id: string; name: string };
  studentLogin: StudentLogin | null;
  candidates: StaffMergeCandidate[];
  requests: MergeRequestRow[];
  today: string;
}) {
  const [state, action] = useActionState<StudentActionState, FormData>(mergeStudentAccounts, {});
  const [sendState, sendAction] = useActionState<StudentActionState, FormData>(requestMergeChoice, {});
  const [cancelState, cancelAction] = useActionState<StudentActionState, FormData>(cancelMergeRequest, {});
  const [confirmed, setConfirmed] = useState<string | null>(null);
  const shown = [cancelState, sendState, state].find((s) => s.error || s.message) ?? state;

  if (candidates.length === 0 && requests.length === 0) {
    return <p className="mt-2 text-sm text-slate">이름이나 전화번호가 같은 다른 계정이 없어요.</p>;
  }

  const newestBadge = (id: string, newest: string | null) =>
    newest === id ? <span className="rounded-lg bg-brand-500 px-2 py-0.5 text-xs font-black text-white">최근 로그인 계정</span> : null;

  return (
    <div className="mt-3 space-y-3">
      {shown.error && <Alert kind="warning">{shown.error}</Alert>}
      {shown.message && <Alert kind="success">{shown.message}</Alert>}

      {/* 열린 요청 — 학생이 고르는 중이거나 학생끼리 신청한 것. 스태프가 취소할 수 있다 */}
      {requests.map((r) => (
        <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand-200 bg-brand-50 p-3 text-sm">
          <span className="text-ink">
            {r.status === "choice" ? (
              <>
                <b>학생이 남길 계정을 고르는 중</b> — {formatDate(r.created_at, { month: "long", day: "numeric" })} 보냄. 두 계정에 알림이 갔어요.
              </>
            ) : (
              <>
                <b>학생이 통합을 신청함</b> — {formatDate(r.created_at, { month: "long", day: "numeric" })}. 반대쪽 계정에서 확인하면 합쳐져요.
              </>
            )}
          </span>
          <form action={cancelAction}>
            <input type="hidden" name="request_id" value={r.id} />
            <SubmitButton pendingText="취소 중…" variant="secondary" className="!py-1.5 text-xs">취소</SubmitButton>
          </form>
        </div>
      ))}

      {studentLogin && (
        <p className="text-sm text-slate">
          이 학생 계정: <b className="text-ink">{loginLine(studentLogin.providers, studentLogin.last_sign_in_at, today)}</b>
        </p>
      )}
      <p className="text-sm text-slate">
        합치면 <b>숙제·스터디·특강 신청·교재주문·문의·수강 등록과 반 배정</b>이 남길 계정으로 옮겨지고, 비워진 계정은 <b>로그인만 막힙니다</b> (기록은 보존).
        보통 <b>최근에 로그인한 계정</b>을 남깁니다 — 확실하지 않으면 학생이 직접 고르게 보내세요.
      </p>

      {candidates.map((c) => {
        const open = confirmed === c.user_id;
        const newest = newestLogin([
          { id: student.id, lastSignInAt: studentLogin?.last_sign_in_at },
          { id: c.user_id, lastSignInAt: c.last_sign_in_at },
        ]);
        const studentIsNewest = newest === student.id;
        return (
          <div key={c.user_id} className="rounded-xl border border-line p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/admin/students/${c.user_id}`} className="font-black text-ink underline">{c.name || "이름 없음"}</Link>
              <StatusBadge status={c.role} />
              {c.same_name && <span className="rounded-lg bg-brand-50 px-2 py-0.5 text-xs font-bold text-brand-700">이름 같음</span>}
              {c.same_phone && <span className="rounded-lg bg-brand-50 px-2 py-0.5 text-xs font-bold text-brand-700">전화번호 같음</span>}
              {newestBadge(c.user_id, newest)}
            </div>
            <p className="mt-1 text-sm text-slate">
              {c.phone ?? "전화번호 없음"} · {c.email_hint} · {formatDate(c.joined_at, { year: "numeric", month: "long", day: "numeric" })} 가입
              {c.has_records ? " · 숙제·수강 기록 있음" : " · 기록 없음"}
            </p>
            <p className="mt-0.5 text-sm text-slate">
              <b className="text-ink">{loginLine(c.providers, c.last_sign_in_at, today)}</b>
              {studentIsNewest && " — 이 학생 계정이 더 최근에 로그인했어요"}
            </p>

            {/* 학생이 고르게 — 되돌릴 수 있어 체크 없이 바로 보낸다 */}
            <form action={sendAction} className="mt-3">
              <input type="hidden" name="student_id" value={student.id} />
              <input type="hidden" name="other_id" value={c.user_id} />
              <SubmitButton pendingText="보내는 중…" variant="secondary" className="!py-2 text-sm">학생이 남길 계정을 고르게 보내기</SubmitButton>
            </form>

            <label className="mt-3 flex items-start gap-2 text-sm text-ink">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={open}
                onChange={(e) => setConfirmed(e.target.checked ? c.user_id : null)}
              />
              <span>
                <b>{student.name}</b> 님과 <b>{c.name}</b> 님이 같은 사람이 맞고, 내가 바로 합치겠습니다. (합친 뒤에는 되돌리기 어렵습니다)
              </span>
            </label>

            {open && (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <form action={action}>
                  <input type="hidden" name="from_user" value={c.user_id} />
                  <input type="hidden" name="to_user" value={student.id} />
                  <SubmitButton pendingText="합치는 중…" className="w-full sm:w-full">
                    이 학생에게 합치기{studentIsNewest ? " (최근 로그인)" : ""}
                  </SubmitButton>
                </form>
                <form action={action}>
                  <input type="hidden" name="from_user" value={student.id} />
                  <input type="hidden" name="to_user" value={c.user_id} />
                  <SubmitButton pendingText="합치는 중…" className="btn-secondary w-full sm:w-full">
                    저 계정에 합치기{newest === c.user_id ? " (최근 로그인)" : ""}
                  </SubmitButton>
                </form>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
