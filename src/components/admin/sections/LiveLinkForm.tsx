"use client";

import { useActionState } from "react";
import { upsertLiveLink, type ActionState } from "@/app/admin/sections/actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Alert";

export function LiveLinkForm({ sectionId, current, readOnly }: { sectionId: number; current: string; readOnly: boolean }) {
  const [state, action] = useActionState<ActionState, FormData>(upsertLiveLink, {});
  const value = state.values?.live_url ?? current;

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="section_id" value={sectionId} />
      {state.error && <Alert kind="warning">{state.error}</Alert>}
      {state.ok && <Alert kind="success">{state.message}</Alert>}
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          name="live_url"
          type="url"
          inputMode="url"
          placeholder="https://zoom.us/j/… 또는 유튜브 라이브 주소"
          className="input"
          defaultValue={value}
          readOnly={readOnly}
        />
        {!readOnly && (
          <div className="flex shrink-0 gap-2">
            <SubmitButton pendingText="저장 중…" className="sm:w-auto">저장</SubmitButton>
            {current && (
              <a href={current} target="_blank" rel="noopener noreferrer" className="btn-secondary">
                링크 열기
              </a>
            )}
          </div>
        )}
      </div>
      {!readOnly && <p className="text-xs text-mist">비워서 저장하면 링크가 삭제됩니다.</p>}
    </form>
  );
}
