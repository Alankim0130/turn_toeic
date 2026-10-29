"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { NoteEditor } from "@/components/note/NoteEditor";
import { ChoiceChip } from "@/components/admin/ChoiceChip";
import { FileOrderRows } from "@/components/admin/class-materials/FileOrderRows";
import { MaterialFilePicker, type PickedFile } from "@/components/admin/class-materials/MaterialFilePicker";
import { linkRowsOf, MaterialLinkEditor, type LinkRow } from "@/components/admin/class-materials/MaterialLinkEditor";
import { saveStaffPost } from "@/app/admin/board/actions";
import {
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
import { ROUND_SET_LABEL, ROUND_SETS, type RoundSet } from "@/lib/class-rounds";
import {
  boardTabFor,
  boardWhereLabel,
  STAFF_BOARD_BUCKET,
  STAFF_POST_BODY_MAX,
  STAFF_POST_FILES_MAX,
  STAFF_POST_IMAGE_FOLDER,
  STAFF_POST_IMAGE_MAX_BYTES,
  STAFF_POST_IMAGE_MAX_COUNT,
  STAFF_POST_TITLE_MAX,
  staffPostError,
  staffPostFilePath,
  staffPostHref,
  type BoardCell,
} from "@/lib/staff-board";
import type { UploadedFile } from "@/lib/upload";
import { removeUploaded, uploadFile } from "@/lib/upload-client";

/**
 * 직원 게시판 글쓰기 · 고치기 (2026-10-21 Alan — "게시물 올리는건 우리가 기존에 작업했던 워드처럼 쓸 수 있는 기능을 그대로 해줘").
 * 수업자료실 공지(`NoticeForm`)와 **같은 부품**이다 — 직원 게시판은 강사 · 관리자 · 조교 모두에게 보이고, 고르는 것은 어느 탭 · 칸에 서는가뿐이다:
 *  - **어디에 보일까요** — 레벨(2026-10-21 Alan "직원게시판도 학습자료실처럼 650,750,850구분" — 여럿 고르기) · 과목 · 과정(같은 날 "A, B과정 표시가 없어. 이렇게해줘" —
 *    하나씩, `RC · LC 모두` · `A · B 모두` 가 비운 것). 공지 범위와 같은 칩 · 같은 말이다. 처음에는 보던 탭 · 칸이 골라져 있고(새 글),
 *    아래 한 줄이 어느 탭의 어느 칸에 서는지 말한다(`boardWhereLabel`).
 *  - 본문은 `NoteEditor` — 굵게 · 밑줄 · 색 · 크기 · 줄 정렬 · 표 · 사진(크기 조절) · 워드 · 네이버 글 붙여 넣기. 사진은 `staff-board/images/` 에 바로 올라간다.
 *  - 첨부 파일은 여러 개를 한 번에 고르고(20개 · 하나에 50MB) 올려 둔 파일과 한 줄로 두고 위 · 아래로 순서를 바꾼다(`FileOrderRows`).
 *  - 링크는 주소 + 이름(선택) 줄(`MaterialLinkEditor` — 유튜브 영상은 글 화면에서 바로 재생).
 * 파일은 저장을 누를 때 하나씩 올리고, 저장이 실패하면 올린 것을 지운다. 저장하면 그 글 화면으로 간다 — 그 글이 서는 탭 · 칸을 붙여서(`boardTabFor`)
 * `목록으로` 가 방금 쓴 글이 보이는 곳으로 간다 (보던 칸에 서면 그 칸 그대로).
 * 보내기는 `onSubmit` 에서 직접 한다 — `<form action>` 이면 React 19 가 끝난 뒤 폼을 초기화해 고른 파일 · 편집기 값이 처음 모양으로 돌아간다.
 */
export function StaffPostForm({
  post,
  levels,
  defaultLevels,
  defaultCell,
  from,
  imageUrls,
  back,
}: {
  post?: {
    id: number;
    title: string;
    body: string;
    levels: number[];
    subject: MaterialSubject | null;
    set: RoundSet | null;
    files: MaterialFile[];
    links: MaterialLink[];
  } | null;
  /** 레벨 목록 (lc_levels) — 비면 레벨 줄을 그리지 않는다 (모든 레벨 글로 저장된다) */
  levels: number[];
  /** 새 글이 처음 고를 레벨 — 보던 탭의 레벨 */
  defaultLevels: number[];
  /** 새 글이 처음 고를 과목 · 과정 — 보던 칸 (null = 모든 과목 · 모든 과정) */
  defaultCell: { subject: MaterialSubject | null; set: RoundSet | null };
  /** 이 화면을 연 목록의 탭 · 칸 — 저장한 뒤 그 글이 거기 서면 그대로 돌아간다 */
  from: { level: number | null; cell: BoardCell | null };
  imageUrls: Record<string, string>;
  /** `목록으로` · 취소가 가는 곳 — 새 글은 게시판, 고칠 때는 그 글 */
  back: string;
}) {
  const router = useRouter();
  const body = useRef<HTMLTextAreaElement>(null);
  const [title, setTitle] = useState(post?.title ?? "");
  const [picked, setPicked] = useState<number[]>(post ? post.levels : defaultLevels);
  const [subject, setSubject] = useState<MaterialSubject | null>(post ? post.subject : defaultCell.subject);
  const [set, setSet] = useState<RoundSet | null>(post ? post.set : defaultCell.set);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 첨부 파일 — 올려 둔 파일(뺄 것은 표시만 해 두고 저장할 때 뺀다) · 새로 고른 파일 · 둘을 한 줄로 둔 순서
  const files = sortMaterialFiles(post?.files);
  const [removed, setRemoved] = useState<Set<number>>(() => new Set());
  const [added, setAdded] = useState<PickedFile[]>([]);
  const [order, setOrder] = useState<FileRef[]>(() => files.map((f): FileRef => ({ kind: "old", id: f.id })));
  const [pickProblem, setPickProblem] = useState<string | null>(null);
  const [linkRows, setLinkRows] = useState<LinkRow[]>(() => linkRowsOf(post?.links ?? []));
  const [badLink, setBadLink] = useState<number | null>(null);
  const fileById = new Map(files.map((f) => [f.id, f]));
  const addedByKey = new Map(added.map((p) => [p.key, p]));
  const staying = files.filter((f) => !removed.has(f.id));

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
    const err = staffPostError({ title, body: text, levels: picked, subject, book_set: set }, levels);
    if (err) return setError(err);
    const parsed = parseMaterialLinks(linkRows);
    if (!parsed.ok) {
      setBadLink(parsed.index ?? null);
      return setError(parsed.error);
    }
    if (staying.length + added.length > STAFF_POST_FILES_MAX) return setError(`파일은 한 글에 ${STAFF_POST_FILES_MAX}개까지예요. 몇 개를 빼 주세요.`);
    setBusy(true);
    setError(null);
    const uploaded: UploadedFile[] = [];
    let sent = false;
    try {
      // 새 첨부 파일은 저장을 누를 때 하나씩 올린다 (서버 액션 본문 1MB 한도 — 파일은 브라우저가 저장소에 바로)
      for (const [k, p] of added.entries()) {
        setProgress(added.length > 1 ? `파일 올리는 중 ${k + 1}/${added.length}…` : "파일 올리는 중…");
        uploaded.push(await uploadFile(STAFF_BOARD_BUCKET, staffPostFilePath(p.file), p.file));
      }
      setProgress("저장하는 중…");
      const pathByKey = new Map(added.map((p, k) => [p.key, uploaded[k]?.path]));
      // 이 뒤에 끊기면 서버가 저장했을 수 있다 — 그때는 올린 파일을 지우지 않는다 (아래 catch)
      sent = true;
      const res = await saveStaffPost({
        id: post?.id ?? null,
        title,
        body: text,
        levels: picked,
        subject,
        bookSet: set,
        files: uploaded,
        removeFileIds: [...removed],
        fileOrder: fileOrderItems(order, removed, pathByKey),
        links: parsed.links,
      });
      if (!res.ok || !res.id) {
        // 새 파일 행까지 저장된 뒤 멈췄으면(파일 빼기 · 순서) 지우지 않는다 — 지우면 저장된 첨부가 깨진다 (2026-10-29)
        if (!res.filesSaved) await removeUploaded(STAFF_BOARD_BUCKET, uploaded.map((u) => u.path));
        setError(res.error ?? "저장하지 못했어요.");
        return;
      }
      router.push(staffPostHref(res.id, boardTabFor({ levels: picked, subject, set }, from)));
      router.refresh();
    } catch (err) {
      if (uploaded.length && !sent) await removeUploaded(STAFF_BOARD_BUCKET, uploaded.map((u) => u.path));
      setError(err instanceof Error ? err.message : "저장하지 못했어요.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <form onSubmit={save} className="card space-y-5 p-4 sm:p-6">
      <div>
        <label htmlFor="staff-post-title" className="mb-1.5 block text-sm font-bold text-ink">
          제목
        </label>
        <input
          id="staff-post-title"
          value={title}
          onChange={(e) => setTitle(e.currentTarget.value)}
          maxLength={STAFF_POST_TITLE_MAX}
          placeholder="예: 10월 넷째 주 조교 근무표"
          disabled={busy}
          className="input text-base font-bold"
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-1.5 text-sm font-bold text-ink">어디에 보일까요</legend>
        {levels.length > 0 && (
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
        )}
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
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="w-10 shrink-0 text-xs font-bold text-mist">과정</span>
          <ChoiceChip on={set === null} onClick={() => setSet(null)} disabled={busy}>
            A · B 모두
          </ChoiceChip>
          {ROUND_SETS.map((b) => (
            <ChoiceChip key={b} on={set === b} onClick={() => setSet(b)} disabled={busy}>
              {ROUND_SET_LABEL[b]}만
            </ChoiceChip>
          ))}
        </div>
        <p className="rounded-xl bg-brand-50 px-3 py-2 text-sm text-ink-soft">{boardWhereLabel(picked, levels, subject, set)}</p>
      </fieldset>

      <div>
        <p className="mb-1.5 text-sm font-bold text-ink">본문</p>
        <NoteEditor
          id="staff-post-body"
          ref={body}
          defaultValue={post?.body ?? ""}
          disabled={busy}
          max={STAFF_POST_BODY_MAX}
          minHeight="min-h-72"
          placeholder="내용을 적어 주세요. 사진 · 표도 넣을 수 있고, 워드 · 블로그 글을 붙여 넣어도 굵게가 그대로 들어와요."
          images={{ bucket: STAFF_BOARD_BUCKET, folder: STAFF_POST_IMAGE_FOLDER, urls: imageUrls, maxBytes: STAFF_POST_IMAGE_MAX_BYTES, maxCount: STAFF_POST_IMAGE_MAX_COUNT }}
          onUploadingChange={setUploading}
        />
      </div>

      <div>
        <p className="mb-1.5 text-sm font-bold text-ink">
          첨부 파일 <span className="font-normal text-mist">(PDF · 한글 · 워드 · 엑셀 · 그림 … {STAFF_POST_FILES_MAX}개까지 · 하나에 50MB 이하 · 위 · 아래로 순서를 바꿀 수 있어요)</span>
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
          id="staff-post-files"
          files={added}
          onChange={changeAdded}
          onProblem={setPickProblem}
          room={Math.max(STAFF_POST_FILES_MAX - staying.length, 0)}
          disabled={busy}
          showList={false}
          unit="글"
        />
        {pickProblem && <p className="mt-1 text-xs font-semibold text-amber-700">{pickProblem}</p>}
      </div>

      <div>
        <p className="mb-1.5 text-sm font-bold text-ink">
          링크 <span className="font-normal text-mist">({CLASS_MATERIAL_LINKS_MAX}개까지 · 유튜브 영상은 글 화면에서 바로 재생돼요)</span>
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
          {busy ? (progress ?? "저장 중…") : uploading ? "사진 올리는 중…" : post ? "고친 내용 저장" : "글 올리기"}
        </button>
        <Link href={back} className="btn-secondary">
          {post ? "취소" : "목록으로"}
        </Link>
      </div>
    </form>
  );
}
