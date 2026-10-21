"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { NoteEditor } from "@/components/note/NoteEditor";
import { FileOrderRows } from "@/components/admin/class-materials/FileOrderRows";
import { MaterialFilePicker, type PickedFile } from "@/components/admin/class-materials/MaterialFilePicker";
import { linkRowsOf, MaterialLinkEditor, type LinkRow } from "@/components/admin/class-materials/MaterialLinkEditor";
import { deleteClassNotice, saveClassNotice } from "@/app/admin/class-materials/notice-actions";
import {
  CLASS_NOTICE_BODY_MAX,
  CLASS_NOTICE_BUCKET,
  CLASS_NOTICE_FILE_BUCKET,
  CLASS_NOTICE_IMAGE_FOLDER,
  CLASS_NOTICE_IMAGE_MAX_BYTES,
  CLASS_NOTICE_IMAGE_MAX_COUNT,
  CLASS_NOTICE_TITLE_MAX,
  noticeError,
  noticeFilePath,
  scopeLabel,
} from "@/lib/class-notices";
import {
  CLASS_MATERIAL_FILES_MAX,
  CLASS_MATERIAL_LINKS_MAX,
  fileOrderItems,
  MATERIAL_SUBJECT_LABEL,
  MATERIAL_SUBJECTS,
  moveItem,
  parseMaterialLinks,
  sortMaterialFiles,
  withPicked,
  type FileRef,
  type MaterialFile,
  type MaterialLink,
  type MaterialSubject,
} from "@/lib/class-materials";
import type { UploadedFile } from "@/lib/upload";
import { removeUploaded, uploadFile } from "@/lib/upload-client";
import { ChoiceChip } from "@/components/admin/ChoiceChip";

/**
 * 수업자료실 공지 쓰기 · 고치기 (2026-10-05 Alan — "안내글에서 쓰는 글 편집기능이 다 들어가면 좋겠어. 추가적으로 이미지도 중간에 추가 … 블로그랑 같다고 생각하면" ·
 * 범위 "전체공지인지, 레벨별이라면 레벨을 선택, RC LC도 선택").
 * 범위는 레벨(여럿 · 비우면 모든 레벨) × 과목(RC · LC · 둘 다). 아래 한 줄이 "누구에게 보이는지" 를 말로 풀어 준다.
 * 본문은 서식 · 줄 정렬 · 사진이 바로 보이는 `NoteEditor` 다 — 강사가 보는 모양이 학생 공지 페이지 모양이다.
 * **첨부 파일 · 링크** (2026-10-13 Alan — "공지사항에서도 파일올리기 등등 다 할 수 있도록") — 수업자료실 자료와 같은 부품이다:
 * 파일은 여러 개를 한 번에 고르고(20개 · 하나에 50MB), 올려 둔 파일과 새 파일을 한 줄로 두고 위 · 아래로 순서를 바꾸고 · 빼고 · 되살린다(`FileOrderRows`).
 * 링크는 주소 + 이름(선택) 줄(`MaterialLinkEditor` — 유튜브 영상은 학생 공지 페이지에서 바로 재생). 파일은 저장을 누를 때 하나씩 올리고, 저장이 실패하면 올린 것을 지운다.
 */
