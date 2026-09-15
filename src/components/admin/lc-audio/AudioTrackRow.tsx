"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteAudioTrack, updateAudioTrack, type AudioEditState } from "@/app/admin/lc-audio/actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Icon } from "@/components/ui/Icon";
import { formatBytes } from "@/lib/study";

export type AudioTrackLite = { id: number; title: string; level: number; file_name: string; file_size: number | null };

export function AudioTrackRow({ track, levels }: { track: AudioTrackLite; levels: number[] }) {
  const router = useRouter();
  const [mode, setMode] = useState<"view" | "edit" | "confirm">("view");
  const [state, action] = useActionState<AudioEditState, FormData>(updateAudioTrack, {});
  const [pending, startTransition] = useTransition();
  const [delError, setDelError] = useState<string | null>(null);

  // 저장이 성공하면 보기 모드로 (렌더 중 파생 상태 갱신 패턴)
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state.ok) setMode("view");
  }

  const onDelete = () =>
    startTransition(async () => {
      const res = await deleteAudioTrack(track.id);
      if (res.ok) router.refresh();
      else setDelError(res.error ?? "삭제하지 못했어요.");
    });

  return (
    <li className="card p-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Icon name="headphones" size={28} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold text-ink">{track.title}</p>
          <p className="truncate text-xs text-slate">
            {track.file_name} · {formatBytes(track.file_size)}
          </p>
        </div>
        {mode === "view" && (
          <span className="flex gap-1">
            <button type="button" onClick={() => setMode("edit")} className="btn-ghost !px-3 !py-1.5 text-xs">수정</button>
            <button type="button" onClick={() => { setDelError(null); setMode("confirm"); }} className="btn-ghost !px-3 !py-1.5 text-xs text-red-600 hover:!bg-red-50">삭제</button>
          </span>
        )}
      </div>

      <audio controls preload="none" src={`/files/audio/${track.id}`} className="mt-3 w-full">
        브라우저가 음원 재생을 지원하지 않아요.
      </audio>

      {mode === "edit" && (
        <form action={action} className="mt-3 grid gap-2 rounded-xl border border-line bg-surface p-3 sm:grid-cols-[1fr_9rem_auto] sm:items-end">
          <input type="hidden" name="id" value={track.id} />
          <div>
            <label htmlFor={`title-${track.id}`} className="label !mb-1 text-xs">제목</label>
            <input id={`title-${track.id}`} name="title" required maxLength={100} defaultValue={track.title} className="input !py-2 text-sm" />
          </div>
          <div>
            <label htmlFor={`level-${track.id}`} className="label !mb-1 text-xs">레벨</label>
            <select id={`level-${track.id}`} name="level" defaultValue={track.level} className="input !py-2 text-sm">
              {levels.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-1">
            <SubmitButton className="!px-4 !py-2" pendingText="저장 중…">저장</SubmitButton>
            <button type="button" onClick={() => setMode("view")} className="btn-ghost !px-3 !py-2 text-xs">취소</button>
          </div>
          {state.error && <p className="text-xs font-semibold text-red-600 sm:col-span-3">{state.error}</p>}
        </form>
      )}

      {mode === "confirm" && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-red-200 bg-red-50/60 p-3 text-sm">
          <Icon name="warning" size={20} />
          <span className="text-ink">이 음원을 삭제할까요? 파일도 함께 지워져요.</span>
          <span className="ml-auto flex gap-1">
            <button type="button" onClick={onDelete} disabled={pending} className="btn-dark !bg-red-600 !px-3 !py-1.5 text-xs hover:!bg-red-700">
              {pending ? "삭제 중…" : "삭제 확정"}
            </button>
            <button type="button" onClick={() => setMode("view")} className="btn-ghost !px-3 !py-1.5 text-xs">닫기</button>
          </span>
          {delError && <p className="w-full text-xs font-semibold text-red-600">{delError}</p>}
        </div>
      )}
    </li>
  );
}
