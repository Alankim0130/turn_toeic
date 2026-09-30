"use client";

import { useActionState, useState } from "react";
import { upsertSessionLiveLink, type ActionState } from "@/app/admin/sections/actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Icon } from "@/components/ui/Icon";
import { linkKindLabel } from "@/lib/live-links";
import { cn } from "@/lib/utils";

function shorten(url: string, max: number) {
  const s = url.replace(/^https?:\/\//, "");
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

/**
 * 불라방 링크 화면의 회차 한 칸 (2026-09-30 Alan — "현재 시간을 기준점으로 최상단에 링크를 올릴 수 있는 공간").
 * 저장은 반 상세의 회차 표와 **같은 서버 액션**(`upsertSessionLiveLink`)이다 — 링크 한 곳에 저장 길이 둘이면 갈라진다.
 * `big` 은 맨 위(지금 수업) 칸 — 휴대폰에서 붙여 넣기 쉽게 크게.
 */
export function LiveLinkField({
  sessionDateId,
  sectionId,
  current,
  label,
  big = false,
}: {
  sessionDateId: number;
  sectionId: number;
  current: string | null;
  /** 화면 읽기용 이름 (`750+ 월수금 10:00~11:00 3회차`) */
  label: string;
  big?: boolean;
}) {
  const [state, action] = useActionState<ActionState, FormData>(upsertSessionLiveLink, {});
  const [editing, setEditing] = useState(false);
  // 저장에 성공하면 보기 모드로 (렌더 중 파생 상태 갱신 — SessionLiveLinkForm 과 같은 방식)
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state.ok) setEditing(false);
  }

  if (current && !editing) {
    return (
      <div className={cn("flex flex-wrap items-center gap-2", big && "rounded-xl bg-emerald-50 px-3 py-2.5")}>
        <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-black text-white">{linkKindLabel(current)} 링크 있음</span>
        <a
          href={current}
          target="_blank"
          rel="noopener noreferrer"
          className={cn("min-w-0 truncate font-bold text-ink underline decoration-brand-200 underline-offset-2 hover:decoration-brand-500", big ? "text-sm" : "text-xs")}
          title={current}
        >
          {shorten(current, big ? 48 : 34)}
        </a>
        <button type="button" onClick={() => setEditing(true)} className="btn-ghost ml-auto !px-2.5 !py-1 text-xs">
          바꾸기
        </button>
        {state.ok && state.message && <span className="w-full text-xs font-bold text-emerald-700">{state.message} 이 반 수강생 불라방 화면에 떠요.</span>}
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-1.5">
      <input type="hidden" name="session_date_id" value={sessionDateId} />
      <input type="hidden" name="section_id" value={sectionId} />
      <div className="flex flex-wrap items-center gap-2">
        <input
          name="live_url"
          type="url"
          inputMode="url"
          autoComplete="off"
          placeholder="https://zoom.us/j/… Zoom 입장 링크 붙여넣기"
          className={cn("input min-w-0 flex-1", big ? "!py-3 text-base" : "!py-1.5 text-sm")}
          defaultValue={state.values?.live_url ?? current ?? ""}
          aria-label={`${label} 불라방 링크`}
        />
        <SubmitButton className={cn("!w-auto", big ? "!px-6 !py-3 text-base" : "!px-4 !py-1.5 text-sm")} pendingText="저장 중…">
          <Icon name="live" size={big ? 20 : 16} className="brightness-0 invert" />
          저장
        </SubmitButton>
        {current && (
          <button type="button" onClick={() => setEditing(false)} className="btn-ghost !px-3 !py-1.5 text-xs">
            취소
          </button>
        )}
      </div>
      {state.error && <span className="text-xs font-semibold text-red-600">{state.error}</span>}
      {current && <span className="text-[11px] text-mist">비워서 저장하면 링크를 지워요.</span>}
    </form>
  );
}
