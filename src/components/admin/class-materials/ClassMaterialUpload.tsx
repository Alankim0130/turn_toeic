"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { saveClassMaterial } from "@/app/admin/class-materials/actions";
import {
  CLASS_MATERIAL_BUCKET,
  CLASS_MATERIAL_MAX_BYTES,
  CLASS_MATERIAL_TITLE_MAX,
  materialObjectPath,
  noteTooLong,
  titleFromFileName,
  type MaterialSubject,
} from "@/lib/class-materials";
import type { RoundSet } from "@/lib/class-rounds";
import type { UploadedFile } from "@/lib/upload";
import { removeUploaded, uploadFile } from "@/lib/upload-client";
import { NoteTextarea } from "./NoteTextarea";

/**
 * 수업자료실 — **한 회차**(레벨 × 과목 × 과정 × 회차)에 자료 하나를 올린다 (2026-10-05).
 * 파일은 브라우저가 저장소(`class-materials/{레벨}-{과목}/…`)에 바로 올리고(서버 액션 본문 한도 1MB), 서버는 행만 만든다.
 * 등록이 실패하면 방금 올린 파일을 지운다. 제목을 비우면 파일 이름이 제목이 된다. 올리면 폼을 닫는다 (그 회차 줄에 자료가 선다).
 */
export function ClassMaterialUpload({
  level,
  subject,
  set,
  seq,
  cellLabel,
  onClose,
}: {
  level: number;
  subject: MaterialSubject;
  set: RoundSet;
  seq: number;
  cellLabel: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placeholder, setPlaceholder] = useState("비우면 파일 이름으로 들어가요");
  const id = `cm-${level}-${subject}-${set}-${seq}`;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const file = fileRef.current?.files?.[0] ?? null;
    if (!file) return setError("올릴 파일을 골라 주세요.");
    if (file.size > CLASS_MATERIAL_MAX_BYTES) return setError("파일은 50MB 이하만 올릴 수 있어요. PDF 로 줄이거나 나눠 주세요.");
    const note = noteRef.current?.value ?? "";
    const noteError = noteTooLong(note);
    if (noteError) return setError(noteError);

    setBusy(true);
    let uploaded: UploadedFile | null = null;
    try {
      uploaded = await uploadFile(CLASS_MATERIAL_BUCKET, materialObjectPath(level, subject, file), file);
      const res = await saveClassMaterial({
        level,
        subject,
        bookSet: set,
        seq,
        title: titleRef.current?.value ?? "",
        note,
        file: uploaded,
      });
      if (!res.ok) {
        await removeUploaded(CLASS_MATERIAL_BUCKET, [uploaded.path]);
        setError(res.error ?? "올리지 못했어요.");
        return;
      }
      onClose();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "올리지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-3 space-y-3 rounded-xl border border-brand-100 bg-brand-50/50 p-3 sm:p-4">
      <p className="text-sm font-black text-ink">{cellLabel}에 올리기</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-file`} className="label !mb-1 text-xs">
            파일 <span className="font-normal text-mist">(50MB 이하 · PDF · 한글 · 워드 · PPT · 그림 등)</span>
          </label>
          <input
            id={`${id}-file`}
            ref={fileRef}
            type="file"
            required
            disabled={busy}
            onChange={(e) => {
              const f = e.currentTarget.files?.[0];
              setPlaceholder(f ? titleFromFileName(f.name) : "비우면 파일 이름으로 들어가요");
            }}
            className="input !py-1.5 text-sm file:mr-3 file:rounded-full file:border-0 file:bg-brand-50 file:px-3 file:py-1 file:text-xs file:font-bold file:text-brand-700"
          />
        </div>
        <div>
          <label htmlFor={`${id}-title`} className="label !mb-1 text-xs">
            제목 <span className="font-normal text-mist">(선택)</span>
          </label>
          <input id={`${id}-title`} ref={titleRef} maxLength={CLASS_MATERIAL_TITLE_MAX} placeholder={placeholder} className="input !py-2 text-sm" disabled={busy} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={`${id}-note`} className="label !mb-1 text-xs">
            안내 · 스크립트 <span className="font-normal text-mist">(선택 · 학생에게 자료와 함께 보여요 · 길면 접혀요)</span>
          </label>
          <NoteTextarea id={`${id}-note`} ref={noteRef} placeholder={"예: 수업 전에 출력해 오세요.\n스크립트를 그대로 붙여 넣어도 돼요 — 줄바꿈도 그대로 보여요."} disabled={busy} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={busy} aria-busy={busy} className="btn-primary !px-5 !py-2 text-sm">
          {busy ? "올리는 중…" : "올리기"}
        </button>
        <button type="button" onClick={onClose} disabled={busy} className="btn-ghost !px-3 !py-2 text-xs">
          닫기
        </button>
        {error && (
          <p role="alert" className="text-sm font-semibold text-red-600">
            {error}
          </p>
        )}
      </div>
    </form>
  );
}
