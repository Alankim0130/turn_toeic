"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { saveClassMaterial } from "@/app/admin/class-materials/actions";
import { Icon } from "@/components/ui/Icon";
import {
  CLASS_MATERIAL_BUCKET,
  CLASS_MATERIAL_MAX_BYTES,
  CLASS_MATERIAL_NOTE_MAX,
  CLASS_MATERIAL_TITLE_MAX,
  materialObjectPath,
  titleFromFileName,
  type MaterialSubject,
} from "@/lib/class-materials";
import type { UploadedFile } from "@/lib/upload";
import { removeUploaded, uploadFile } from "@/lib/upload-client";

/**
 * 수업자료실 — **지금 고른 레벨 · 과목 칸**에 자료 하나를 올린다 (2026-10-05).
 * 파일은 브라우저가 저장소(`class-materials/{레벨}-{과목}/…`)에 바로 올리고(서버 액션 본문 한도 1MB), 서버는 행만 만든다.
 * 등록이 실패하면 방금 올린 파일을 지운다. 제목을 비우면 파일 이름이 제목이 된다.
 */
export function ClassMaterialUpload({ level, subject, cellLabel }: { level: number; subject: MaterialSubject; cellLabel: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [placeholder, setPlaceholder] = useState("비우면 파일 이름으로 들어가요");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(null);
    const file = fileRef.current?.files?.[0] ?? null;
    if (!file) return setError("올릴 파일을 골라 주세요.");
    if (file.size > CLASS_MATERIAL_MAX_BYTES) return setError("파일은 50MB 이하만 올릴 수 있어요. PDF 로 줄이거나 나눠 주세요.");

    setBusy(true);
    let uploaded: UploadedFile | null = null;
    try {
      uploaded = await uploadFile(CLASS_MATERIAL_BUCKET, materialObjectPath(level, subject, file), file);
      const res = await saveClassMaterial({ level, subject, title: titleRef.current?.value ?? "", note: noteRef.current?.value ?? "", file: uploaded });
      if (!res.ok) {
        await removeUploaded(CLASS_MATERIAL_BUCKET, [uploaded.path]);
        setError(res.error ?? "올리지 못했어요.");
        return;
      }
      formRef.current?.reset();
      setPlaceholder("비우면 파일 이름으로 들어가요");
      setDone(`올렸어요 — ${cellLabel} 자료로 학생 수업자료실에 바로 보여요.`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "올리지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="card space-y-3 p-4 sm:p-5">
      <p className="flex items-center gap-2 font-black text-ink">
        <Icon name="upload" size={22} />
        {cellLabel} 자료 올리기
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="cm-file" className="label !mb-1 text-xs">
            파일 <span className="font-normal text-mist">(50MB 이하 · PDF · 한글 · 워드 · PPT · 그림 등)</span>
          </label>
          <input
            id="cm-file"
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
          <label htmlFor="cm-title" className="label !mb-1 text-xs">
            제목 <span className="font-normal text-mist">(선택)</span>
          </label>
          <input id="cm-title" ref={titleRef} maxLength={CLASS_MATERIAL_TITLE_MAX} placeholder={placeholder} className="input !py-2 text-sm" disabled={busy} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="cm-note" className="label !mb-1 text-xs">
            안내 <span className="font-normal text-mist">(선택 · 학생에게 자료와 함께 보여요)</span>
          </label>
          <textarea
            id="cm-note"
            ref={noteRef}
            rows={2}
            maxLength={CLASS_MATERIAL_NOTE_MAX}
            placeholder="예: 3강 수업 전에 출력해 오세요."
            className="input resize-y !py-2 text-sm"
            disabled={busy}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={busy} aria-busy={busy} className="btn-primary !px-5 !py-2 text-sm">
          {busy ? "올리는 중…" : "올리기"}
        </button>
        {done && (
          <p role="status" className="text-sm font-semibold text-brand-700">
            {done}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm font-semibold text-red-600">
            {error}
          </p>
        )}
      </div>
    </form>
  );
}
