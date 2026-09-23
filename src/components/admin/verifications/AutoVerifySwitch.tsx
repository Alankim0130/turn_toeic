"use client";

import { useActionState } from "react";
import { rematchHeldNow, setAutoVerify, type ActionState } from "@/app/admin/verifications/actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";

export type AutoVerifyView =
  | { kind: "on" }
  | { kind: "off"; note: string | null; changed: string | null }
  /** 스위치를 읽지 못했다 — 서버는 이때 자동 판정을 멈춘다 (`readAutoVerify`) */
  | { kind: "unreadable" }
  /** 테스트 등급을 켠 스태프 — RLS 가 학생으로 보아 스위치를 못 읽는다 (서버의 판정과는 상관없다) */
  | { kind: "testing" };

/**
 * 수강증 자동 판정 **긴급 스위치** (2026-09-22 Alan "자동 승인 긴급 스위치"). 등업 로그 맨 위에 늘 보인다.
 * 켜고 끄는 버튼은 강사·관리자에게만 그린다 — 조교는 상태만 본다 (서버 액션 `setAutoVerify` 가 requireStaff 로 한 번 더 막는다).
 */
export function AutoVerifySwitch({ view, canEdit }: { view: AutoVerifyView; canEdit: boolean }) {
  const [state, action] = useActionState<ActionState, FormData>(setAutoVerify, {});
  if (view.kind === "testing") {
    return (
      <p className="mb-5 rounded-xl2 border border-line bg-paper p-4 text-sm text-slate">
        테스트 등급으로 보는 중이라 <b className="text-ink">자동 판정 스위치</b>를 볼 수 없어요 — 테스트를 끝내면 보여요.
      </p>
    );
  }
  const off = view.kind !== "on";

  return (
    <section
      aria-label="수강증 자동 판정 스위치"
      className={cn("mb-5 rounded-xl2 border p-4 text-sm", off ? "border-amber-200 bg-amber-50" : "border-brand-200 bg-brand-50")}
    >
      <div className="flex flex-wrap items-start gap-3">
        <Icon name={off ? "warning" : "bolt"} size={28} className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="font-black text-ink">
            {view.kind === "on" ? "수강증 자동 판정 켜짐" : view.kind === "off" ? "수강증 자동 판정이 멈춰 있어요" : "자동 판정 스위치를 읽지 못했어요"}
          </p>
          <p className="mt-0.5 text-slate">
            {view.kind === "on"
              ? "딱 맞는 수강증은 바로 등업하고, 우리 수강증·수강월이 아니면 바로 거절해요. 문제가 생기면 멈추세요 — 배포 없이 바로 먹어요."
              : view.kind === "off"
                ? "기계가 승인도 거절도 하지 않아요 — 모든 수강증이 검토 대기로 와요. 읽은 값과 찾은 반은 승인 화면에 그대로 채워져 있어요."
                : "그동안 자동 판정은 멈춰 있어요 — 모든 수강증이 검토 대기로 와요. 잠시 뒤 새로고침해 주세요."}
          </p>
          {view.kind === "off" && (view.changed || view.note) && (
            <p className="mt-1 text-xs text-mist">
              {view.changed}
              {view.changed && view.note && " · "}
              {view.note && <>까닭: {view.note}</>}
            </p>
          )}
        </div>

        {canEdit && view.kind !== "unreadable" && (
          <form action={action} className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <input type="hidden" name="enabled" value={off ? "true" : "false"} />
            {!off && (
              <input
                name="note"
                maxLength={200}
                placeholder="멈추는 까닭 (선택)"
                aria-label="멈추는 까닭"
                className="input !py-2 text-sm sm:!w-56"
              />
            )}
            <SubmitButton variant={off ? "primary" : "secondary"} className="!py-2 text-sm" pendingText="바꾸는 중…">
              {off ? "자동 판정 다시 켜기" : "자동 판정 멈추기"}
            </SubmitButton>
          </form>
        )}
      </div>
      {off && canEdit && view.kind === "off" && (
        <p className="mt-2 text-xs text-mist">다시 켜도 멈춰 있는 동안 올라온 수강증은 검토 대기에 그대로 남아요 — 직접 처리해 주세요.</p>
      )}
      {state.error && <p className="mt-2 text-xs font-bold text-red-700">{state.error}</p>}
      {state.ok && state.message && <p className="mt-2 text-xs font-bold text-brand-700">{state.message}</p>}
    </section>
  );
}

/** 받아 둔 다음 달 수강증을 지금 다시 맞추는 버튼 — 보통은 반을 열 때 저절로 돈다 */
export function RematchHeldButton() {
  const [state, action] = useActionState<ActionState>(rematchHeldNow, {});
  return (
    <form action={action} className="flex flex-col gap-1 sm:items-end">
      <SubmitButton variant="secondary" className="!py-2 text-sm" pendingText="맞추는 중…">
        지금 다시 맞추기
      </SubmitButton>
      {state.error && <span className="text-xs font-bold text-red-700">{state.error}</span>}
      {state.ok && state.message && <span className="text-xs font-bold text-brand-700">{state.message}</span>}
    </form>
  );
}
