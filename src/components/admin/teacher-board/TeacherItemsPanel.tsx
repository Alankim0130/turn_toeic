"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteTeacherItem, saveTeacherItem } from "@/app/admin/teacher-board/actions";
import { Icon } from "@/components/ui/Icon";
import { MaterialNote } from "@/components/class-materials/MaterialNote";
import { MaterialFileList } from "@/components/class-materials/MaterialFileList";
import { MaterialLinkList } from "@/components/class-materials/MaterialLinkList";
import { MaterialFilePicker, type PickedFile } from "@/components/admin/class-materials/MaterialFilePicker";
import { FileOrderRows } from "@/components/admin/class-materials/FileOrderRows";
import { emptyLinkRow, linkRowsOf, MaterialLinkEditor, type LinkRow } from "@/components/admin/class-materials/MaterialLinkEditor";
import { NoteTextarea } from "@/components/admin/class-materials/NoteTextarea";
import {
  CLASS_MATERIAL_FILES_MAX,
  CLASS_MATERIAL_LINKS_MAX,
  CLASS_MATERIAL_TITLE_MAX,
  defaultMaterialTitle,
  draftLinks,
  fileOrderItems,
  materialBadge,
  moveItem,
  noteHasText,
  noteTooLong,
  parseMaterialLinks,
  withPicked,
  type FileRef,
} from "@/lib/class-materials";
import { TEACHER_BOARD_BUCKET, itemMeta, nextSeq, teacherFilePath, type TeacherItem } from "@/lib/teacher-board";
import { ROUND_MAX } from "@/lib/class-rounds";
import { shortDateTimeKST } from "@/lib/study";
import type { UploadedFile } from "@/lib/upload";
import { removeUploaded, uploadFile } from "@/lib/upload-client";
import { cn } from "@/lib/utils";

/**
 * **강사 자료 게시판 — 폴더 안 자료** (2026-11-03 Alan — "한 폴더를 클릭해서 수업자료를 여러개 만들어 놓고 … 기존에 날짜별 오픈시스템도 그대로").
 * 자료 하나 = **회차** + 제목 + 안내 + 파일 0 ~ 20개 + 링크 0 ~ 20개 — 특강 자료실(`LectureMaterialsPanel`)과 같은 흐름에 회차를 더했다.
 * 이 폴더를 쓰는 달 · 과정 반 학생에게 그 회차 수업일부터 열린다. 회차마다 묶어 보여 준다.
 * 파일은 브라우저가 저장소(`class-materials/teacher/…`)에 하나씩 바로 올리고(서버 액션 본문 한도 1MB), 서버는 행만 만든다.
 * 등록이 실패하면 방금 올린 파일을 지운다 — 등록을 **보낸 뒤** 끊겼으면 지우지 않는다 (서버가 저장했을 수 있다, 2026-10-29).
 */
