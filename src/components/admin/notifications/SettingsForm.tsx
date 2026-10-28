"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Icon } from "@/components/ui/Icon";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { saveNotificationSettings, type SettingsState } from "@/app/admin/notifications/actions";
import { cn } from "@/lib/utils";

/** `locked` — 이 사람이 켜고 끌 수 없는 알림 (조교에게 강사 · 관리자 알림, 2026-10-28). 스위치가 꺼진 채 잠겨 있고 보내지도 않는다 */
export type KindOption = { key: string; label: string; desc: string; locked?: boolean };

/** 받을 알림 종류 켜기·끄기 (사람별, 모든 기기 공통) */
export function SettingsForm({ kinds, values }: { kinds: KindOption[]; values: Record<string, boolean> }) {
  const [state, action] = useActionState<SettingsState, FormData>(saveNotificationSettings, {});

  return (
    <form action={action} className="space-y-2">
      {kinds.map((k) => (
        <label
          key={k.key}
          className={cn(
            "flex items-center justify-between gap-4 rounded-xl border border-line px-4 py-3 transition",
            k.locked ? "cursor-not-allowed bg-surface" : "cursor-pointer hover:border-brand-200",
          )}
        >
          <span className="min-w-0">
            <span className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 font-bold", k.locked ? "text-slate" : "text-ink")}>
              {k.label}
              {k.locked && (
                <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-line px-2 py-0.5 text-[11px] font-bold text-slate">
                  <Icon name="lock" size={12} />
                  강사 · 관리자만
                </span>
              )}
            </span>
            <span className="block text-xs text-slate">{k.desc}</span>
          </span>
          {/* 잠긴 알림은 보내지 않는다(disabled) — 서버 액션도 그 칸을 받지 않는다 */}
          <input type="checkbox" name={k.key} defaultChecked={!k.locked && values[k.key] === true} disabled={k.locked} className="peer sr-only" />
          <span
            aria-hidden
            className="relative h-6 w-11 shrink-0 rounded-full bg-line transition after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:bg-brand-500 peer-checked:after:translate-x-5 peer-focus-visible:ring-4 peer-focus-visible:ring-brand-100 peer-disabled:opacity-50"
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
