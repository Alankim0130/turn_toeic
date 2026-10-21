"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteClassMaterial, moveClassMaterial, saveClassMaterial } from "@/app/admin/class-materials/actions";
import { Icon } from "@/components/ui/Icon";
import { MaterialNote } from "@/components/class-materials/MaterialNote";
import { MaterialFileList } from "@/components/class-materials/MaterialFileList";
import { MaterialLinkList } from "@/components/class-materials/MaterialLinkList";
import { MaterialFilePicker, MoveButtons, type PickedFile } from "./MaterialFilePicker";
import { FileOrderRows } from "./FileOrderRows";
import { linkRowsOf, MaterialLinkEditor, type LinkRow } from "./MaterialLinkEditor";
import { NoteTextarea } from "./NoteTextarea";
import { MoveToBoardButton } from "@/components/admin/board/MoveToBoardButton";
import { BulkCheck } from "@/components/admin/board/BulkSelect";
import {
  CLASS_MATERIAL_BUCKET,
  CLASS_MATERIAL_FILES_MAX,
  CLASS_MATERIAL_LINKS_MAX,
  CLASS_MATERIAL_TITLE_MAX,
  defaultMaterialTitle,
  draftLinks,
  fileOrderItems,
  isMaterialSubject,
  linkCountLabel,
  MATERIAL_SUBJECT_LABEL,
  MATERIAL_SUBJECTS,
  materialBadge,
  materialLinks,
  materialObjectPath,
  moveItem,
  noteHasText,
  noteTooLong,
  parseMaterialLinks,
  sortMaterialFiles,
  withPicked,
  type FileRef,
  type MaterialFile,
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
  /** 붙은 파일 0 ~ 20개 (class_material_files, 2026-10-06) — 0이면 글만 올린 자료 */
  files: MaterialFile[] | null;
  /** 링크 0 ~ 20개 (class_materials.links jsonb, 2026-10-06) — 읽은 그대로 받아 `materialLinks` 가 고른다 */
  links: unknown;
  /** 같은 회차 안 순서 (2026-10-12) — 관리자 · 학생 화면이 (sort_order, created_at) 로 정렬한다 */
  sort_order: number;
  created_at: string;
  updated_at: string;
};

/** 넓은 화면의 줄 자리 — 제목 줄 다음부터 안내 · 파일 목록 · 링크 목록이 있는 것만 차례로 선다 (빈 줄이 남으면 격자 간격이 두 번 들어간다) */
const SM_ROW = ["sm:row-start-2", "sm:row-start-3", "sm:row-start-4"] as const;

/**
 * 수업자료실 자료 한 줄 (2026-10-05) — 받기 · 수정 · 삭제.
 * **자료 하나에 파일 0 ~ 20개** (2026-10-06): 파일이 하나면 오른쪽 위 `받기`, 여럿이면 안내 아래 파일 목록(파일마다 받기), 없으면 글만.
 * 수정에서는 제목 · 안내에 더해 **파일 빼기 · 더하기 · 순서 바꾸기**(남긴 파일과 새 파일을 한 줄로 — 2026-10-12 Alan "지우고 새로 올렸을때 원래 위치로 조정을 못하고 있어"),
 * 그리고 **레벨 · 과목 · 과정 · 회차를 옮길 수 있다** — 다른 칸에 잘못 올렸을 때 지우고 다시 올리지 않게.
 * 옮기면 이 칸 목록에서 빠지고 옮긴 칸에 선다. 과정 · 회차가 없는 옛 자료는 수정에서 둘을 골라야 저장된다 (그래야 학생에게 열린다).
 * **자료(게시물) 자체도 같은 회차 안에서 위 · 아래로 옮긴다** (`position` — 회차 줄이 준다. 같은 날 Alan "게시물 순서를 조정할 수 있으면 좋겠어") — DB 함수 `move_class_material`.
 * `plain` = 회차 카드 안에 놓일 때 (카드 안에 카드를 겹치지 않게 테두리만).
 * 제목 앞의 고르기 칸은 여러 개 옮기기(`ClassBulkMove` — 2026-10-21 "여러개를 한번에 선택해서 넘길수 있도록") 안에서만 선다.
 */