export function NoticeForm({
  notice,
  levels,
  imageUrls,
  defaultLevels,
  back,
}: {
  notice?: { id: number; title: string; body: string; levels: number[]; subjects: MaterialSubject[]; files: MaterialFile[]; links: MaterialLink[] } | null;
  levels: number[];
  imageUrls: Record<string, string>;
  defaultLevels: number[];
  back: string;
}) {
  const router = useRouter();
  const body = useRef<HTMLTextAreaElement>(null);
  const [title, setTitle] = useState(notice?.title ?? "");
  const [picked, setPicked] = useState<number[]>(notice ? notice.levels : defaultLevels);
  const [subject, setSubject] = useState<MaterialSubject | null>(notice?.subjects.length === 1 ? notice.subjects[0] : null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 첨부 파일 — 올려 둔 파일(뺄 것은 표시만 해 두고 저장할 때 뺀다) · 새로 고른 파일 · 둘을 한 줄로 둔 순서
  const files = sortMaterialFiles(notice?.files);
  const [removed, setRemoved] = useState<Set<number>>(() => new Set());
  const [added, setAdded] = useState<PickedFile[]>([]);
  const [order, setOrder] = useState<FileRef[]>(() => files.map((f): FileRef => ({ kind: "old", id: f.id })));
  const [pickProblem, setPickProblem] = useState<string | null>(null);
  const [linkRows, setLinkRows] = useState<LinkRow[]>(() => linkRowsOf(notice?.links ?? []));
  const [badLink, setBadLink] = useState<number | null>(null);
  const fileById = new Map(files.map((f) => [f.id, f]));
  const addedByKey = new Map(added.map((p) => [p.key, p]));
  const staying = files.filter((f) => !removed.has(f.id));
  const scope = { levels: picked, subjects: subject ? [subject] : [] };
  const who = scopeLabel(scope) === "전체" ? "수강 중인 모든 학생" : `${scopeLabel(scope)} 수강생`;

  /** 고른 파일이 바뀌면 순서 목록도 맞춘다 — 새로 고른 것은 끝에 */
  const changeAdded = (next: PickedFile[]) => {
    setAdded(next);
    setOrder((prev) => withPicked(prev, next));
  };

  const toggleRemove = (id: number) =>
    setRemoved((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const text = body.current?.value ?? "";
    const err = noticeError({ title, body: text, levels: picked, subjects: scope.subjects }, levels);
    if (err) return setError(err);
    const parsed = parseMaterialLinks(linkRows);
    if (!parsed.ok) {
      setBadLink(parsed.index ?? null);
      return setError(parsed.error);
    }
    if (staying.length + added.length > CLASS_MATERIAL_FILES_MAX) return setError(`파일은 한 공지에 ${CLASS_MATERIAL_FILES_MAX}개까지예요. 몇 개를 빼 주세요.`);
    setBusy(true);
    setError(null);
    const uploaded: UploadedFile[] = [];
    try {
      // 새 첨부 파일은 저장을 누를 때 하나씩 올린다 (서버 액션 본문 1MB 한도 — 파일은 브라우저가 저장소에 바로)
      for (const [k, p] of added.entries()) {
        setProgress(added.length > 1 ? `파일 올리는 중 ${k + 1}/${added.length}…` : "파일 올리는 중…");
        uploaded.push(await uploadFile(CLASS_NOTICE_FILE_BUCKET, noticeFilePath(p.file), p.file));
      }
      setProgress("저장하는 중…");
      const pathByKey = new Map(added.map((p, k) => [p.key, uploaded[k]?.path]));
      const res = await saveClassNotice({
        id: notice?.id ?? null,
        title,
        body: text,
        levels: picked,
        subjects: scope.subjects,
        files: uploaded,
        removeFileIds: [...removed],
        fileOrder: fileOrderItems(order, removed, pathByKey),
        links: parsed.links,
      });
      if (!res.ok) {
        await removeUploaded(CLASS_NOTICE_FILE_BUCKET, uploaded.map((u) => u.path));
        setError(res.error ?? "저장하지 못했어요.");
        return;
      }
      router.push(back);
      router.refresh();
    } catch (err) {
      if (uploaded.length) await removeUploaded(CLASS_NOTICE_FILE_BUCKET, uploaded.map((u) => u.path));
      setError(err instanceof Error ? err.message : "저장하지 못했어요.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function remove() {
    if (!notice || !confirm(`이 공지를 지울까요? 넣은 사진${files.length ? " · 첨부 파일" : ""}도 함께 지워져요.`)) return;
    setBusy(true);
    const res = await deleteClassNotice(notice.id);
    setBusy(false);
    if (!res.ok) return setError(res.error ?? "삭제하지 못했어요.");
    router.push(back);
    router.refresh();
  }

  return (
    <form onSubmit={save} className="card space-y-5 p-4 sm:p-6">
      <div>
        <label htmlFor="notice-title" className="mb-1.5 block text-sm font-bold text-ink">
          제목
        </label>
        <input
          id="notice-title"
          value={title}
          onChange={(e) => setTitle(e.currentTarget.value)}
          maxLength={CLASS_NOTICE_TITLE_MAX}
          placeholder="예: 650반 숙제 관련 필독!!!"
          disabled={busy}
          className="input text-base font-bold"
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-1.5 text-sm font-bold text-ink">누구에게 보일까요</legend>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="w-10 shrink-0 text-xs font-bold text-mist">레벨</span>
          <ChoiceChip on={picked.length === 0} onClick={() => setPicked([])} disabled={busy}>
            모든 레벨
          </ChoiceChip>
          {levels.map((l) => (
            <ChoiceChip
              key={l}
              on={picked.includes(l)}
              onClick={() => setPicked((p) => (p.includes(l) ? p.filter((x) => x !== l) : [...p, l].sort((a, b) => a - b)))}
              disabled={busy}
            >
              {l}
            </ChoiceChip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="w-10 shrink-0 text-xs font-bold text-mist">과목</span>
          <ChoiceChip on={subject === null} onClick={() => setSubject(null)} disabled={busy}>
            RC · LC 모두
          </ChoiceChip>
          {MATERIAL_SUBJECTS.map((s) => (
            <ChoiceChip key={s} on={subject === s} onClick={() => setSubject(s)} disabled={busy}>
              {MATERIAL_SUBJECT_LABEL[s]}만
            </ChoiceChip>
          ))}
        </div>
        <p className="rounded-xl bg-brand-50 px-3 py-2 text-sm text-ink-soft">
          <strong className="text-brand-700">{who}</strong>에게 보여요
          {scope.subjects.length === 1 && <> — {MATERIAL_SUBJECT_LABEL[scope.subjects[0]]} 수업을 듣지 않는 학생(단과 등)에게는 안 보여요</>}. 지금 수강 중(개강일~종강일)인 학생만 봐요.
        </p>
      </fieldset>

      <div>
        <p className="mb-1.5 text-sm font-bold text-ink">본문</p>
        <NoteEditor
          id="notice-body"
          ref={body}
          defaultValue={notice?.body ?? ""}
          disabled={busy}
          max={CLASS_NOTICE_BODY_MAX}
          minHeight="min-h-72"
          placeholder="공지 내용을 적어 주세요. 사진도 넣을 수 있어요."
          images={{ bucket: CLASS_NOTICE_BUCKET, folder: CLASS_NOTICE_IMAGE_FOLDER, urls: imageUrls, maxBytes: CLASS_NOTICE_IMAGE_MAX_BYTES, maxCount: CLASS_NOTICE_IMAGE_MAX_COUNT }}
          onUploadingChange={setUploading}
        />
      </div>

      <div>
        <p className="mb-1.5 text-sm font-bold text-ink">
          첨부 파일 <span className="font-normal text-mist">(PDF · 한글 · 워드 · 음원 … {CLASS_MATERIAL_FILES_MAX}개까지 · 하나에 50MB 이하 · 위 · 아래로 순서를 바꿀 수 있어요)</span>
        </p>
        {/* 올려 둔 파일과 새로 고른 파일을 한 줄로 — 옮긴 순서가 곧 학생이 보는 순서다 */}
        <FileOrderRows
          order={order}
          oldFiles={fileById}
          picked={addedByKey}
          removed={removed}
          disabled={busy}
          onMove={(i, d) => setOrder((prev) => moveItem(prev, i, d))}
          onToggleRemove={toggleRemove}
          onDropPicked={(key) => {
            setPickProblem(null);
            changeAdded(added.filter((x) => x.key !== key));
          }}
        />
        <MaterialFilePicker
          id="notice-files"
          files={added}
          onChange={changeAdded}
          onProblem={setPickProblem}
          room={Math.max(CLASS_MATERIAL_FILES_MAX - staying.length, 0)}
          disabled={busy}
          showList={false}
          unit="공지"
        />
        {pickProblem && <p className="mt-1 text-xs font-semibold text-amber-700">{pickProblem}</p>}
      </div>

      <div>
        <p className="mb-1.5 text-sm font-bold text-ink">
          링크 <span className="font-normal text-mist">({CLASS_MATERIAL_LINKS_MAX}개까지 · 유튜브 영상은 학생 공지 페이지에서 바로 재생돼요)</span>
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

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={busy || uploading} aria-busy={busy} className="btn-primary !px-6">
          {busy ? (progress ?? "저장 중…") : uploading ? "사진 올리는 중…" : notice ? "고친 내용 저장" : "공지 올리기"}
        </button>
        <Link href={back} className="btn-secondary">
          목록으로
        </Link>
        {notice && (
          <button type="button" onClick={remove} disabled={busy} className="ml-auto text-sm font-bold text-red-600 hover:text-red-700">
            공지 지우기
          </button>
        )}
      </div>
    </form>
  );
}
