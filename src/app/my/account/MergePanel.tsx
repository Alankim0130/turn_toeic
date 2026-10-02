"use client";

import { useActionState } from "react";
import { cancelMerge, chooseMergeAccount, confirmMerge, requestMerge, type AccountState } from "./actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Alert";
import { formatDate } from "@/lib/utils";
import { loginLine, newestLogin } from "@/lib/account";

export type MergeCandidate = {
  user_id: string;
  email_hint: string;
  joined_at: string;
  has_records: boolean;
  providers: string[];
  last_sign_in_at: string | null;
};
export type MergeRequest = {
  id: number;
  from_user: string;
  to_user: string;
  requested_by: string;
  status: string;
  created_at: string;
};
/** 스태프가 보낸 "남길 계정 고르기" 의 두 계정 (merge_choice_info) */
export type ChoiceAccount = {
  user_id: string;
  name: string;
  email_hint: string;
  providers: string[];
  last_sign_in_at: string | null;
  joined_at: string;
  has_records: boolean;
};
/** 지금 로그인한 계정의 로그인 정보 — 후보와 나란히 비교한다 */
export type MeInfo = { providers: string[]; last_sign_in_at: string | null };

/**
 * 계정 통합 (2026-09-18 Alan 확정, 2026-10-02 보강).
 * - 어떤 계정을 남길지는 **학생이 고른다.**
 * - 학생이 스스로 신청하면 **반대쪽 계정으로 로그인해야** 합쳐진다 (본인 확인).
 * - 스태프가 두 계정을 확인하고 보낸 것(`choice`)은 **어느 계정에서든 바로** 고르면 합쳐진다 (2026-10-02 Alan).
 * - 계정마다 **로그인 방법 · 최근 로그인**을 적고 가장 최근 계정에 표시를 둔다 — "어느 계정을 쓰고 있나" 가 고르는 기준이다.
 */
