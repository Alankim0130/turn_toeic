"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteClassMaterial, saveClassMaterial } from "@/app/admin/class-materials/actions";
import { Icon } from "@/components/ui/Icon";
import { MaterialNote } from "@/components/class-materials/MaterialNote";
import { NoteTextarea } from "./NoteTextarea";
import {
  CLASS_MATERIAL_BUCKET,
  CLASS_MATERIAL_MAX_BYTES,
  CLASS_MATERIAL_TITLE_MAX,
  fileKindLabel,
  isMaterialSubject,
  MATERIAL_SUBJECT_LABEL,
  MATERIAL_SUBJECTS,
  materialObjectPath,
  noteTooLong,
  type MaterialSubject,
} from "@/lib/class-materials";
import { isRoundSet, ROUND_MAX, ROUND_SET_LABEL, ROUND_SETS } from "@/lib/class-rounds";
import { formatBytes, shortDateTimeKST } from "@/lib/study";
import type { UploadedFile } from "@/lib/upload";
import { removeUploaded, uploadFile } from "@/lib/upload-client";
import { cn } from "@/lib/utils";

export type ClassMaterialLite = {
  id: number;
  level: number;
  subject: string;
  /** 과정 A|B · 회차 — 둘 다 비었으면 칸이 생기기 전에 올린 자료 (학생에게 보이지 않는다) */
  book_set: string | null;
  seq: number | null;
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
 * 수정에서는 제목 · 안내 · 파일 교체에 더해 **레벨 · 과목 · 과정 · 회차를 옮길 수 있다** — 다른 칸에 잘못 올렸을 때 지우고 다시 올리지 않게.
 * 옮기면 이 칸 목록에서 빠지고 옮긴 칸에 선다. 과정 · 회차가 없는 옛 자료는 수정에서 둘을 골라야 저장된다 (그래야 학생에게 열린다).
 * `plain` = 회차 카드 안에 놓일 때 (카드 안에 카드를 겹치지 않게 테두리만).
 */
export function ClassMaterialRow({ item, levels, disabled, plain = false }: { item: ClassMaterialLite; levels: number[]; disabled: boolean; plain?: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<"view" | "edit" | "confirm">("view");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const levelRef = useRef<HTMLSelectElement>(null);
  const subjectRef = useRef<HTMLSelectElement>(null);
  const setRef = useRef<HTMLSelectElement>(null);
  const seqRef = useRef<HTMLSelectElement>(null);
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
    const bookSet = setRef.current?.value;
    const seq = Number(seqRef.current?.value);
    if (!isRoundSet(bookSet) || !Number.isInteger(seq) || seq < 1) return setError("과정과 회차를 골라 주세요.");
    const file = fileRef.current?.files?.[0] ?? null;
    if (file && file.size > CLASS_MATERIAL_MAX_BYTES) return setError("파일은 50MB 이하만 올릴 수 있어요.");
    const note = noteRef.current?.value ?? "";
    const noteError = noteTooLong(note);
    if (noteError) return setError(noteError);

    setBusy(true);
    let uploaded: UploadedFile | null = null;
    try {
      // 바꿀 파일은 옮겨 갈 칸의 폴더에 올린다 — 서버가 경로를 그 칸으로 다시 본다
      if (file) uploaded = await uploadFile(CLASS_MATERIAL_BUCKET, materialObjectPath(level, subject, file), file);
      const res = await saveClassMaterial({
        id: item.id,
        level,
        subject,
        bookSet,
        seq,
        title: titleRef.current?.value ?? "",
        note,
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
    <li className={plain ? "rounded-xl border border-line bg-paper p-3" : "card p-4"}>
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
            {!isRoundSet(item.book_set) && <p className="mt-1 text-xs font-bold text-amber-700">과정 · 회차 미정 — 학생에게 보이지 않아요</p>}
          </div>
        </div>

        {item.note && mode !== "edit" && <MaterialNote note={item.note} showCount className="bg-brand-50/70 sm:col-span-2 sm:row-start-2" />}

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
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
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
            <div>
              <label htmlFor={`cm-set-${item.id}`} className="label !mb-1 text-xs">과정</label>
              <select id={`cm-set-${item.id}`} ref={setRef} defaultValue={item.book_set ?? ""} className="input !py-2 text-sm" disabled={busy}>
                {!isRoundSet(item.book_set) && <option value="">고르기</option>}
                {ROUND_SETS.map((b) => (
                  <option key={b} value={b}>
                    {ROUND_SET_LABEL[b]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={`cm-seq-${item.id}`} className="label !mb-1 text-xs">회차</label>
              <select id={`cm-seq-${item.id}`} ref={seqRef} defaultValue={item.seq ?? ""} className="input !py-2 text-sm" disabled={busy}>
                {item.seq == null && <option value="">고르기</option>}
                {Array.from({ length: ROUND_MAX }, (_, k) => k + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}회차
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
              안내 · 스크립트 <span className="font-normal text-mist">(선택)</span>
            </label>
            <NoteTextarea id={`cm-note-${item.id}`} ref={noteRef} defaultValue={item.note ?? ""} disabled={busy} />
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
