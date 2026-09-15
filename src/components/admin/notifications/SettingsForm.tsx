"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/Alert";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { saveNotificationSettings, type SettingsState } from "@/app/admin/notifications/actions";

export type KindOption = { key: string; label: string; desc: string };

/** 받을 알림 종류 켜기·끄기 (사람별, 모든 기기 공통) */
export function SettingsForm({ kinds, values }: { kinds: KindOption[]; values: Record<string, boolean> }) {
  const [state, action] = useActionState<SettingsState, FormData>(saveNotificationSettings, {});

  return (
    <form action={action} className="space-y-2">
      {kinds.map((k) => (
        <label key={k.key} className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-line px-4 py-3 transition hover:border-brand-200">
          <span className="min-w-0">
            <span className="block font-bold text-ink">{k.label}</span>
            <span className="block text-xs text-slate">{k.desc}</span>
          </span>
          <input type="checkbox" name={k.key} defaultChecked={values[k.key] ?? true} className="peer sr-only" />
          <span
            aria-hidden
            className="relative h-6 w-11 shrink-0 rounded-full bg-line transition after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:bg-brand-500 peer-checked:after:translate-x-5 peer-focus-visible:ring-4 peer-focus-visible:ring-brand-100"
          />
        </label>
      ))}
      {state.error && <Alert kind="warning">{state.error}</Alert>}
      {state.ok && <p className="text-sm font-bold text-brand-600">저장했어요.</p>}
      <div className="pt-1">
        <SubmitButton pendingText="저장 중…">알림 설정 저장</SubmitButton>
      </div>
    </form>
  );
}
