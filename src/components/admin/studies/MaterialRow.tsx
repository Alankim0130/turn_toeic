"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteMaterial, saveMaterial } from "@/app/admin/study-materials/actions";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";
import { formatBytes, shortDateTimeKST } from "@/lib/study";
import { MB, objectName, type UploadedFile } from "@/lib/upload";
import { removeUploaded, uploadFile } from "@/lib/upload-client";
import { labelKo } from "@/components/admin/sections/dates";

const BUCKET = "study-materials";
const MAX = 50 * MB;

export type MaterialLite = { id: number; title: string | null; file_name: string; file_size: number | null; updated_at: string };

/** 파일 선택 → 저장소 업로드 → 서버 등록. 등록 실패 시 올린 파일을 지운다 */
function useMaterialSave(studyId: number) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(args: { date: string; title: string; materialId?: number; file: File | null }) {
    setError(null);
    if (args.file && args.file.size > MAX) {
      setError("파일은 50MB 이하만 올릴 수 있어요. PDF 로 줄이거나 나눠 주세요.");
      return false;
    }
    setBusy(true);
    let uploaded: UploadedFile | null = null;
    try {
      if (args.file) uploaded = await uploadFile(BUCKET, `${studyId}/${args.date}-${objectName(args.file)}`, args.file);
      const res = await saveMaterial({ studyId, date: args.date, title: args.title, materialId: args.materialId ?? null, file: uploaded });
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

export function MaterialRow({
  studyId,
  date,
  today,
  isClassDay,
  material,
}: {
  studyId: number;
  date: string;
  today: string;
  isClassDay: boolean;
  material: MaterialLite | null;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"view" | "upload" | "edit" | "confirm">("view");
  const { save, busy, error, setError } = useMaterialSave(studyId);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);

  const isToday = date === today;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0] ?? null;
    if (mode === "upload" && !file) return setError("올릴 파일을 선택해 주세요.");
    const ok = await save({
      date: mode === "edit" ? (dateRef.current?.value ?? date) : date,
      title: titleRef.current?.value ?? "",
      materialId: mode === "edit" ? material?.id : undefined,
      file,
    });
    if (ok) setMode("view");
  }

  const onDelete = () =>
    startTransition(async () => {
      if (!material) return;
      const res = await deleteMaterial(material.id);
      if (res.ok) {
        setMode("view");
        router.refresh();
      } else setError(res.error ?? "삭제하지 못했어요.");
    });

  return (
    <li id={`d-${date}`} className={cn("card p-4", material ? "border-brand-200" : "", isToday && "ring-2 ring-brand-300")}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-[8.5rem]">
          <p className="font-bold text-ink">
            {labelKo(date)}
            {isToday && <span className="ml-1.5 rounded-full bg-brand-500 px-1.5 py-0.5 text-[10px] font-black text-white">오늘</span>}
          </p>
          {isClassDay ? (
            <p className="text-xs text-slate">수업일</p>
          ) : (
            <p className="text-xs font-semibold text-amber-700">수업일 아님</p>
          )}
        </div>

        {material && mode !== "edit" ? (
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-ink" title={material.title ?? material.file_name}>
                {material.title || material.file_name}
              </p>
              <p className="truncate text-xs text-slate">
                {material.title ? `${material.file_name} · ` : ""}
                {formatBytes(material.file_size)} · {shortDateTimeKST(material.updated_at)} 저장
              </p>
            </div>
            {mode === "view" && (
              <span className="flex gap-1">
                <a href={`/files/material/${material.id}?download=1`} className="btn-ghost !px-3 !py-1.5 text-xs">
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
          !material &&
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
              <label htmlFor={`title-${date}`} className="label !mb-1 text-xs">제목 <span className="font-normal text-mist">(선택)</span></label>
              <input id={`title-${date}`} ref={titleRef} maxLength={100} defaultValue={material?.title ?? ""} placeholder="예: Part 5 실전 30문항" className="input !py-2 text-sm" disabled={busy} />
            </div>
            {mode === "edit" && (
              <div>
                <label htmlFor={`date-${date}`} className="label !mb-1 text-xs">날짜</label>
                <input id={`date-${date}`} ref={dateRef} type="date" required defaultValue={date} className="input !py-2 text-sm" disabled={busy} />
              </div>
            )}
            <div>
              <label htmlFor={`file-${date}`} className="label !mb-1 text-xs">
                {mode === "edit" ? <>파일 교체 <span className="font-normal text-mist">(바꿀 때만)</span></> : "파일"}
              </label>
              <input id={`file-${date}`} ref={fileRef} type="file" className="input !py-1.5 text-sm file:mr-3 file:rounded-full file:border-0 file:bg-brand-50 file:px-3 file:py-1 file:text-xs file:font-bold file:text-brand-700" disabled={busy} />
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

      {mode === "confirm" && material && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-red-200 bg-red-50/60 p-3 text-sm">
          <Icon name="warning" size={20} />
          <span className="text-ink">
            이 날짜의 자료를 삭제할까요? 수강생은 더 이상 받을 수 없어요.
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

/** 수업일 목록에 없는 날짜에 자료 추가 */
export function AddMaterialForm({ studyId, defaultDate }: { studyId: number; defaultDate: string }) {
  const { save, busy, error, setError } = useMaterialSave(studyId);
  const [done, setDone] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setDone(false);
    const fd = new FormData(e.currentTarget);
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) return setError("올릴 파일을 선택해 주세요.");
    const ok = await save({ date: String(fd.get("date") ?? ""), title: String(fd.get("title") ?? ""), file });
    if (ok) {
      formRef.current?.reset();
      setDone(true);
    }
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="card grid gap-3 p-4 sm:grid-cols-[10rem_1fr_1fr_auto] sm:items-end">
      <div>
        <label htmlFor="add-date" className="label !mb-1 text-xs">날짜</label>
        <input id="add-date" name="date" type="date" required defaultValue={defaultDate} className="input !py-2 text-sm" disabled={busy} />
      </div>
      <div>
        <label htmlFor="add-title" className="label !mb-1 text-xs">제목 <span className="font-normal text-mist">(선택)</span></label>
        <input id="add-title" name="title" maxLength={100} className="input !py-2 text-sm" disabled={busy} />
      </div>
      <div>
        <label htmlFor="add-file" className="label !mb-1 text-xs">파일</label>
        <input id="add-file" name="file" type="file" required className="input !py-1.5 text-sm file:mr-3 file:rounded-full file:border-0 file:bg-brand-50 file:px-3 file:py-1 file:text-xs file:font-bold file:text-brand-700" disabled={busy} />
      </div>
      <button type="submit" disabled={busy} className="btn-primary !py-2" aria-busy={busy}>
        {busy ? "올리는 중…" : "올리기"}
      </button>
      {(error || done) && (
        <p className={cn("text-xs font-semibold sm:col-span-4", error ? "text-red-600" : "text-brand-600")}>{error ?? "자료를 올렸어요."}</p>
      )}
    </form>
  );
}
