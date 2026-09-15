"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteTextbookImage, registerTextbookImages } from "@/app/admin/lc-audio/actions";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";
import { contentTypeOf, MB, objectName, type UploadedFile } from "@/lib/upload";
import { removeUploaded, uploadFile } from "@/lib/upload-client";

const BUCKET = "lc-textbooks";

export type TextbookImageLite = { id: number; file_name: string };

/** 레벨별 교재 이미지: 올리기 · 지우기 */
export function TextbookImages({ level, images }: { level: number; images: TextbookImageLite[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removing, startRemove] = useTransition();
  const [confirmId, setConfirmId] = useState<number | null>(null);

  async function upload(list: FileList | null) {
    setError(null);
    const files = [...(list ?? [])];
    if (files.length === 0) return;
    if (files.length > 10) return setError("한 번에 10장까지 올릴 수 있어요.");
    const bad = files.find((f) => !contentTypeOf(f).startsWith("image/"));
    if (bad) return setError(`${bad.name}: 이미지 파일만 올릴 수 있어요.`);
    const big = files.find((f) => f.size > 10 * MB);
    if (big) return setError(`${big.name}: 10MB 이하 이미지만 올릴 수 있어요.`);

    setBusy(true);
    const uploaded: UploadedFile[] = [];
    try {
      for (const f of files) uploaded.push(await uploadFile(BUCKET, `${level}/${objectName(f)}`, f));
      const res = await registerTextbookImages(level, uploaded);
      if (!res.ok) {
        await removeUploaded(BUCKET, uploaded.map((u) => u.path));
        setError(res.error ?? "올리지 못했어요.");
        return;
      }
      router.refresh();
    } catch (e) {
      await removeUploaded(BUCKET, uploaded.map((u) => u.path));
      setError(e instanceof Error ? e.message : "올리지 못했어요.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const remove = (id: number) =>
    startRemove(async () => {
      setError(null);
      const res = await deleteTextbookImage(id);
      setConfirmId(null);
      if (res.ok) router.refresh();
      else setError(res.error ?? "지우지 못했어요.");
    });

  return (
    <div>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {images.map((img) => (
          <li key={img.id} className="relative">
            <a href={`/files/textbook/${img.id}`} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-xl border border-line bg-surface" title={`${img.file_name} 크게 보기`}>
              {/* 비공개 서명 URL 로 리다이렉트되는 이미지라 next/image 최적화를 쓰지 않는다 */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/files/textbook/${img.id}?w=480`} alt={`${level} 교재 이미지`} loading="lazy" className="aspect-[3/4] w-full object-cover" />
            </a>
            {confirmId === img.id ? (
              <span className="absolute inset-x-1 bottom-1 flex gap-1">
                <button type="button" onClick={() => remove(img.id)} disabled={removing} className="flex-1 rounded-full bg-red-600 px-2 py-1 text-[11px] font-bold text-white">
                  {removing ? "…" : "삭제 확정"}
                </button>
                <button type="button" onClick={() => setConfirmId(null)} className="rounded-full bg-paper px-2 py-1 text-[11px] font-bold text-ink">
                  취소
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmId(img.id)}
                aria-label={`${img.file_name} 지우기`}
                className="absolute right-1 top-1 rounded-full bg-ink/80 px-2 py-0.5 text-[11px] font-bold text-white hover:bg-red-600"
              >
                지우기
              </button>
            )}
          </li>
        ))}
        <li>
          <label
            className={cn(
              "flex aspect-[3/4] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-3 text-center text-xs font-bold transition",
              busy ? "pointer-events-none border-brand-300 bg-brand-50 text-brand-700" : "border-line bg-paper text-ink hover:border-brand-300 hover:bg-brand-50/50",
            )}
          >
            <input ref={inputRef} type="file" accept="image/*" multiple className="sr-only" onChange={(e) => upload(e.target.files)} disabled={busy} />
            <Icon name="upload" size={28} />
            {busy ? "올리는 중…" : "교재 이미지 올리기"}
            <span className="font-normal text-mist">JPG·PNG, 10MB 이하</span>
          </label>
        </li>
      </ul>
      {error && <p className="mt-2 text-xs font-semibold text-red-600">{error}</p>}
    </div>
  );
}