export function ClassMaterialRow({
  item,
  levels,
  disabled,
  plain = false,
  position,
}: {
  item: ClassMaterialLite;
  levels: number[];
  disabled: boolean;
  plain?: boolean;
  /** 같은 회차 안의 자리 — 있으면 위 · 아래 단추가 선다 (맨 위 · 맨 아래는 그쪽이 흐려진다) */
  position?: { first: boolean; last: boolean };
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"view" | "edit" | "confirm">("view");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pickProblem, setPickProblem] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // 수정 — 뺄 파일(되살릴 수 있게 표시만) · 새로 더할 파일 · 링크 칸
  const [removed, setRemoved] = useState<Set<number>>(() => new Set());
  const [added, setAdded] = useState<PickedFile[]>([]);
  // 파일 순서 — 올려 둔 파일과 새로 고른 파일을 한 줄로 (저장할 때 이 순서가 sort_order 가 된다)
  const [order, setOrder] = useState<FileRef[]>([]);
  const [moving, setMoving] = useState(false);
  const [linkRows, setLinkRows] = useState<LinkRow[]>([]);
  const [badLink, setBadLink] = useState<number | null>(null);
  const levelRef = useRef<HTMLSelectElement>(null);
  const subjectRef = useRef<HTMLSelectElement>(null);
  const setRef = useRef<HTMLSelectElement>(null);
  const seqRef = useRef<HTMLSelectElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  const files = sortMaterialFiles(item.files);
  const fileById = new Map(files.map((f) => [f.id, f]));
  const addedByKey = new Map(added.map((p) => [p.key, p]));
  const links = materialLinks(item.links);
  const single = files.length === 1 ? files[0] : null;
  const edited = item.updated_at.slice(0, 16) !== item.created_at.slice(0, 16);
  const staying = files.filter((f) => !removed.has(f.id));
  const totalBytes = files.reduce((n, f) => n + (f.file_size ?? 0), 0);
  const meta = [
    single ? single.file_name : files.length > 1 ? `파일 ${files.length}개` : null,
    links.length > 0 ? linkCountLabel(links) : null,
    files.length === 0 && links.length === 0 ? "글만" : null,
    files.length > 0 && totalBytes > 0 ? formatBytes(totalBytes) : null,
    `${shortDateTimeKST(item.created_at)} 올림`,
    edited ? `${shortDateTimeKST(item.updated_at)} 고침` : null,
  ].filter(Boolean);
  // 넓은 화면에서 안내 → 파일 목록 → 링크 목록이 차례로 선다 (보기 모드에서만 그린다)
  const showNote = mode !== "edit" && !!item.note;
  const showFiles = mode !== "edit" && files.length > 1;
  const linksRow = SM_ROW[(showNote ? 1 : 0) + (showFiles ? 1 : 0)];

  function startEdit() {
    setError(null);
    setPickProblem(null);
    setRemoved(new Set());
    setAdded([]);
    setOrder(files.map((f) => ({ kind: "old", id: f.id })));
    setLinkRows(linkRowsOf(links));
    setBadLink(null);
    setMode("edit");
  }

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
    const note = noteRef.current?.value ?? "";
    const noteError = noteTooLong(note);
    if (noteError) return setError(noteError);
    const parsed = parseMaterialLinks(linkRows);
    if (!parsed.ok) {
      setBadLink(parsed.index ?? null);
      return setError(parsed.error);
    }
    if (staying.length + added.length + parsed.links.length === 0 && !noteHasText(note)) {
      return setError("파일 · 링크를 다 빼려면 안내 · 스크립트를 적어 주세요. 글 · 파일 · 링크 중 하나는 있어야 해요.");
    }

    setBusy(true);
    const uploaded: UploadedFile[] = [];
    try {
      // 새 파일은 옮겨 갈 칸의 폴더에 올린다 — 서버가 경로를 그 칸으로 다시 본다. 하나씩 올린다
      for (const [k, p] of added.entries()) {
        setProgress(added.length > 1 ? `파일 올리는 중 ${k + 1}/${added.length}…` : "파일 올리는 중…");
        uploaded.push(await uploadFile(CLASS_MATERIAL_BUCKET, materialObjectPath(level, subject, p.file), p.file));
      }
      setProgress("저장하는 중…");
      // 파일 순서 — 남긴 파일은 id, 새 파일은 올린 경로 (uploaded 는 added 와 같은 순서다)
      const pathByKey = new Map(added.map((p, k) => [p.key, uploaded[k]?.path]));
      const fileOrder = fileOrderItems(order, removed, pathByKey);
      const res = await saveClassMaterial({
        id: item.id,
        level,
        subject,
        bookSet,
        seq,
        title: titleRef.current?.value ?? "",
        note,
        files: uploaded,
        removeFileIds: [...removed],
        links: parsed.links,
        fileOrder,
      });
      if (!res.ok) {
        await removeUploaded(CLASS_MATERIAL_BUCKET, uploaded.map((u) => u.path));
        setError(res.error ?? "저장하지 못했어요.");
        return;
      }
      setMode("view");
      router.refresh();
    } catch (err) {
      if (uploaded.length) await removeUploaded(CLASS_MATERIAL_BUCKET, uploaded.map((u) => u.path));
      setError(err instanceof Error ? err.message : "저장하지 못했어요.");
    } finally {
      setBusy(false);
      setProgress(null);
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

  /** 고른 파일이 바뀌면 순서 목록도 맞춘다 — 새로 고른 것은 끝에, 뺀 것은 목록에서도 */
  const changeAdded = (next: PickedFile[]) => {
    setAdded(next);
    setOrder((prev) => withPicked(prev, next));
  };

  /** 자료(게시물)를 같은 회차 안에서 한 칸 위 · 아래로 */
  async function onMoveItem(delta: -1 | 1) {
    setError(null);
    setMoving(true);
    try {
      const res = await moveClassMaterial(item.id, delta === -1);
      if (!res.ok) return setError(res.error ?? "순서를 바꾸지 못했어요.");
      router.refresh();
    } finally {
      setMoving(false);
    }
  }

  const toggleRemove = (id: number) =>
    setRemoved((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <li className={plain ? "rounded-xl border border-line bg-paper p-3" : "card p-4"}>
      {/* 휴대폰: 제목 → 안내 → 파일 → 버튼. 넓은 화면: 제목 줄 오른쪽에 버튼, 안내 · 파일 목록은 그 아래 한 줄 전체 */}
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div className="flex min-w-0 items-start gap-3 sm:col-start-1 sm:row-start-1">
          {mode === "view" && <BulkCheck itemKey={`material:${item.id}`} label={item.title} className="-mr-1 h-11" />}
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
            {!isRoundSet(item.book_set) && <p className="mt-1 text-xs font-bold text-amber-700">과정 · 회차 미정 — 학생에게 보이지 않아요</p>}
          </div>
        </div>

        {showNote && item.note && <MaterialNote note={item.note} showCount className="bg-brand-50/70 sm:col-span-2 sm:row-start-2" />}
        {/* 안내가 없으면 둘째 줄로 올린다 — 빈 줄이 남으면 격자 간격이 두 번 들어간다 */}
        {showFiles && <MaterialFileList files={files} className={cn("sm:col-span-2", item.note ? "sm:row-start-3" : "sm:row-start-2")} />}
        {/* 링크 — 강사도 학생과 같은 목록으로 틀어 볼 수 있다 (2026-10-06) */}
        {mode !== "edit" && links.length > 0 && <MaterialLinkList links={links} className={cn("sm:col-span-2", linksRow)} />}

        {mode === "view" && (
          <div className="flex flex-wrap justify-end gap-1 sm:col-start-2 sm:row-start-1">
            {single && (
              <a href={`/files/class/${single.id}?download=1`} className="btn-ghost !px-3 !py-1.5 text-xs">
                <Icon name="download" size={14} />
                받기
              </a>
            )}
            {!disabled && position && (
              <MoveButtons name={item.title} first={position.first} last={position.last} disabled={moving || pending} onMove={onMoveItem} />
            )}
            {!disabled && (
              <>
                <button type="button" onClick={startEdit} className="btn-ghost !px-3 !py-1.5 text-xs">
                  수정
                </button>
                {/* 직원 게시판으로 옮기기 (2026-10-21 Alan) — 학생 화면에서 바로 빠지고 직원 게시판의 이 레벨 글이 된다 */}
                <MoveToBoardButton kind="material" id={item.id} title={item.title} levels={levels.includes(item.level) ? String(item.level) : "모든 레벨"} />
                <button type="button" onClick={() => { setError(null); setMode("confirm"); }} className="btn-ghost !px-3 !py-1.5 text-xs text-red-600 hover:!bg-red-50">
                  삭제
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {mode === "edit" && (
        <form onSubmit={onSave} className="mt-3 grid gap-3 rounded-xl border border-line bg-surface p-3">
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
          <div>
            <label htmlFor={`cm-title-${item.id}`} className="label !mb-1 text-xs">제목</label>
            <input
              id={`cm-title-${item.id}`}
              ref={titleRef}
              maxLength={CLASS_MATERIAL_TITLE_MAX}
              defaultValue={item.title}
              placeholder={defaultMaterialTitle([...staying.map((f) => f.file_name), ...added.map((p) => p.file.name)], null, draftLinks(linkRows))}
              className="input !py-2 text-sm"
              disabled={busy}
            />
          </div>
          <div>
            <label htmlFor={`cm-note-${item.id}`} className="label !mb-1 text-xs">
              안내 · 스크립트
            </label>
            <NoteTextarea id={`cm-note-${item.id}`} ref={noteRef} defaultValue={item.note ?? ""} disabled={busy} />
          </div>
          <div>
            <p className="label !mb-1 text-xs">
              파일 <span className="font-normal text-mist">(빼거나 더하거나 순서를 바꿀 수 있어요 · {CLASS_MATERIAL_FILES_MAX}개까지 · 하나에 50MB 이하)</span>
            </p>
            {/* 올려 둔 파일과 새로 고른 파일을 한 줄로 — 위 · 아래 단추로 옮긴 순서가 곧 학생이 보는 순서다 (2026-10-12) */}
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
              id={`cm-files-${item.id}`}
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
              링크 <span className="font-normal text-mist">(고치거나 빼거나 더할 수 있어요 · {CLASS_MATERIAL_LINKS_MAX}개까지 · 유튜브 영상은 학생 화면에서 바로 재생돼요)</span>
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
            이 자료를 삭제할까요? 학생 수업자료실에서도 바로 빠져요{files.length > 0 && <> · 붙은 파일 {files.length}개도 지워져요</>}.
          </span>
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
