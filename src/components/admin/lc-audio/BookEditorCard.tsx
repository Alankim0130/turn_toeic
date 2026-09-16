"use client";

import Link from "next/link";
import { useActionState, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { removeBookCover, setBookCover, updateBook, type BookEditState } from "@/app/admin/lc-audio/actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Icon } from "@/components/ui/Icon";
import { BookCover } from "@/components/lc/BookCover";
import { cn } from "@/lib/utils";
import { bookLabel, coverSrc, type BookLite } from "@/lib/lc-audio";
import { contentTypeOf, MB, objectName } from "@/lib/upload";
import { removeUploaded, uploadFile } from "@/lib/upload-client";

const BUCKET = "lc-textbooks";

/** 관리자: 교재 한 권 — 표지 올리기/바꾸기/지우기, 교재명·설명 저장, 음원 관리로 이동 */
export function BookEditorCard({ book, trackCount, selected, manageHref }: { book: BookLite; trackCount: number; selected: boolean; manageHref: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, action] = useActionState<BookEditState, FormData>(updateBook, {});
  const [description, setDescription] = useState(book.description ?? "");
  const [busy, setBusy] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, startRemove] = useTransition();
  const label = bookLabel(book);

  async function uploadCover(file: File | undefined) {
    setCoverError(null);
    if (!file) return;
    if (!contentTypeOf(file).startsWith("image/")) return setCoverError("이미지 파일만 올릴 수 있어요.");
    if (file.size > 10 * MB) return setCoverError("10MB 이하 이미지만 올릴 수 있어요.");
    setBusy(true);
    let path: string | null = null;
    try {
      const uploaded = await uploadFile(BUCKET, `${book.level}/${book.book_set}-${objectName(file)}`, file);
      path = uploaded.path;
      const res = await setBookCover(book.id, uploaded);
      if (!res.ok) {
        await removeUploaded(BUCKET, [uploaded.path]);
        setCoverError(res.error ?? "표지를 저장하지 못했어요.");
        return;
      }
      router.refresh();
    } catch (e) {
      if (path) await removeUploaded(BUCKET, [path]);
      setCoverError(e instanceof Error ? e.message : "표지를 올리지 못했어요.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const removeCover = () =>
    startRemove(async () => {
      const res = await removeBookCover(book.id);
      setConfirmRemove(false);
      if (res.ok) router.refresh();
      else setCoverError(res.error ?? "표지를 지우지 못했어요.");
    });

  return (
    <li className={cn("rounded-xl2 p-3 transition sm:p-4", selected ? "bg-paper shadow-soft ring-2 ring-brand-300" : "ring-1 ring-transparent")}>
      <div className="relative mx-auto max-w-[17rem]">
        <BookCover src={book.cover_name ? coverSrc(book, 640) : null} alt={`${book.level} ${label} 표지`} />
        <div className="absolute inset-x-2 bottom-2 flex gap-1.5">
          <label
            className={cn(
              "flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-full bg-ink/85 px-3 py-1.5 text-xs font-bold text-white backdrop-blur transition hover:bg-ink",
              (busy || removing) && "pointer-events-none opacity-70",
            )}
          >
            <input ref={inputRef} type="file" accept="image/*" className="sr-only" onChange={(e) => uploadCover(e.target.files?.[0])} disabled={busy || removing} aria-label={`${label} 표지 이미지 선택`} />
            <Icon name="upload" size={14} className="brightness-0 invert" />
            {busy ? "올리는 중…" : book.cover_name ? "표지 바꾸기" : "표지 올리기"}
          </label>
          {book.cover_name &&
            (confirmRemove ? (
              <button type="button" onClick={removeCover} disabled={removing} className="rounded-full bg-red-600 px-3 py-1.5 text-xs font-bold text-white">
                {removing ? "…" : "지우기 확정"}
              </button>
            ) : (
              <button type="button" onClick={() => setConfirmRemove(true)} className="rounded-full bg-paper/90 px-3 py-1.5 text-xs font-bold text-ink hover:bg-paper" aria-label={`${label} 표지 지우기`}>
                지우기
              </button>
            ))}
        </div>
      </div>
      {coverError && <p className="mt-2 text-xs font-semibold text-red-600">{coverError}</p>}

      <p className="mt-4 text-[11px] font-black tracking-[0.18em] text-brand-600">{label}</p>
      <form action={action} className="mt-2 space-y-2">
        <input type="hidden" name="id" value={book.id} />
        <input name="title" maxLength={60} defaultValue={book.title ?? ""} placeholder={`교재명 (비우면 "${label}")`} className="input !py-2 text-sm font-bold" aria-label={`${label} 교재명`} />
        <div>
          <textarea
            name="description"
            rows={3}
            maxLength={200}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="간단한 설명 (예: 파트 1~4 유형별 기본기 · 받아쓰기 부록)"
            className="input resize-none !py-2 text-sm"
            aria-label={`${label} 설명`}
          />
          <p className="text-right text-[11px] tabular-nums text-mist">{description.length}/200</p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SubmitButton variant="dark" className="!w-auto !px-4 !py-2 text-xs" pendingText="저장 중…">
            교재 정보 저장
          </SubmitButton>
          <Link href={manageHref} className={cn("inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold transition", selected ? "bg-brand-500 text-white" : "bg-surface text-ink-soft ring-1 ring-line hover:text-brand-600")}>
            <Icon name="headphones" size={14} className={cn(selected && "brightness-0 invert")} />
            음원 {trackCount}개
          </Link>
        </div>
        {state.error && <p className="text-xs font-semibold text-red-600">{state.error}</p>}
        {state.ok && state.message && <p className="text-xs font-semibold text-brand-600">{state.message}</p>}
      </form>
    </li>
  );
}
