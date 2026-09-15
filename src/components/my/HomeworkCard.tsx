"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteHomeworkFile, registerHomeworkFiles } from "@/app/my/homework/actions";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";
import { formatBytes, shortDateTimeKST } from "@/lib/study";
import { labelKo } from "@/components/admin/sections/dates";
import { contentTypeOf, isImageType, MB, objectName, type UploadedFile } from "@/lib/upload";
import { removeUploaded, uploadFile } from "@/lib/upload-client";

const BUCKET = "homework";

type HomeworkFile = { id: number; file_name: string; file_size: number | null; content_type: string | null; created_at: string };

export function HomeworkCard({
  userId,
  material,
  submission,
}: {
  userId: string;
  material: { id: number; date: string; title: string | null; file_name: string };
  submission: { id: number; status: string; created_at: string; checked_at: string | null; files: HomeworkFile[] } | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removing, startRemove] = useTransition();
  const [removingId, setRemovingId] = useState<number | null>(null);

  const checked = submission?.status === "checked";
  const files = [...(submission?.files ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at));

  async function upload(list: FileList | null) {
    setError(null);
    const picked = [...(list ?? [])];
    if (picked.length === 0) return;
    if (picked.length > 10) return setError("한 번에 10개까지 올릴 수 있어요.");
    const bad = picked.find((f) => !(contentTypeOf(f).startsWith("image/") || contentTypeOf(f) === "application/pdf"));
    if (bad) return setError(`${bad.name}: 사진 또는 PDF 파일만 올릴 수 있어요.`);
    const big = picked.find((f) => f.size > 20 * MB);
    if (big) return setError(`${big.name}: 20MB 이하 파일만 올릴 수 있어요.`);

    setBusy(true);
    const uploaded: UploadedFile[] = [];
    try {
      for (let i = 0; i < picked.length; i++) {
        setProgress(`${i + 1} / ${picked.length} 올리는 중…`);
        uploaded.push(await uploadFile(BUCKET, `${userId}/${material.id}/${objectName(picked[i])}`, picked[i]));
      }
      setProgress("제출하는 중…");
      const res = await registerHomeworkFiles(material.id, uploaded);
      if (!res.ok) {
        await removeUploaded(BUCKET, uploaded.map((u) => u.path));
        setError(res.error ?? "제출하지 못했어요.");
        return;
      }
      router.refresh();
    } catch (e) {
      await removeUploaded(BUCKET, uploaded.map((u) => u.path));
      setError(e instanceof Error ? e.message : "제출하지 못했어요.");
    } finally {
      setBusy(false);
      setProgress(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const remove = (id: number) =>
    startRemove(async () => {
      setError(null);
      setRemovingId(id);
      const res = await deleteHomeworkFile(id);
      setRemovingId(null);
      if (res.ok) router.refresh();
      else setError(res.error ?? "지우지 못했어요.");
    });

  return (
    <article id={`m-${material.id}`} className={cn("card scroll-mt-24 p-4 sm:p-5", checked && "border-brand-200")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-black text-ink">{labelKo(material.date)}</h3>
          <p className="truncate text-sm text-slate">{material.title || material.file_name}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-xs font-black",
              checked ? "bg-brand-500 text-white" : submission ? "bg-ink text-white" : "bg-line text-slate",
            )}
          >
            {checked ? "점검완료" : submission ? `제출됨 · ${files.length}개` : "미제출"}
          </span>
          <a href={`/files/material/${material.id}?download=1`} className="btn-ghost !px-3 !py-1.5 text-xs">
            <Icon name="download" size={14} />
            자료 받기
          </a>
        </div>
      </div>

      {files.length > 0 && (
        <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {files.map((f) => (
            <li key={f.id} className="relative">
              <a
                href={`/files/homework/${f.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex aspect-square flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border border-line bg-surface text-center"
                title={f.file_name}
              >
                {isImageType(f.content_type) ? (
                  // 비공개 서명 URL 로 리다이렉트되는 썸네일이라 next/image 최적화를 쓰지 않는다
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/files/homework/${f.id}?w=300`} alt={`제출한 사진 ${f.file_name}`} loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <>
                    <Icon name="textbook" size={28} />
                    <span className="line-clamp-2 px-1 text-[11px] font-semibold text-ink">{f.file_name}</span>
                    <span className="text-[10px] text-mist">{formatBytes(f.file_size)}</span>
                  </>
                )}
              </a>
              {!checked && (
                <button
                  type="button"
                  onClick={() => remove(f.id)}
                  disabled={removing}
                  aria-label={`${f.file_name} 지우기`}
                  className="absolute right-1 top-1 rounded-full bg-ink/80 px-2 py-0.5 text-[11px] font-bold text-white hover:bg-red-600"
                >
                  {removingId === f.id ? "…" : "지우기"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {checked ? (
        <p className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-brand-700">
          <Icon name="success" size={18} />
          {submission?.checked_at ? `${shortDateTimeKST(submission.checked_at)} 강사 점검 완료` : "강사 점검 완료"}
        </p>
      ) : (
        <label
          className={cn(
            "mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-xl2 border-2 border-dashed px-4 py-4 text-sm font-bold transition",
            busy ? "pointer-events-none border-brand-300 bg-brand-50 text-brand-700" : "border-line bg-paper text-ink hover:border-brand-300 hover:bg-brand-50/50",
          )}
        >
          <input ref={inputRef} type="file" accept="image/*,application/pdf" multiple className="sr-only" onChange={(e) => upload(e.target.files)} disabled={busy} />
          <Icon name="upload" size={22} />
          {busy ? (progress ?? "올리는 중…") : files.length ? "사진·PDF 더 올리기" : "풀이 사진·PDF 올리기"}
        </label>
      )}

      {error && <p className="mt-2 text-xs font-semibold text-red-600">{error}</p>}
    </article>
  );
}
