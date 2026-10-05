"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { NoteEditor } from "@/components/note/NoteEditor";
import { deleteClassNotice, saveClassNotice } from "@/app/admin/class-materials/notice-actions";
import {
  CLASS_NOTICE_BODY_MAX,
  CLASS_NOTICE_BUCKET,
  CLASS_NOTICE_IMAGE_FOLDER,
  CLASS_NOTICE_IMAGE_MAX_BYTES,
  CLASS_NOTICE_IMAGE_MAX_COUNT,
  CLASS_NOTICE_TITLE_MAX,
  noticeError,
  scopeLabel,
} from "@/lib/class-notices";
import { MATERIAL_SUBJECT_LABEL, MATERIAL_SUBJECTS, type MaterialSubject } from "@/lib/class-materials";
import { cn } from "@/lib/utils";

/**
 * 수업자료실 공지 쓰기 · 고치기 (2026-10-05 Alan — "안내글에서 쓰는 글 편집기능이 다 들어가면 좋겠어. 추가적으로 이미지도 중간에 추가 … 블로그랑 같다고 생각하면" ·
 * 범위 "전체공지인지, 레벨별이라면 레벨을 선택, RC LC도 선택").
 * 범위는 레벨(여럿 · 비우면 모든 레벨) × 과목(RC · LC · 둘 다). 아래 한 줄이 "누구에게 보이는지" 를 말로 풀어 준다.
 * 본문은 서식 · 줄 정렬 · 사진이 바로 보이는 `NoteEditor` 다 — 강사가 보는 모양이 학생 공지 페이지 모양이다.
 */
export function NoticeForm({
  notice,
  levels,
  imageUrls,
  defaultLevels,
  back,
}: {
  notice?: { id: number; title: string; body: string; levels: number[]; subjects: MaterialSubject[] } | null;
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
  const [error, setError] = useState<string | null>(null);
  const scope = { levels: picked, subjects: subject ? [subject] : [] };
  const who = scopeLabel(scope) === "전체" ? "수강 중인 모든 학생" : `${scopeLabel(scope)} 수강생`;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const text = body.current?.value ?? "";
    const err = noticeError({ title, body: text, levels: picked, subjects: scope.subjects }, levels);
    if (err) return setError(err);
    setBusy(true);
    setError(null);
    const res = await saveClassNotice({ id: notice?.id ?? null, title, body: text, levels: picked, subjects: scope.subjects });
    setBusy(false);
    if (!res.ok) return setError(res.error ?? "저장하지 못했어요.");
    router.push(back);
    router.refresh();
  }

  async function remove() {
    if (!notice || !confirm("이 공지를 지울까요? 넣은 사진도 함께 지워져요.")) return;
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
          <Chip on={picked.length === 0} onClick={() => setPicked([])} disabled={busy}>
            모든 레벨
          </Chip>
          {levels.map((l) => (
            <Chip
              key={l}
              on={picked.includes(l)}
              onClick={() => setPicked((p) => (p.includes(l) ? p.filter((x) => x !== l) : [...p, l].sort((a, b) => a - b)))}
              disabled={busy}
            >
              {l}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="w-10 shrink-0 text-xs font-bold text-mist">과목</span>
          <Chip on={subject === null} onClick={() => setSubject(null)} disabled={busy}>
            RC · LC 모두
          </Chip>
          {MATERIAL_SUBJECTS.map((s) => (
            <Chip key={s} on={subject === s} onClick={() => setSubject(s)} disabled={busy}>
              {MATERIAL_SUBJECT_LABEL[s]}만
            </Chip>
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

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={busy || uploading} aria-busy={busy} className="btn-primary !px-6">
          {busy ? "저장 중…" : uploading ? "사진 올리는 중…" : notice ? "고친 내용 저장" : "공지 올리기"}
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

function Chip({ on, onClick, disabled, children }: { on: boolean; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded-full border px-3 py-1.5 text-sm font-bold transition disabled:opacity-50",
        on ? "border-brand-600 bg-brand-600 text-white" : "border-line bg-white text-ink-soft hover:border-brand-300",
      )}
    >
      {children}
    </button>
  );
}
