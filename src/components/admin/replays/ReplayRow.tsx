"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addReplay, updateReplay, deleteReplay, type ReplayState } from "@/app/admin/replays/actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";
import { labelKo } from "@/components/admin/sections/dates";

type Replay = { id: number; video_url: string; published_at: string };

function shorten(url: string, max = 48) {
  const s = url.replace(/^https?:\/\//, "");
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

export function ReplayRow({
  sectionId,
  sessionDateId,
  seq,
  date,
  time,
  replay,
  readOnly,
}: {
  sectionId: number;
  sessionDateId: number;
  seq: number;
  date: string;
  time: string;
  replay: Replay | null;
  readOnly: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"view" | "edit" | "confirm">("view");
  const [addState, addAction] = useActionState<ReplayState, FormData>(addReplay, {});
  const [editState, editAction] = useActionState<ReplayState, FormData>(updateReplay, {});
  const [pending, startTransition] = useTransition();
  const [delError, setDelError] = useState<string | null>(null);

  // 수정 저장이 성공하면 보기 모드로 (렌더 중 파생 상태 갱신 패턴)
  const [seenEdit, setSeenEdit] = useState<ReplayState>(editState);
  if (editState !== seenEdit) {
    setSeenEdit(editState);
    if (editState.ok) setMode("view");
  }

  const onDelete = () => {
    startTransition(async () => {
      if (!replay) return;
      const res = await deleteReplay(replay.id, sectionId);
      if (res.ok) {
        setMode("view");
        router.refresh();
      } else {
        setDelError(res.error ?? "삭제하지 못했어요.");
      }
    });
  };

  return (
    <li className={cn("card p-4", replay && "border-brand-200")}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="w-12 text-lg font-black text-brand-600">{seq}회</span>
        <div className="min-w-[9rem]">
          <p className="font-bold text-ink">{labelKo(date)}</p>
          {time && <p className="text-xs text-slate">{time}</p>}
        </div>

        {replay && mode === "view" && (
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <a
              href={replay.video_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-w-0 items-center gap-1.5 truncate rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand-700 hover:underline"
              title={replay.video_url}
            >
              <Icon name="replay" size={14} />
              <span className="truncate">{shorten(replay.video_url)}</span>
            </a>
            {!readOnly && (
              <span className="ml-auto flex gap-1">
                <button type="button" onClick={() => setMode("edit")} className="btn-ghost !px-3 !py-1.5 text-xs">수정</button>
                <button type="button" onClick={() => setMode("confirm")} className="btn-ghost !px-3 !py-1.5 text-xs text-red-600 hover:!bg-red-50">삭제</button>
              </span>
            )}
          </div>
        )}

        {!replay && readOnly && <span className="text-sm text-mist">미등록</span>}
      </div>

      {/* 등록 */}
      {!replay && !readOnly && (
        <form action={addAction} className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input type="hidden" name="session_date_id" value={sessionDateId} />
          <input type="hidden" name="section_id" value={sectionId} />
          <input
            name="video_url"
            type="url"
            inputMode="url"
            required
            placeholder="https://youtu.be/… 녹화본 주소"
            className="input !py-2"
            defaultValue={addState.value}
            aria-label={`${seq}회 다시보기 주소`}
          />
          <SubmitButton className="sm:w-auto !py-2" pendingText="등록 중…">등록</SubmitButton>
        </form>
      )}
      {addState.error && <p className="mt-2 text-xs font-semibold text-red-600">{addState.error}</p>}

      {/* 수정 */}
      {replay && mode === "edit" && (
        <form action={editAction} className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input type="hidden" name="id" value={replay.id} />
          <input type="hidden" name="section_id" value={sectionId} />
          <input name="video_url" type="url" inputMode="url" required className="input !py-2" defaultValue={editState.value ?? replay.video_url} aria-label={`${seq}회 다시보기 주소 수정`} />
          <div className="flex gap-2">
            <SubmitButton className="sm:w-auto !py-2" pendingText="저장 중…">저장</SubmitButton>
            <button type="button" onClick={() => setMode("view")} className="btn-ghost !py-2">취소</button>
          </div>
        </form>
      )}
      {editState.error && mode === "edit" && <p className="mt-2 text-xs font-semibold text-red-600">{editState.error}</p>}

      {/* 삭제 확인 */}
      {replay && mode === "confirm" && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-red-200 bg-red-50/60 p-3 text-sm">
          <Icon name="warning" size={20} />
          <span className="text-ink">이 회차의 다시보기를 삭제할까요? 수강생은 더 이상 볼 수 없어요.</span>
          <span className="ml-auto flex gap-1">
            <button type="button" onClick={onDelete} disabled={pending} className="btn-dark !bg-red-600 !px-3 !py-1.5 text-xs hover:!bg-red-700">
              {pending ? "삭제 중…" : "삭제 확정"}
            </button>
            <button type="button" onClick={() => setMode("view")} className="btn-ghost !px-3 !py-1.5 text-xs">취소</button>
          </span>
          {delError && <p className="w-full text-xs font-semibold text-red-600">{delError}</p>}
        </div>
      )}
    </li>
  );
}