export function MergePanel({
  me,
  meInfo,
  today,
  candidates,
  requests,
  choice,
}: {
  me: string;
  meInfo: MeInfo;
  today: string;
  candidates: MergeCandidate[];
  requests: MergeRequest[];
  /** status = choice 인 요청과 그 두 계정 정보. 없으면 null */
  choice: { request: MergeRequest; accounts: ChoiceAccount[] } | null;
}) {
  const [reqState, reqAction] = useActionState<AccountState, FormData>(requestMerge, {});
  const [okState, okAction] = useActionState<AccountState, FormData>(confirmMerge, {});
  const [cancelState, cancelAction] = useActionState<AccountState, FormData>(cancelMerge, {});
  const [chooseState, chooseAction] = useActionState<AccountState, FormData>(chooseMergeAccount, {});
  const state = [chooseState, okState, cancelState, reqState].find((s) => s.error || s.message) ?? reqState;

  const pendingRequests = requests.filter((r) => r.status === "pending");
  const newestBadge = (id: string, newest: string | null) =>
    newest === id ? <span className="rounded-lg bg-brand-500 px-2 py-0.5 text-xs font-black text-white">최근 로그인 계정</span> : null;

  return (
    <div className="space-y-4">
      {state.error && <Alert kind="warning">{state.error}</Alert>}
      {state.message && <Alert kind="success">{state.message}</Alert>}

      {/* 스태프가 보낸 것 — 남길 계정을 고르면 그 자리에서 합쳐진다 */}
      {choice && (
        <div className="rounded-xl border border-brand-200 bg-brand-50 p-4">
          <p className="text-sm font-black text-brand-700">선생님이 같은 사람의 계정 두 개를 확인했어요 · {formatDate(choice.request.created_at, { month: "long", day: "numeric" })}</p>
          <p className="mt-1 text-sm text-ink">
            <b>어느 계정을 남길까요?</b> 남길 계정으로 숙제·스터디·특강 신청·교재주문·수강 기록이 모두 옮겨지고, 다른 계정은 기록을 보존한 채 로그인만 막혀요.
            보통 <b>지금 쓰는(최근 로그인) 계정</b>을 남기면 돼요.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {choice.accounts.map((a) => {
              const newest = newestLogin(choice.accounts.map((x) => ({ id: x.user_id, lastSignInAt: x.last_sign_in_at })));
              const isMe = a.user_id === me;
              return (
                <div key={a.user_id} className="flex flex-col rounded-xl border border-line bg-paper p-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-black text-ink">{a.email_hint}</span>
                    {isMe && <span className="rounded-lg bg-ink px-2 py-0.5 text-xs font-black text-white">지금 로그인한 계정</span>}
                    {newestBadge(a.user_id, newest)}
                  </div>
                  <p className="mt-1 text-xs text-slate">
                    {loginLine(a.providers, a.last_sign_in_at, today)} · {formatDate(a.joined_at, { year: "numeric", month: "long", day: "numeric" })} 가입
                    {a.has_records ? " · 숙제·수강 기록 있음" : " · 기록 없음"}
                  </p>
                  <form action={chooseAction} className="mt-3">
                    <input type="hidden" name="request_id" value={choice.request.id} />
                    <input type="hidden" name="keep" value={a.user_id} />
                    <SubmitButton pendingText="합치는 중…" variant={isMe ? "primary" : "secondary"} className="w-full sm:w-full">
                      이 계정 남기기
                    </SubmitButton>
                  </form>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-mist">지금 로그인한 계정을 남기지 않으면 합친 뒤 로그아웃 안내가 떠요 — 남긴 계정으로 다시 로그인하면 돼요.</p>
          <form action={cancelAction} className="mt-2">
            <input type="hidden" name="request_id" value={choice.request.id} />
            <SubmitButton pendingText="취소 중…" variant="secondary" className="!py-2 w-full sm:w-auto">같은 사람이 아니에요 — 취소</SubmitButton>
          </form>
        </div>
      )}

      {pendingRequests.map((r) => {
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
              <SubmitButton pendingText="취소 중…" variant="secondary" className="!py-2 w-full sm:w-auto">신청 취소</SubmitButton>
            </form>
          </div>
        );
      })}

      {!choice &&
        pendingRequests.length === 0 &&
        candidates.map((c) => {
          const newest = newestLogin([
            { id: me, lastSignInAt: meInfo.last_sign_in_at },
            { id: c.user_id, lastSignInAt: c.last_sign_in_at },
          ]);
          return (
            <div key={c.user_id} className="rounded-xl border border-line p-4">
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-xl bg-surface p-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-black text-ink">지금 로그인한 계정</span>
                    {newestBadge(me, newest)}
                  </div>
                  <p className="mt-1 text-xs text-slate">{loginLine(meInfo.providers, meInfo.last_sign_in_at, today)}</p>
                </div>
                <div className="rounded-xl bg-surface p-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-black text-ink">{c.email_hint}</span>
                    {newestBadge(c.user_id, newest)}
                  </div>
                  <p className="mt-1 text-xs text-slate">
                    {loginLine(c.providers, c.last_sign_in_at, today)} · {formatDate(c.joined_at, { year: "numeric", month: "long", day: "numeric" })} 가입
                    {c.has_records ? " · 숙제·수강 기록 있어요" : " · 기록 없음"}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-sm text-ink">어느 계정을 남길까요? 보통 최근에 로그인한 계정을 남기면 돼요.</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <form action={reqAction}>
                  <input type="hidden" name="other" value={c.user_id} />
                  <input type="hidden" name="keep" value={me} />
                  <SubmitButton pendingText="신청 중…" className="w-full sm:w-full">지금 계정을 남기기</SubmitButton>
                </form>
                <form action={reqAction}>
                  <input type="hidden" name="other" value={c.user_id} />
                  <input type="hidden" name="keep" value={c.user_id} />
                  <SubmitButton pendingText="신청 중…" variant="secondary" className="w-full sm:w-full">저 계정을 남기기</SubmitButton>
                </form>
              </div>
            </div>
          );
        })}
    </div>
  );
}
