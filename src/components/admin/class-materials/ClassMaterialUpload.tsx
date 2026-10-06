"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { saveClassMaterial } from "@/app/admin/class-materials/actions";
import {
  CLASS_MATERIAL_BUCKET,
  CLASS_MATERIAL_FILES_MAX,
  CLASS_MATERIAL_LINKS_MAX,
  CLASS_MATERIAL_TITLE_MAX,
  defaultMaterialTitle,
  draftLinks,
  materialObjectPath,
  noteHasText,
  noteTooLong,
  parseMaterialLinks,
  type MaterialSubject,
} from "@/lib/class-materials";
import type { RoundSet } from "@/lib/class-rounds";
import type { UploadedFile } from "@/lib/upload";
import { removeUploaded, uploadFile } from "@/lib/upload-client";
import { MaterialFilePicker, type PickedFile } from "./MaterialFilePicker";
import { emptyLinkRow, MaterialLinkEditor, type LinkRow } from "./MaterialLinkEditor";
import { NoteTextarea } from "./NoteTextarea";

/**
 * 수업자료실 — **한 회차**(레벨 × 과목 × 과정 × 회차)에 자료 하나를 올린다 (2026-10-05).
 * **자료 하나 = 게시판 글 하나** (2026-10-06 Alan — "파일업로드를 안하고 글만 적어서 올릴수도 있도록 … 파일을 한번에 여러개 올릴 수 있도록"):
 * 제목 → 안내 · 스크립트 → 파일 0 ~ 20개 → **링크 0 ~ 20개**(같은 날 Alan "유튜브 링크를 … 여러개") 순서다.
 * 글 · 파일 · 링크가 다 없을 때만 막는다 (예전에는 파일 칸이 `required` 라 글만 쓰면 브라우저가 막았다).
 * 링크는 올리기 전에 `parseMaterialLinks` 로 먼저 본다 — 못 읽는 주소가 있으면 파일을 올리기 전에 그 줄을 빨갛게 짚는다.
 * 파일은 브라우저가 저장소(`class-materials/{레벨}-{과목}/…`)에 하나씩 바로 올리고(서버 액션 본문 한도 1MB), 서버는 행만 만든다.
 * 등록이 실패하면 방금 올린 파일을 지운다. 제목을 비우면 `defaultMaterialTitle`(자리 표시에 비친 그대로). 올리면 폼을 닫는다 (그 회차 줄에 자료가 선다).
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
  const titleRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [linkRows, setLinkRows] = useState<LinkRow[]>(() => [emptyLinkRow()]);
  const [badLink, setBadLink] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pickProblem, setPickProblem] = useState<string | null>(null);
  const id = `cm-${level}-${subject}-${set}-${seq}`;
  const readable = draftLinks(linkRows);
  const placeholder =
    files.length > 0 || readable.length > 0 ? defaultMaterialTitle(files.map((p) => p.file.name), null, readable) : "비우면 파일 이름 · 링크 이름 · 안내 첫 줄로 들어가요";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const note = noteRef.current?.value ?? "";
    const noteError = noteTooLong(note);
    if (noteError) return setError(noteError);
    const parsed = parseMaterialLinks(linkRows);
    if (!parsed.ok) {
      setBadLink(parsed.index ?? null);
      return setError(parsed.error);
    }
    if (files.length === 0 && parsed.links.length === 0 && !noteHasText(note)) return setError("파일 · 링크를 넣거나 안내 · 스크립트를 적어 주세요. 글만 올려도 돼요.");

    setBusy(true);
    const uploaded: UploadedFile[] = [];
    try {
      // 하나씩 올린다 — 큰 파일 여럿을 한꺼번에 보내면 휴대폰에서 다 같이 느려진다
      for (const [k, p] of files.entries()) {
        setProgress(files.length > 1 ? `파일 올리는 중 ${k + 1}/${files.length}…` : "파일 올리는 중…");
        uploaded.push(await uploadFile(CLASS_MATERIAL_BUCKET, materialObjectPath(level, subject, p.file), p.file));
      }
      setProgress("저장하는 중…");
      const res = await saveClassMaterial({
        level,
        subject,
        bookSet: set,
        seq,
        title: titleRef.current?.value ?? "",
        note,
        files: uploaded,
        links: parsed.links,
      });
      if (!res.ok) {
        await removeUploaded(CLASS_MATERIAL_BUCKET, uploaded.map((u) => u.path));
        setError(res.error ?? "올리지 못했어요.");
        return;
      }
      onClose();
      router.refresh();
    } catch (err) {
      // 중간에 끊기면 그때까지 올린 파일을 지운다 — 어느 자료에도 붙지 않은 파일이 저장소에 남지 않게
      if (uploaded.length) await removeUploaded(CLASS_MATERIAL_BUCKET, uploaded.map((u) => u.path));
      setError(err instanceof Error ? err.message : "올리지 못했어요.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-3 space-y-3 rounded-xl border border-brand-100 bg-brand-50/50 p-3 sm:p-4">
      <p className="text-sm font-black text-ink">{cellLabel}에 올리기</p>
      <div>
        <label htmlFor={`${id}-title`} className="label !mb-1 text-xs">
          제목 <span className="font-normal text-mist">(선택)</span>
        </label>
        <input id={`${id}-title`} ref={titleRef} maxLength={CLASS_MATERIAL_TITLE_MAX} placeholder={placeholder} className="input !py-2 text-sm" disabled={busy} />
      </div>
      <div>
        <label htmlFor={`${id}-note`} className="label !mb-1 text-xs">
          안내 · 스크립트 <span className="font-normal text-mist">(학생에게 자료와 함께 보여요 · 길면 접혀요)</span>
        </label>
        <NoteTextarea id={`${id}-note`} ref={noteRef} placeholder={"예: 수업 전에 출력해 오세요.\n스크립트를 그대로 붙여 넣어도 돼요 — 줄바꿈도 그대로 보여요."} disabled={busy} />
      </div>
      <div>
        <p className="label !mb-1 text-xs">
          파일{" "}
          <span className="font-normal text-mist">
            (선택 · 한 번에 여러 개 · {CLASS_MATERIAL_FILES_MAX}개까지 · 하나에 50MB 이하 · PDF · 한글 · 워드 · PPT · 그림 · 음원 등)
          </span>
        </p>
        <MaterialFilePicker id={`${id}-files`} files={files} onChange={setFiles} onProblem={setPickProblem} disabled={busy} />
        {pickProblem && <p className="mt-1 text-xs font-semibold text-amber-700">{pickProblem}</p>}
      </div>
      <div>
        <p className="label !mb-1 text-xs">
          링크{" "}
          <span className="font-normal text-mist">(선택 · 유튜브 등 · {CLASS_MATERIAL_LINKS_MAX}개까지 · 유튜브 영상은 학생 화면에서 바로 재생돼요)</span>
        </p>
        <MaterialLinkEditor
          rows={linkRows}
          onChange={(rows) => {
            setLinkRows(rows);
            setBadLink(null);
          }}
          invalid={badLink}
          disabled={busy}
        />
      </div>
      <p className="text-xs text-mist">글 · 파일 · 링크 중 하나만 있어도 올릴 수 있어요.</p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={busy} aria-busy={busy} className="btn-primary !px-5 !py-2 text-sm">
          {busy ? (progress ?? "올리는 중…") : "올리기"}
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
