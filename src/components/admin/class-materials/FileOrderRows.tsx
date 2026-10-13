"use client";

import { fileKindLabel, type FileRef, type MaterialFile } from "@/lib/class-materials";
import { formatBytes } from "@/lib/study";
import { cn } from "@/lib/utils";
import { MoveButtons, type PickedFile } from "./MaterialFilePicker";

/**
 * 고치는 중인 파일 목록 — 올려 둔 파일과 새로 고른 파일을 한 줄로 그린다 (2026-10-12 Alan "지우고 새로 올렸을때 원래 위치로 조정을 못하고 있어").
 * 위 · 아래 단추로 옮긴 순서가 곧 학생이 보는 순서다. 올려 둔 파일은 `빼기`(저장 전까지 `되살리기`), 새 파일은 `빼기` 로 고른 목록에서 뺀다.
 * 수업자료 수정 폼(`ClassMaterialRow`)과 공지 폼(`NoticeForm`, 2026-10-13 — "공지사항에서도 파일올리기 등등")이 함께 쓴다.
 * 상태(순서 · 뺀 파일 · 고른 파일)는 부르는 쪽이 쥔다 — 저장할 때 그 값으로 `fileOrder` 를 만든다 (`fileOrderItems`).
 */
export function FileOrderRows({
  order,
  oldFiles,
  picked,
  removed,
  disabled,
  onMove,
  onToggleRemove,
  onDropPicked,
}: {
  order: readonly FileRef[];
  /** 올려 둔 파일 — id 로 찾는다 */
  oldFiles: ReadonlyMap<number, MaterialFile>;
  /** 이번에 고른 파일 — key 로 찾는다 */
  picked: ReadonlyMap<string, PickedFile>;
  removed: ReadonlySet<number>;
  disabled: boolean;
  onMove: (index: number, delta: -1 | 1) => void;
  onToggleRemove: (id: number) => void;
  onDropPicked: (key: string) => void;
}) {
  if (order.length === 0) return null;
  return (
    <ul className="mb-1.5 space-y-1.5" aria-label="파일 순서">
      {order.map((r, i) => {
        if (r.kind === "old") {
          const f = oldFiles.get(r.id);
          if (!f) return null;
          const out = removed.has(f.id);
          return (
            <li
              key={`old-${f.id}`}
              className={cn("flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm", out ? "border-dashed border-red-200 bg-red-50/50" : "border-line bg-paper")}
            >
              <span className={cn("shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-black", out ? "bg-surface text-mist" : "bg-brand-50 text-brand-700")}>
                {fileKindLabel(f.file_name, f.content_type)}
              </span>
              <span className={cn("min-w-0 flex-1 [overflow-wrap:anywhere]", out ? "text-mist line-through" : "text-ink")}>{f.file_name}</span>
              {out && <span className="shrink-0 text-[11px] font-bold text-red-600">저장하면 빠져요</span>}
              <MoveButtons name={f.file_name} first={i === 0} last={i === order.length - 1} disabled={disabled || out} onMove={(d) => onMove(i, d)} />
              <button
                type="button"
                onClick={() => onToggleRemove(f.id)}
                disabled={disabled}
                aria-label={out ? `${f.file_name} 되살리기` : `${f.file_name} 빼기`}
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-xs font-bold transition disabled:opacity-50",
                  out ? "text-brand-700 hover:bg-brand-50" : "text-slate hover:bg-red-50 hover:text-red-600",
                )}
              >
                {out ? "되살리기" : "빼기"}
              </button>
            </li>
          );
        }
        const p = picked.get(r.key);
        if (!p) return null;
        return (
          <li key={`new-${p.key}`} className="flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-50/40 px-2.5 py-1.5 text-sm">
            <span className="shrink-0 rounded-md bg-brand-50 px-1.5 py-0.5 text-[10px] font-black text-brand-700">{fileKindLabel(p.file.name, p.file.type)}</span>
            <span className="min-w-0 flex-1 text-ink [overflow-wrap:anywhere]">{p.file.name}</span>
            <span className="shrink-0 text-[11px] font-bold text-brand-700">새 파일</span>
            <span className="shrink-0 text-xs tabular-nums text-mist">{formatBytes(p.file.size)}</span>
            <MoveButtons name={p.file.name} first={i === 0} last={i === order.length - 1} disabled={disabled} onMove={(d) => onMove(i, d)} />
            <button
              type="button"
              onClick={() => onDropPicked(p.key)}
              disabled={disabled}
              aria-label={`${p.file.name} 빼기`}
              className="shrink-0 rounded-full px-2 py-0.5 text-xs font-bold text-slate transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
            >
              빼기
            </button>
          </li>
        );
      })}
    </ul>
  );
}
