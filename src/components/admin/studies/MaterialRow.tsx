"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteMaterialItem, saveMaterialItem } from "@/app/admin/study-materials/actions";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";
import { formatBytes, shortDateTimeKST } from "@/lib/study";
import { MB, objectName, type UploadedFile } from "@/lib/upload";
import { removeUploaded, uploadFile } from "@/lib/upload-client";
import { labelKo } from "@/components/admin/sections/dates";

const BUCKET = "study-materials";
const MAX = 50 * MB;

export type MaterialItemLite = { id: number; seq: number; title: string | null; file_name: string; file_size: number | null; updated_at: string };

/** 파일 선택 → 저장소 업로드(items/…) → 서버 등록. 등록 실패 시 올린 파일을 지운다 */
function useItemSave() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(args: { seq: number; title: string; itemId?: number; file: File | null }) {
    setError(null);
    if (args.file && args.file.size > MAX) {
      setError("파일은 50MB 이하만 올릴 수 있어요. PDF 로 줄이거나 나눠 주세요.");
      return false;
    }
    setBusy(true);
    let uploaded: UploadedFile | null = null;
    try {
      if (args.file) uploaded = await uploadFile(BUCKET, `items/${args.seq}-${objectName(args.file)}`, args.file);
      const res = await saveMaterialItem({ seq: args.seq, title: args.title, itemId: args.itemId ?? null, file: uploaded });
      if (!res.ok) {
        if (uploaded) await removeUploaded(BUCKET, [uploaded.path]);
        setError(res.error ?? "저장하지 못했어요.");
        return false;
      }
      router.refresh();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장하지 못했어요.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { save, busy, error, setError };
}

/**
 * 비대면 자료 **회차 한 줄** (2026-09-22 Alan — "1회차, 2회차... 이렇게 설정하고 매달 강사들이 설정한 일정표에 따라 적용").
 * 자료는 회차에 한 번 올리고 매달 다시 쓴다. 옆의 날짜는 **지금 고른 달에 이 회차가 열리는 날** — 그 달 반 편성 달력의 N번째 수업일이다.
 * 그 달 수업일이 N일보다 적으면 "이 달엔 쓰지 않아요" 로 보인다 (자료는 지우지 않는다 — 수업일이 많은 달에 쓰인다).
 */
export function MaterialRow({
  seq,
  date,
  today,
  monthLabel,
  item,
}: {
  seq: number;
  /** 고른 달에 이 회차가 열리는 날 (그 달 N번째 수업일). 없으면 null */
  date: string | null;
  today: string;
  /** "9월" — 날짜 옆 설명에 쓴다 */
  monthLabel: string;
  item: MaterialItemLite | null;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"view" | "upload" | "edit" | "confirm">("view");
  const { save, busy, error, setError } = useItemSave();
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  const isToday = date === today;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0] ?? null;
    if (mode === "upload" && !file) return setError("올릴 파일을 선택해 주세요.");
    const ok = await save({ seq, title: titleRef.current?.value ?? "", itemId: mode === "edit" ? item?.id : undefined, file });
    if (ok) setMode("view");
  }

  const onDelete = () =>
    startTransition(async () => {
      if (!item) return;
      const res = await deleteMaterialItem(item.id);
      if (res.ok) {
        setMode("view");
        router.refresh();
      } else setError(res.error ?? "삭제하지 못했어요.");
    });

  return (
    <li id={`r-${seq}`} className={cn("card p-4", item ? "border-brand-200" : "", isToday && "ring-2 ring-brand-300")}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-[8.5rem]">
          <p className="font-black text-ink">
            {seq}회차
            {isToday && <span className="ml-1.5 rounded-full bg-brand-500 px-1.5 py-0.5 text-[10px] font-black text-white">오늘</span>}
          </p>
          {date ? (
            // labelKo 가 이미 "9월 3일 (목)" 처럼 달을 적는다 — 앞에 달을 또 붙이지 않는다
            <p className="text-xs text-slate">{labelKo(date)}</p>
          ) : (
            <p className="text-xs font-semibold text-mist">{monthLabel}엔 쓰지 않아요</p>
          )}
        </div>

        {item && mode !== "edit" ? (
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-ink" title={item.title ?? item.file_name}>
                {item.title || item.file_name}
              </p>
              <p className="truncate text-xs text-slate">
                {item.title ? `${item.file_name} · ` : ""}
                {formatBytes(item.file_size)} · {shortDateTimeKST(item.updated_at)} 저장
              </p>
            </div>
            {mode === "view" && (
              <span className="flex gap-1">
                <a href={`/files/item/${item.id}?download=1`} className="btn-ghost !px-3 !py-1.5 text-xs">
                  <Icon name="download" size={14} />
                  받기
                </a>
                <button type="button" onClick={() => { setError(null); setMode("edit"); }} className="btn-ghost !px-3 !py-1.5 text-xs">
                  수정
                </button>
                <button type="button" onClick={() => { setError(null); setMode("confirm"); }} className="btn-ghost !px-3 !py-1.5 text-xs text-red-600 hover:!bg-red-50">
                  삭제
                </button>
              </span>
            )}
          </div>
        ) : (
          !item &&
          mode === "view" && (
            <div className="flex flex-1 items-center justify-between gap-2">
              <span className="text-sm text-mist">미등록</span>
              <button type="button" onClick={() => { setError(null); setMode("upload"); }} className="btn-secondary !px-4 !py-2 text-xs">
                <Icon name="upload" size={16} />
                자료 올리기
              </button>
            </div>
          )
        )}
      </div>

      {(mode === "upload" || mode === "edit") && (
        <form onSubmit={onSubmit} className="mt-3 grid gap-2 rounded-xl border border-line bg-surface p-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label htmlFor={`title-${seq}`} className="label !mb-1 text-xs">제목 <span className="font-normal text-mist">(선택)</span></label>
              <input id={`title-${seq}`} ref={titleRef} maxLength={100} defaultValue={item?.title ?? ""} placeholder="예: Part 5 실전 30문항" className="input !py-2 text-sm" disabled={busy} />
            </div>
            <div>
              <label htmlFor={`file-${seq}`} className="label !mb-1 text-xs">
                {mode === "edit" ? <>파일 교체 <span className="font-normal text-mist">(바꿀 때만)</span></> : "파일"}
              </label>
              <input id={`file-${seq}`} ref={fileRef} type="file" className="input !py-1.5 text-sm file:mr-3 file:rounded-full file:border-0 file:bg-brand-50 file:px-3 file:py-1 file:text-xs file:font-bold file:text-brand-700" disabled={busy} />
            </div>
          </div>
          <div className="flex gap-1">
            <button type="submit" disabled={busy} className="btn-primary !px-4 !py-2 text-sm" aria-busy={busy}>
              {busy ? "저장 중…" : mode === "edit" ? "저장" : "올리기"}
            </button>
            <button type="button" onClick={() => { setError(null); setMode("view"); }} disabled={busy} className="btn-ghost !px-3 !py-2 text-xs">
              취소
            </button>
          </div>
        </form>
      )}

      {mode === "confirm" && item && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-red-200 bg-red-50/60 p-3 text-sm">
          <Icon name="warning" size={20} />
          <span className="text-ink">
            {seq}회차 자료를 삭제할까요? 모든 달의 {seq}회차에서 빠져요 (학생이 이미 인증한 회차는 기록이 남아요).
          </span>
          <span className="ml-auto flex gap-1">
            <button type="button" onClick={onDelete} disabled={pending} className="btn-dark !bg-red-600 !px-3 !py-1.5 text-xs hover:!bg-red-700">
              {pending ? "삭제 중…" : "삭제 확정"}
            </button>
            <button type="button" onClick={() => setMode("view")} className="btn-ghost !px-3 !py-1.5 text-xs">
              닫기
            </button>
          </span>
        </div>
      )}

      {error && <p className="mt-2 text-xs font-semibold text-red-600">{error}</p>}
    </li>
  );
}
