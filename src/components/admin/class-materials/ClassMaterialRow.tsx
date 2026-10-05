"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteClassMaterial, saveClassMaterial } from "@/app/admin/class-materials/actions";
import { Icon } from "@/components/ui/Icon";
import {
  CLASS_MATERIAL_BUCKET,
  CLASS_MATERIAL_MAX_BYTES,
  CLASS_MATERIAL_NOTE_MAX,
  CLASS_MATERIAL_TITLE_MAX,
  fileKindLabel,
  isMaterialSubject,
  MATERIAL_SUBJECT_LABEL,
  MATERIAL_SUBJECTS,
  materialObjectPath,
  type MaterialSubject,
} from "@/lib/class-materials";
import { formatBytes, shortDateTimeKST } from "@/lib/study";
import type { UploadedFile } from "@/lib/upload";
import { removeUploaded, uploadFile } from "@/lib/upload-client";
import { cn } from "@/lib/utils";

export type ClassMaterialLite = {
  id: number;
  level: number;
  subject: string;
  title: string;
  note: string | null;
  file_name: string;
  file_size: number | null;
  content_type: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * 수업자료실 자료 한 줄 (2026-10-05) — 받기 · 수정 · 삭제.
 * 수정에서는 제목 · 안내 · 파일 교체에 더해 **레벨 · 과목을 옮길 수 있다** — 다른 칸에 잘못 올렸을 때 지우고 다시 올리지 않게.
 * 옮기면 이 칸 목록에서 빠지고 옮긴 칸에 선다.
 */
export function ClassMaterialRow({ item, levels, disabled }: { item: ClassMaterialLite; levels: number[]; disabled: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<"view" | "edit" | "confirm">("view");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const levelRef = useRef<HTMLSelectElement>(null);
  const subjectRef = useRef<HTMLSelectElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const kind = fileKindLabel(item.file_name, item.content_type);
  const edited = item.updated_at.slice(0, 16) !== item.created_at.slice(0, 16);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const level = Number(levelRef.current?.value);
    const subjectValue = subjectRef.current?.value;
    if (!isMaterialSubject(subjectValue)) return setError("RC · LC 를 다시 골라 주세요.");
    const subject: MaterialSubject = subjectValue;
    const file = fileRef.current?.files?.[0] ?? null;
    if (file && file.size > CLASS_MATERIAL_MAX_BYTES) return setError("파일은 50MB 이하만 올릴 수 있어요.");

    setBusy(true);
    let uploaded: UploadedFile | null = null;
    try {
      // 바꿀 파일은 옮겨 갈 칸의 폴더에 올린다 — 서버가 경로를 그 칸으로 다시 본다
      if (file) uploaded = await uploadFile(CLASS_MATERIAL_BUCKET, materialObjectPath(level, subject, file), file);
      const res = await saveClassMaterial({
        id: item.id,
        level,
        subject,
        title: titleRef.current?.value ?? "",
        note: noteRef.current?.value ?? "",
        file: uploaded,
      });
      if (!res.ok) {
        if (uploaded) await removeUploaded(CLASS_MATERIAL_BUCKET, [uploaded.path]);
        setError(res.error ?? "저장하지 못했어요.");
        return;
      }
      setMode("view");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장하지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  const onDelete = () =>
    startTransition(async () => {
      setError(null);
      const res = await deleteClassMaterial(item.id);
      if (!res.ok) return setError(res.error ?? "삭제하지 못했어요.");
      setMode("view");
      router.refresh();
    });

  return (
    <li className="card p-4">
      {/* 휴대폰: 제목 → 안내 → 버튼. 넓은 화면: 제목 줄 오른쪽에 버튼, 안내는 그 아래 한 줄 전체 */}
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div className="flex min-w-0 items-start gap-3 sm:col-start-1 sm:row-start-1">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-[11px] font-black text-brand-700 ring-1 ring-brand-100">
            {kind}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-black leading-snug text-ink [overflow-wrap:anywhere]">{item.title}</p>
            <p className="mt-0.5 text-xs text-slate [overflow-wrap:anywhere]">
              {item.file_name} · {formatBytes(item.file_size)} · {shortDateTimeKST(item.created_at)} 올림{edited && <> · {shortDateTimeKST(item.updated_at)} 고침</>}
            </p>
          </div>
        </div>

        {item.note && mode !== "edit" && (
          <p className="whitespace-pre-wrap rounded-xl bg-brand-50/70 px-3 py-2 text-sm leading-relaxed text-ink-soft [overflow-wrap:anywhere] sm:col-span-2 sm:row-start-2">
            <span className="mr-1.5 text-xs font-black text-brand-700">안내</span>
            {item.note}
          </p>
        )}

        {mode === "view" && (
          <div className="flex flex-wrap justify-end gap-1 sm:col-start-2 sm:row-start-1">
            <a href={`/files/class/${item.id}?download=1`} className="btn-ghost !px-3 !py-1.5 text-xs">
              <Icon name="download" size={14} />
              받기
            </a>
            {!disabled && (
              <>
                <button type="button" onClick={() => { setError(null); setMode("edit"); }} className="btn-ghost !px-3 !py-1.5 text-xs">
                  수정
                </button>
                <button type="button" onClick={() => { setError(null); setMode("confirm"); }} className="btn-ghost !px-3 !py-1.5 text-xs text-red-600 hover:!bg-red-50">
                  삭제
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {mode === "edit" && (
        <form onSubmit={onSave} className="mt-3 grid gap-2 rounded-xl border border-line bg-surface p-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor={`cm-level-${item.id}`} className="label !mb-1 text-xs">레벨</label>
              <select id={`cm-level-${item.id}`} ref={levelRef} defaultValue={String(item.level)} className="input !py-2 text-sm" disabled={busy}>
                {levels.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={`cm-subject-${item.id}`} className="label !mb-1 text-xs">과목</label>
              <select id={`cm-subject-${item.id}`} ref={subjectRef} defaultValue={item.subject} className="input !py-2 text-sm" disabled={busy}>
                {MATERIAL_SUBJECTS.map((s) => (
                  <option key={s} value={s}>
                    {MATERIAL_SUBJECT_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label htmlFor={`cm-title-${item.id}`} className="label !mb-1 text-xs">제목</label>
              <input id={`cm-title-${item.id}`} ref={titleRef} maxLength={CLASS_MATERIAL_TITLE_MAX} defaultValue={item.title} className="input !py-2 text-sm" disabled={busy} />
            </div>
            <div>
              <label htmlFor={`cm-file-${item.id}`} className="label !mb-1 text-xs">
                파일 교체 <span className="font-normal text-mist">(바꿀 때만)</span>
              </label>
              <input
                id={`cm-file-${item.id}`}
                ref={fileRef}
                type="file"
                disabled={busy}
                className="input !py-1.5 text-sm file:mr-3 file:rounded-full file:border-0 file:bg-brand-50 file:px-3 file:py-1 file:text-xs file:font-bold file:text-brand-700"
              />
            </div>
          </div>
          <div>
            <label htmlFor={`cm-note-${item.id}`} className="label !mb-1 text-xs">
              안내 <span className="font-normal text-mist">(선택)</span>
            </label>
            <textarea id={`cm-note-${item.id}`} ref={noteRef} rows={2} maxLength={CLASS_MATERIAL_NOTE_MAX} defaultValue={item.note ?? ""} className="input resize-y !py-2 text-sm" disabled={busy} />
          </div>
          <div className="flex justify-end gap-1">
            <button type="submit" disabled={busy} aria-busy={busy} className="btn-primary !px-4 !py-2 text-sm">
              {busy ? "저장 중…" : "저장"}
            </button>
            <button type="button" onClick={() => { setError(null); setMode("view"); }} disabled={busy} className="btn-ghost !px-3 !py-2 text-xs">
              취소
            </button>
          </div>
        </form>
      )}

      {mode === "confirm" && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-red-200 bg-red-50/60 p-3 text-sm">
          <Icon name="warning" size={20} />
          <span className="min-w-0 flex-1 text-ink">이 자료를 삭제할까요? 학생 수업자료실에서도 바로 빠지고 파일도 지워져요.</span>
          <span className="flex gap-1">
            <button type="button" onClick={onDelete} disabled={pending} className={cn("btn-dark !bg-red-600 !px-3 !py-1.5 text-xs hover:!bg-red-700")}>
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
