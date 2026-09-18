"use client";

import { useActionState, useState } from "react";
import { setLiveToReplay, upsertSessionLiveLink, type ActionState } from "@/app/admin/sections/actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";

function shorten(url: string, max = 36) {
  const s = url.replace(/^https?:\/\//, "");
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

/**
 * 회차 하나의 불라방 링크 (2026-09-18 Alan). 유튜브 라이브처럼 방송이 끝나면 그 주소가 녹화본이 되므로,
 * 오전반(live_to_replay)은 수업이 끝난 뒤 이 링크가 그 회차 다시보기로 자동 연결된다.
 */
export function SessionLiveLinkForm({
  sessionDateId,
  sectionId,
  seq,
  current,
  promoted,
  autoReplay,
  readOnly,
}: {
  sessionDateId: number;
  sectionId: number;
  seq: number;
  current: string;
  /** 이 링크로 다시보기가 이미 만들어졌다 */
  promoted: boolean;
  /** 반의 live_to_replay — 수업이 끝나면 자동 연결 */
  autoReplay: boolean;
  readOnly: boolean;
}) {
  const [state, action] = useActionState<ActionState, FormData>(upsertSessionLiveLink, {});
  const [editing, setEditing] = useState(false);
  // 저장에 성공하면 보기 모드로 (렌더 중 파생 상태 갱신)
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state.ok) setEditing(false);
  }
  const value = state.values?.live_url ?? current;

  if (readOnly) {
    return current ? (
      <a href={current} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-brand-600 hover:underline" title={current}>
        {shorten(current)}
      </a>
    ) : (
      <span className="text-xs text-mist">없음</span>
    );
  }

  if (current && !editing) {
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <a href={current} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-brand-600 hover:underline" title={current}>
          <Icon name="live" size={14} />
          {shorten(current)}
        </a>
        <span
          className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-black", promoted ? "bg-brand-500 text-white" : autoReplay ? "bg-brand-50 text-brand-700" : "bg-line text-slate")}
          title={promoted ? "이 링크가 이 회차 다시보기로 연결됐어요" : autoReplay ? "수업이 끝나면 이 회차 다시보기로 자동 연결돼요" : "이 반의 불라방은 다시보기와 연결하지 않아요"}
        >
          {promoted ? "다시보기 연결됨" : autoReplay ? "끝나면 다시보기로" : "라이브만"}
        </span>
        <button type="button" onClick={() => setEditing(true)} className="btn-ghost !px-2 !py-0.5 text-[11px]">수정</button>
        {state.ok && state.message && <span className="text-[11px] font-semibold text-brand-600">{state.message}</span>}
      </span>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-1">
      <input type="hidden" name="session_date_id" value={sessionDateId} />
      <input type="hidden" name="section_id" value={sectionId} />
      <span className="flex flex-wrap items-center gap-1.5">
        <input
          name="live_url"
          type="url"
          inputMode="url"
          placeholder="https://youtu.be/… 이 회차 라이브 주소"
          className="input !w-56 !py-1 text-xs"
          defaultValue={value}
          aria-label={`${seq}회 불라방 링크`}
        />
        <SubmitButton className="!w-auto !px-3 !py-1 text-xs" pendingText="저장 중…">저장</SubmitButton>
        {current && (
          <button type="button" onClick={() => setEditing(false)} className="btn-ghost !px-2 !py-1 text-xs">취소</button>
        )}
      </span>
      {state.error && <span className="text-[11px] font-semibold text-red-600">{state.error}</span>}
      {current && <span className="text-[11px] text-mist">비워서 저장하면 링크를 지워요. 다시보기가 이미 만들어졌으면 주소가 함께 바뀝니다.</span>}
    </form>
  );
}

/** 반의 "불라방이 끝나면 다시보기로" 스위치 (class_sections.live_to_replay) */
export function LiveReplayToggle({ sectionId, on, readOnly }: { sectionId: number; on: boolean; readOnly: boolean }) {
  const [state, action] = useActionState<ActionState, FormData>(setLiveToReplay, {});
  const [checked, setChecked] = useState(on);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm">
      <input type="hidden" name="section_id" value={sectionId} />
      <label className="flex cursor-pointer items-center gap-2 font-bold text-ink">
        <input
          type="checkbox"
          name="live_to_replay"
          checked={checked}
          disabled={readOnly}
          onChange={(e) => setChecked(e.target.checked)}
          className="size-4 accent-[#ff2e88]"
        />
        수업이 끝나면 그 회차 불라방 링크를 다시보기로 자동 연결
      </label>
      <span className="text-xs text-slate">{checked ? "오전반처럼 — 라이브가 끝난 주소가 그대로 녹화본이 돼요." : "저녁반처럼 — 라이브만 하고 다시보기는 만들지 않아요."}</span>
      {!readOnly && checked !== on && <SubmitButton className="!w-auto !px-3 !py-1 text-xs" pendingText="저장 중…">저장</SubmitButton>}
      {state.error && <span className="text-xs font-semibold text-red-600">{state.error}</span>}
      {state.ok && state.message && checked === on && <span className="text-xs font-semibold text-brand-600">{state.message}</span>}
    </form>
  );
}
