"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addTeacherFolder, deleteTeacherFolder, moveTeacherFolder, renameTeacherFolder } from "@/app/admin/teacher-board/actions";
import { Icon } from "@/components/ui/Icon";
import { FOLDER_NAME_MAX, folderNameError } from "@/lib/teacher-board";

/** 폴더 더하기 — 그 게시판의 맨 끝에 (2026-11-03 Alan "폴더 더하기도 할 수 있고") */
export function AddFolderForm({ subject, label }: { subject: "rc" | "lc"; label: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const problem = folderNameError(name);
    if (problem) return setError(problem);
    setError(null);
    startTransition(async () => {
      try {
        const res = await addTeacherFolder(subject, name);
        if (!res.ok) return setError(res.error ?? "더하지 못했어요.");
        setName("");
        router.refresh();
      } catch {
        setError("연결이 끊겼어요. 새로고침한 뒤 다시 해 주세요.");
      }
    });
  };

  return (
    <form onSubmit={onSubmit} className="card space-y-2 p-4">
      <label htmlFor={`new-folder-${subject}`} className="label !mb-0 text-xs">
        {label}에 폴더 더하기
      </label>
      <div className="flex gap-2">
        <input
          id={`new-folder-${subject}`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={FOLDER_NAME_MAX}
          placeholder="예: 강사게시판 850+ 하"
          className="input min-w-0 flex-1 !py-2 text-sm"
          disabled={pending}
        />
        <button type="submit" disabled={pending} aria-busy={pending} className="btn-primary shrink-0 !px-4 !py-2 text-sm">
          {pending ? "더하는 중…" : "더하기"}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-xs font-semibold text-red-600">
          {error}
        </p>
      )}
    </form>
  );
}

/** 고른 폴더의 머리 — 이름 · 이름 바꾸기 · 위 · 아래 · 지우기 (2026-11-03 Alan "폴더 위치 변경 및 이름 변경도 가능하게") */
export function FolderControls({
  folder,
  first,
  last,
  itemCount,
  useCount,
  backHref,
  disabled,
}: {
  folder: { id: number; name: string };
  first: boolean;
  last: boolean;
  itemCount: number;
  useCount: number;
  backHref: string;
  disabled: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"view" | "rename" | "confirm">("view");
  const [name, setName] = useState(folder.name);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (job: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    startTransition(async () => {
      setError(null);
      try {
        const res = await job();
        if (!res.ok) return setError(res.error ?? "하지 못했어요.");
        after?.();
        router.refresh();
      } catch {
        setError("연결이 끊겼어요. 새로고침한 뒤 다시 해 주세요.");
      }
    });

  const onRename = (e: React.FormEvent) => {
    e.preventDefault();
    const problem = folderNameError(name);
    if (problem) return setError(problem);
    run(() => renameTeacherFolder(folder.id, name), () => setMode("view"));
  };

  return (
    <div className="space-y-2">
      {mode === "rename" ? (
        <form onSubmit={onRename} className="flex flex-wrap gap-2">
          <label htmlFor={`rename-${folder.id}`} className="sr-only">
            폴더 이름
          </label>
          <input
            id={`rename-${folder.id}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={FOLDER_NAME_MAX}
            className="input min-w-0 flex-1 !py-2 text-base font-bold"
            disabled={pending}
            autoFocus
          />
          <span className="flex gap-1">
            <button type="submit" disabled={pending} className="btn-primary !px-4 !py-2 text-sm">
              {pending ? "저장 중…" : "저장"}
            </button>
            <button
              type="button"
              onClick={() => {
                setName(folder.name);
                setError(null);
                setMode("view");
              }}
              disabled={pending}
              className="btn-ghost !px-3 !py-2 text-xs"
            >
              취소
            </button>
          </span>
        </form>
      ) : (
        <div className="flex flex-wrap items-start gap-2">
          <h2 className="min-w-0 basis-full text-xl font-black leading-snug text-ink [overflow-wrap:anywhere] sm:basis-0 sm:flex-1">{folder.name}</h2>
          {!disabled && (
            <span className="flex shrink-0 flex-wrap gap-1">
              <button type="button" onClick={() => run(() => moveTeacherFolder(folder.id, -1))} disabled={pending || first} aria-label="폴더를 한 칸 위로" className="btn-ghost !px-3 !py-1.5 text-xs">
                위로
              </button>
              <button type="button" onClick={() => run(() => moveTeacherFolder(folder.id, 1))} disabled={pending || last} aria-label="폴더를 한 칸 아래로" className="btn-ghost !px-3 !py-1.5 text-xs">
                아래로
              </button>
              <button type="button" onClick={() => { setError(null); setMode("rename"); }} disabled={pending} className="btn-ghost !px-3 !py-1.5 text-xs">
                이름 바꾸기
              </button>
              <button type="button" onClick={() => { setError(null); setMode("confirm"); }} disabled={pending} className="btn-ghost !px-3 !py-1.5 text-xs text-red-600 hover:!bg-red-50">
                폴더 지우기
              </button>
            </span>
          )}
        </div>
      )}

      {mode === "confirm" && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-red-200 bg-red-50/60 p-3 text-sm">
          <Icon name="warning" size={20} />
          <span className="min-w-0 flex-1 text-ink">
            이 폴더를 지울까요? {itemCount > 0 ? <>안의 자료 {itemCount}개와 파일도 함께 지워져요.</> : "안에 자료는 없어요."}
            {useCount > 0 && <> 이 폴더를 쓰는 달 {useCount}곳의 학생 화면에서도 빠져요.</>}
          </span>
          <span className="flex gap-1">
            <button
              type="button"
              onClick={() => run(() => deleteTeacherFolder(folder.id), () => router.push(backHref))}
              disabled={pending}
              className="btn-dark !bg-red-600 !px-3 !py-1.5 text-xs hover:!bg-red-700"
            >
              {pending ? "지우는 중…" : "지우기 확정"}
            </button>
            <button type="button" onClick={() => setMode("view")} disabled={pending} className="btn-ghost !px-3 !py-1.5 text-xs">
              닫기
            </button>
          </span>
        </div>
      )}

      {error && (
        <p role="alert" className="text-xs font-semibold text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
