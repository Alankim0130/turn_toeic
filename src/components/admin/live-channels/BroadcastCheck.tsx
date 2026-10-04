"use client";

import { useActionState } from "react";
import { checkMyBroadcasts, type BroadcastCheckState } from "@/app/admin/live-channels/actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { PRIVACY_LABEL } from "@/lib/live-detect";
import { cn, formatDate } from "@/lib/utils";

const hhmm = (iso: string | null) => (iso ? formatDate(iso, { hour: "2-digit", minute: "2-digit" }) : "방금");

/**
 * "지금 내 방송 확인" — 수업 시간이 아니어도 Zoom → 유튜브 송출이 내 채널에 잡히는지 바로 본다 (2026-10-01).
 * 크론과 같은 조회라 여기서 보이면 수업 시간에도 잡힌다. 공개 범위가 **일부 공개**가 아니면 경고한다 —
 * 공개면 아무나 보고, 비공개면 학생이 못 본다.
 */
export function BroadcastCheck() {
  const [state, action] = useActionState<BroadcastCheckState, FormData>(checkMyBroadcasts, {});
  const list = state.broadcasts ?? [];
  return (
    <form action={action} className="rounded-xl border border-line bg-surface p-3">
      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton variant="secondary" className="!w-auto !py-2 text-sm" pendingText="유튜브에 물어보는 중…">
          지금 내 방송 확인
        </SubmitButton>
        <span className="text-xs text-slate">Zoom 에서 「YouTube에서 라이브」를 켠 뒤 눌러 보세요 — 수업 시간이 아니어도 돼요.</span>
      </div>
      {state.error && <p className="mt-2 text-xs font-semibold text-red-600">{state.error}</p>}
      {state.checkedAt && !state.error && (
        list.length === 0 ? (
          <p className="mt-2 text-xs text-slate">
            {hhmm(state.checkedAt)} 기준 진행 중인 방송이 없어요. 송출을 켠 지 1분이 안 됐으면 잠시 뒤 다시 눌러 주세요.
            연결한 계정이 방송하는 계정과 다르면 여기 안 보여요.
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5 text-xs">
            {list.map((b, i) => {
              const good = b.privacy === "unlisted";
              return (
                <li key={i} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-black text-ink">{b.title || "제목 없는 방송"}</span>
                  <span className="text-slate">{b.live ? `${hhmm(b.startedAt)} 시작` : "준비 중"}</span>
                  <span className={cn("rounded-full px-2 py-0.5 font-bold", good ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800")}>
                    {b.privacy ? (PRIVACY_LABEL[b.privacy] ?? b.privacy) : "공개 범위 모름"}
                    {good ? " ✓" : b.privacy === "public" ? " — 일부 공개로 바꿔 주세요" : b.privacy === "private" ? " — 학생이 못 봐요" : ""}
                  </span>
                </li>
              );
            })}
            <li className="text-slate">잡혔어요. 수업 시간에 이렇게 켜면 그 회차 불라방에 걸리고, 오전 · 주간 수업은 끝나면 다시보기로 올라가요.</li>
          </ul>
        )
      )}
    </form>
  );
}
