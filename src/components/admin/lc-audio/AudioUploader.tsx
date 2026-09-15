"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { registerAudioTracks } from "@/app/admin/lc-audio/actions";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/lib/study";
import { contentTypeOf, isAudioType, MB, objectName, type UploadedFile } from "@/lib/upload";
import { removeUploaded, uploadFile } from "@/lib/upload-client";

const BUCKET = "lc-audio";
const MAX = 50 * MB;

type Pending = { key: string; file: File; title: string };

const baseName = (name: string) => (name.includes(".") ? name.slice(0, name.lastIndexOf(".")) : name).slice(0, 100);

/** 음원 여러 개 선택 → 제목 확인 → 순서대로 업로드 후 한 번에 등록 */
export function AudioUploader({ level }: { level: number }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Pending[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  function pick(list: FileList | null) {
    setError(null);
    setDone(null);
    const files = [...(list ?? [])];
    const bad = files.find((f) => !isAudioType(contentTypeOf(f)));
    if (bad) return setError(`${bad.name}: 음원 파일(mp3·m4a·wav 등)만 올릴 수 있어요.`);
    const big = files.find((f) => f.size > MAX);
    if (big) return setError(`${big.name}: 50MB 이하 파일만 올릴 수 있어요.`);
    if (files.length > 30) return setError("한 번에 30개까지 올릴 수 있어요.");
    setItems(files.map((f, i) => ({ key: `${i}-${f.name}-${f.size}`, file: f, title: baseName(f.name) })));
  }

  async function submit() {
    if (items.length === 0) return;
    if (items.some((it) => !it.title.trim())) return setError("모든 음원에 제목을 적어 주세요.");
    setBusy(true);
    setError(null);
    const uploaded: { title: string; file: UploadedFile }[] = [];
    try {
      for (let i = 0; i < items.length; i++) {
        setProgress(`${i + 1} / ${items.length} 업로드 중…`);
        const it = items[i];
        uploaded.push({ title: it.title.trim(), file: await uploadFile(BUCKET, `${level}/${objectName(it.file)}`, it.file) });
      }
      setProgress("목록에 등록 중…");
      const res = await registerAudioTracks({ level, tracks: uploaded });
      if (!res.ok) {
        await removeUploaded(BUCKET, uploaded.map((u) => u.file.path));
        setError(res.error ?? "등록하지 못했어요.");
        return;
      }
      setItems([]);
      if (inputRef.current) inputRef.current.value = "";
      setDone(`${res.count}개 음원을 올렸어요.`);
      router.refresh();
    } catch (e) {
      await removeUploaded(BUCKET, uploaded.map((u) => u.file.path));
      setError(e instanceof Error ? e.message : "업로드하지 못했어요.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <div className="space-y-4">
      <label
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl2 border-2 border-dashed p-6 text-center transition",
          items.length ? "border-brand-300 bg-brand-50" : "border-line bg-paper hover:border-brand-300 hover:bg-brand-50/50",
          busy && "pointer-events-none opacity-60",
        )}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          pick(e.dataTransfer.files);
        }}
      >
        <input ref={inputRef} type="file" accept="audio/*,.mp3,.m4a,.wav,.aac,.ogg" multiple className="sr-only" onChange={(e) => pick(e.target.files)} disabled={busy} />
        <Icon name="headphones" size={44} />
        <span className="text-sm font-bold text-ink">여기를 눌러 {level} 음원 파일 선택 (여러 개 가능)</span>
        <span className="text-xs text-mist">mp3 · m4a · wav, 파일당 50MB 이하 · 학생 화면에서는 제목의 숫자 순서대로 정렬돼요</span>
      </label>

      {items.length > 0 && (
        <ul className="divide-y divide-line rounded-xl2 border border-line">
          {items.map((it, i) => (
            <li key={it.key} className="grid gap-2 p-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <div>
                <label htmlFor={`t-${it.key}`} className="label !mb-1 text-xs">
                  제목 <span className="font-normal text-mist">· {it.file.name} ({formatBytes(it.file.size)})</span>
                </label>
                <input
                  id={`t-${it.key}`}
                  value={it.title}
                  maxLength={100}
                  onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
                  className="input !py-2 text-sm"
                  disabled={busy}
                />
              </div>
              <button type="button" onClick={() => setItems(items.filter((_, j) => j !== i))} disabled={busy} className="btn-ghost !px-3 !py-2 text-xs">
                빼기
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={submit} disabled={busy || items.length === 0} className="btn-primary" aria-busy={busy}>
          <Icon name="upload" size={18} className="brightness-0 invert" />
          {busy ? (progress ?? "올리는 중…") : items.length ? `${items.length}개 올리기` : "음원을 선택해 주세요"}
        </button>
        {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
        {done && <p className="text-sm font-semibold text-brand-600">{done}</p>}
      </div>
    </div>
  );
}