export function TeacherItemsPanel({ folderId, groups, disabled = false }: { folderId: number; groups: [number, TeacherItem[]][]; disabled?: boolean }) {
  const [adding, setAdding] = useState(false);
  const total = groups.reduce((n, [, items]) => n + items.length, 0);
  return (
    <section aria-labelledby={`tb-${folderId}-title`} className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 id={`tb-${folderId}-title`} className="flex items-center gap-1.5 font-black text-ink">
            <Icon name="download" size={18} />
            폴더 안 자료 <span className="text-slate">{total}개</span>
          </h3>
          <p className="mt-0.5 text-xs text-slate">회차마다 올려요. 쓰는 달 학생에게 그 회차 수업일에 하나씩 열려요.</p>
        </div>
        {!disabled && !adding && (
          <button type="button" onClick={() => setAdding(true)} className="btn-primary !px-4 !py-2 text-sm">
            자료 올리기
          </button>
        )}
      </div>
      {adding && <TeacherItemUpload folderId={folderId} defaultSeq={nextSeq(groups.map(([seq]) => seq))} onClose={() => setAdding(false)} />}
      {groups.length > 0 ? (
        <div className="mt-4 space-y-4">
          {groups.map(([seq, items]) => (
            <section key={seq} aria-label={`${seq}회차`}>
              <h4 className="mb-2 text-sm font-black text-brand-700">{seq}회차</h4>
              <ul className="space-y-2">
                {items.map((m) => (
                  <TeacherItemRow key={m.id} item={m} folderId={folderId} disabled={disabled} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        !adding && <p className="mt-3 text-sm text-mist">아직 올린 자료가 없어요. 1회차부터 올려 두세요.</p>
      )}
    </section>
  );
}

/** 회차 고르기 — 1 ~ 30회차 */
function SeqSelect({ id, value, onChange, disabled }: { id: string; value: number; onChange: (n: number) => void; disabled: boolean }) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(Number(e.target.value))} className="input !py-2 text-sm" disabled={disabled}>
      {Array.from({ length: ROUND_MAX }, (_, i) => i + 1).map((n) => (
        <option key={n} value={n}>
          {n}회차
        </option>
      ))}
    </select>
  );
}

/** 자료 올리기 폼 — 수업자료실 올리기(`ClassMaterialUpload`)와 같은 흐름에 회차 고르기 */
function TeacherItemUpload({ folderId, defaultSeq, onClose }: { folderId: number; defaultSeq: number; onClose: () => void }) {
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
  const [seq, setSeq] = useState(defaultSeq);
  const id = `tb-new-${folderId}`;
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
    if (files.length === 0 && parsed.links.length === 0 && !noteHasText(note)) return setError("파일 · 링크를 넣거나 안내를 적어 주세요. 글만 올려도 돼요.");

    setBusy(true);
    const uploaded: UploadedFile[] = [];
    let sent = false;
    try {
      for (const [k, p] of files.entries()) {
        setProgress(files.length > 1 ? `파일 올리는 중 ${k + 1}/${files.length}…` : "파일 올리는 중…");
        uploaded.push(await uploadFile(TEACHER_BOARD_BUCKET, teacherFilePath(p.file), p.file));
      }
      setProgress("저장하는 중…");
      sent = true;
      const res = await saveTeacherItem({ folderId, seq, title: titleRef.current?.value ?? "", note, files: uploaded, links: parsed.links });
      if (!res.ok) {
        if (!res.filesSaved) await removeUploaded(TEACHER_BOARD_BUCKET, uploaded.map((u) => u.path));
        setError(res.error ?? "올리지 못했어요.");
        return;
      }
      onClose();
      router.refresh();
    } catch (err) {
      if (uploaded.length && !sent) await removeUploaded(TEACHER_BOARD_BUCKET, uploaded.map((u) => u.path));
      setError(err instanceof Error ? err.message : "올리지 못했어요.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-3 space-y-3 rounded-xl border border-brand-100 bg-brand-50/50 p-3 sm:p-4">
      <div className="w-32">
        <label htmlFor={`${id}-seq`} className="label !mb-1 text-xs">
          회차
        </label>
        <SeqSelect id={`${id}-seq`} value={seq} onChange={setSeq} disabled={busy} />
      </div>
      <div>
        <label htmlFor={`${id}-title`} className="label !mb-1 text-xs">
          제목 <span className="font-normal text-mist">(선택)</span>
        </label>
        <input id={`${id}-title`} ref={titleRef} maxLength={CLASS_MATERIAL_TITLE_MAX} placeholder={placeholder} className="input !py-2 text-sm" disabled={busy} />
      </div>
      <div>
        <label htmlFor={`${id}-note`} className="label !mb-1 text-xs">
          안내 · 스크립트 <span className="font-normal text-mist">(선택 · 학생에게 자료와 함께 보여요)</span>
        </label>
        <NoteTextarea id={`${id}-note`} ref={noteRef} placeholder={"예: 수업 전에 출력해 오세요.\n스크립트를 붙여 넣어도 돼요."} disabled={busy} />
      </div>
      <div>
        <p className="label !mb-1 text-xs">
          파일 <span className="font-normal text-mist">(선택 · 한 번에 여러 개 · {CLASS_MATERIAL_FILES_MAX}개까지 · 하나에 50MB 이하)</span>
        </p>
        <MaterialFilePicker id={`${id}-files`} files={files} onChange={setFiles} onProblem={setPickProblem} disabled={busy} />
        {pickProblem && <p className="mt-1 text-xs font-semibold text-amber-700">{pickProblem}</p>}
      </div>
      <div>
        <p className="label !mb-1 text-xs">
          링크 <span className="font-normal text-mist">(선택 · {CLASS_MATERIAL_LINKS_MAX}개까지 · 유튜브 영상은 학생 화면에서 바로 재생돼요)</span>
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

/** 자료 한 줄 — 보기 · 수정(회차 · 제목 · 안내 · 파일 빼기 · 더하기 · 순서 · 링크) · 삭제. 수업자료실 줄(`ClassMaterialRow`)과 같은 흐름 */
function TeacherItemRow({ item, folderId, disabled }: { item: TeacherItem; folderId: number; disabled: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<"view" | "edit" | "confirm">("view");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pickProblem, setPickProblem] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [removed, setRemoved] = useState<Set<number>>(() => new Set());
  const [added, setAdded] = useState<PickedFile[]>([]);
  const [order, setOrder] = useState<FileRef[]>([]);
  const [linkRows, setLinkRows] = useState<LinkRow[]>([]);
  const [badLink, setBadLink] = useState<number | null>(null);
  const [seq, setSeq] = useState(item.seq);
  const titleRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  const files = item.files;
  const links = item.links;
  const fileById = new Map(files.map((f) => [f.id, f]));
  const addedByKey = new Map(added.map((p) => [p.key, p]));
  const staying = files.filter((f) => !removed.has(f.id));
  const edited = item.updated_at.slice(0, 16) !== item.created_at.slice(0, 16);
  const meta = [itemMeta(item) || null, `${shortDateTimeKST(item.created_at)} 올림`, edited ? `${shortDateTimeKST(item.updated_at)} 고침` : null].filter(Boolean);

  function startEdit() {
    setError(null);
    setPickProblem(null);
    setRemoved(new Set());
    setAdded([]);
    setOrder(files.map((f) => ({ kind: "old", id: f.id })));
    setLinkRows(linkRowsOf(links));
    setBadLink(null);
    setSeq(item.seq);
    setMode("edit");
  }

  async function onSave(e: React.FormEvent) {
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
    if (staying.length + added.length + parsed.links.length === 0 && !noteHasText(note)) {
      return setError("파일 · 링크를 다 빼려면 안내를 적어 주세요. 글 · 파일 · 링크 중 하나는 있어야 해요.");
    }

    setBusy(true);
    const uploaded: UploadedFile[] = [];
    let sent = false;
    try {
      for (const [k, p] of added.entries()) {
        setProgress(added.length > 1 ? `파일 올리는 중 ${k + 1}/${added.length}…` : "파일 올리는 중…");
        uploaded.push(await uploadFile(TEACHER_BOARD_BUCKET, teacherFilePath(p.file), p.file));
      }
      setProgress("저장하는 중…");
      const pathByKey = new Map(added.map((p, k) => [p.key, uploaded[k]?.path]));
      const fileOrder = fileOrderItems(order, removed, pathByKey);
      sent = true;
      const res = await saveTeacherItem({
        id: item.id,
        folderId,
        seq,
        title: titleRef.current?.value ?? "",
        note,
        files: uploaded,
        removeFileIds: [...removed],
        links: parsed.links,
        fileOrder,
      });
      if (!res.ok) {
        if (!res.filesSaved) await removeUploaded(TEACHER_BOARD_BUCKET, uploaded.map((u) => u.path));
        setError(res.error ?? "저장하지 못했어요.");
        return;
      }
      setMode("view");
      router.refresh();
    } catch (err) {
      if (uploaded.length && !sent) await removeUploaded(TEACHER_BOARD_BUCKET, uploaded.map((u) => u.path));
      setError(err instanceof Error ? err.message : "저장하지 못했어요.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  const onDelete = () =>
    startTransition(async () => {
      setError(null);
      const res = await deleteTeacherItem(item.id);
      if (!res.ok) return setError(res.error ?? "삭제하지 못했어요.");
      setMode("view");
      router.refresh();
    });

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

  return (
    <li className="rounded-xl border border-line bg-paper p-3">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-xl text-[11px] font-black ring-1",
            files.length + links.length === 0 ? "bg-surface text-slate ring-line" : "bg-brand-50 text-brand-700 ring-brand-100",
          )}
        >
          {materialBadge(files, links)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-black leading-snug text-ink [overflow-wrap:anywhere]">{item.title}</p>
          <p className="mt-0.5 text-xs text-slate [overflow-wrap:anywhere]">{meta.join(" · ")}</p>
        </div>
        {mode === "view" && !disabled && (
          <span className="flex shrink-0 flex-wrap justify-end gap-1">
            <button type="button" onClick={startEdit} className="btn-ghost !px-3 !py-1.5 text-xs">
              수정
            </button>
            <button type="button" onClick={() => { setError(null); setMode("confirm"); }} className="btn-ghost !px-3 !py-1.5 text-xs text-red-600 hover:!bg-red-50">
              삭제
            </button>
          </span>
        )}
      </div>

      {mode !== "edit" && (
        <div className="mt-2 space-y-2">
          {item.note && <MaterialNote note={item.note} showCount className="bg-brand-50/70" />}
          {files.length > 0 && <MaterialFileList files={files} base="/files/teacher" />}
          {links.length > 0 && <MaterialLinkList links={links} />}
        </div>
      )}

      {mode === "edit" && (
        <form onSubmit={onSave} className="mt-3 grid gap-3 rounded-xl border border-line bg-surface p-3">
          <div className="w-32">
            <label htmlFor={`tb-seq-${item.id}`} className="label !mb-1 text-xs">회차</label>
            <SeqSelect id={`tb-seq-${item.id}`} value={seq} onChange={setSeq} disabled={busy} />
          </div>
          <div>
            <label htmlFor={`tb-title-${item.id}`} className="label !mb-1 text-xs">제목</label>
            <input
              id={`tb-title-${item.id}`}
              ref={titleRef}
              maxLength={CLASS_MATERIAL_TITLE_MAX}
              defaultValue={item.title}
              placeholder={defaultMaterialTitle([...staying.map((f) => f.file_name), ...added.map((p) => p.file.name)], null, draftLinks(linkRows))}
              className="input !py-2 text-sm"
              disabled={busy}
            />
          </div>
          <div>
            <label htmlFor={`tb-note-${item.id}`} className="label !mb-1 text-xs">안내</label>
            <NoteTextarea id={`tb-note-${item.id}`} ref={noteRef} defaultValue={item.note ?? ""} disabled={busy} />
          </div>
          <div>
            <p className="label !mb-1 text-xs">
              파일 <span className="font-normal text-mist">(빼거나 더하거나 순서를 바꿀 수 있어요 · {CLASS_MATERIAL_FILES_MAX}개까지 · 하나에 50MB 이하)</span>
            </p>
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
              id={`tb-files-${item.id}`}
              files={added}
              onChange={changeAdded}
              onProblem={setPickProblem}
              room={Math.max(CLASS_MATERIAL_FILES_MAX - staying.length, 0)}
              disabled={busy}
              showList={false}
            />
            {pickProblem && <p className="mt-1 text-xs font-semibold text-amber-700">{pickProblem}</p>}
          </div>
          <div>
            <p className="label !mb-1 text-xs">
              링크 <span className="font-normal text-mist">(고치거나 빼거나 더할 수 있어요 · {CLASS_MATERIAL_LINKS_MAX}개까지)</span>
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
          <div className="flex justify-end gap-1">
            <button type="submit" disabled={busy} aria-busy={busy} className="btn-primary !px-4 !py-2 text-sm">
              {busy ? (progress ?? "저장 중…") : "저장"}
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
          <span className="min-w-0 flex-1 text-ink">
            이 자료를 삭제할까요? 이 폴더를 쓰는 달 학생 화면에서도 바로 빠져요{files.length > 0 && <> · 붙은 파일 {files.length}개도 지워져요</>}.
          </span>
          <span className="flex gap-1">
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
