"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteStudyCheckin, submitStudyCheckin } from "@/app/my/study/actions";
import { Icon } from "@/components/ui/Icon";
import { cn, formatDate } from "@/lib/utils";
import { CHECKIN_BUCKET, CHECKIN_MAX_NOTE, CHECKIN_MAX_PHOTO_MB, CHECKIN_MAX_PHOTOS, checkinFolder } from "@/lib/study-checkin";
import { contentTypeOf, MB, objectName, type UploadedFile } from "@/lib/upload";
import { removeUploaded, uploadFile } from "@/lib/upload-client";

export type MyCheckin = { id: number; created_at: string; files: number };
type Picked = { key: string; file: File; url: string };

/**
 * 비대면 스터디 자료 한 줄의 **인증** (2026-09-18 Alan — "인증은 비대면 스터디 페이지에서 항상").
 * 인증 전: [인증하기] → 풀이 사진 고르기(1~10장) + 메모 → 브라우저에서 Storage 로 올린 뒤 서버 액션에 등록.
 * 인증 후: 인증 시각 · 사진 수 배지 + [지우고 다시] .
 */
export function CheckinPanel({ materialId, userId, checkin }: { materialId: number; userId: string; checkin: MyCheckin | null }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [photos, setPhotos] = useState<Picked[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function pick(list: FileList | null) {
    setError(null);
    const incoming = [...(list ?? [])];
    if (inputRef.current) inputRef.current.value = "";
    const next: Picked[] = [];
    const problems: string[] = [];
    for (const f of incoming) {
      if (!contentTypeOf(f).startsWith("image/")) {
        problems.push(`${f.name}: 사진 파일만 올릴 수 있어요`);
        continue;
      }
      if (f.size > CHECKIN_MAX_PHOTO_MB * MB) {
        problems.push(`${f.name}: ${CHECKIN_MAX_PHOTO_MB}MB 이하만`);
        continue;
      }
      next.push({ key: crypto.randomUUID(), file: f, url: URL.createObjectURL(f) });
    }
    const room = Math.max(CHECKIN_MAX_PHOTOS - photos.length, 0);
    if (next.length > room) problems.push(`사진은 ${CHECKIN_MAX_PHOTOS}장까지예요`);
    setPhotos([...photos, ...next.slice(0, room)]);
    if (problems.length) setError(problems.join(" · "));
  }

  async function submit() {
    if (busy) return;
    if (photos.length === 0) return setError("풀이 사진을 한 장 이상 골라 주세요.");
    setBusy(true);
    setError(null);
    const uploaded: UploadedFile[] = [];
    const fail = async (message: string) => {
      await removeUploaded(CHECKIN_BUCKET, uploaded.map((u) => u.path));
      setError(message);
      setBusy(false);
      setProgress(null);
    };
    try {
      const folder = checkinFolder(userId, materialId);
      for (let i = 0; i < photos.length; i++) {
        setProgress(`사진 ${i + 1} / ${photos.length} 올리는 중…`);
        uploaded.push(await uploadFile(CHECKIN_BUCKET, `${folder}/${objectName(photos[i].file)}`, photos[i].file));
      }
      setProgress("인증하는 중…");
      const res = await submitStudyCheckin({ materialId, note: note.trim(), files: uploaded });
      if (!res.ok) return await fail(res.error ?? "인증하지 못했어요.");
      photos.forEach((p) => URL.revokeObjectURL(p.url));
      setPhotos([]);
      setNote("");
      setOpen(false);
      setBusy(false);
      setProgress(null);
      router.refresh();
    } catch (err) {
      await fail(err instanceof Error ? err.message : "인증하지 못했어요.");
    }
  }

  async function remove() {
    if (!checkin || busy) return;
    if (!window.confirm("이 날짜의 인증을 지우고 다시 올릴까요? 올린 사진도 함께 지워져요.")) return;
    setBusy(true);
    const res = await deleteStudyCheckin(checkin.id);
    setBusy(false);
    if (!res.ok) return setError(res.error ?? "지우지 못했어요.");
    router.refresh();
  }

  if (checkin) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-brand-500 px-2.5 py-1 text-xs font-black text-white">
          <Icon name="success" size={14} className="brightness-0 invert" />
          인증함 · {formatDate(checkin.created_at, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} · 사진 {checkin.files}장
        </span>
        <button type="button" onClick={remove} disabled={busy} className="btn-ghost !px-3 !py-1.5 text-xs">
          지우고 다시
        </button>
        {error && <p role="alert" className="w-full text-xs font-semibold text-amber-800">{error}</p>}
      </div>
    );
  }

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-black text-amber-800">미인증</span>
        <button type="button" onClick={() => setOpen(true)} className="btn-secondary !px-4 !py-2 text-sm">
          <Icon name="camera" size={18} />
          인증하기
        </button>
      </div>
    );
  }

  const full = photos.length >= CHECKIN_MAX_PHOTOS;
  return (
    <div className="w-full rounded-xl2 border border-brand-200 bg-brand-50/50 p-4" aria-busy={busy}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-black text-ink">풀이 사진으로 인증하기</p>
        <span className={cn("text-xs font-bold tabular-nums", full ? "text-brand-600" : "text-slate")}>{photos.length} / {CHECKIN_MAX_PHOTOS}</span>
      </div>

      {photos.length > 0 && (
        <ul className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6">
          {photos.map((p, i) => (
            <li key={p.key} className="relative">
              {/* 아직 올리지 않은 로컬 미리보기(blob URL)라 next/image 를 쓰지 않는다 */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={`고른 사진 ${i + 1}`} className="aspect-square w-full rounded-lg border border-line object-cover" />
              <button
                type="button"
                disabled={busy}
                aria-label={`사진 ${i + 1} 빼기`}
                onClick={() => setPhotos((prev) => prev.filter((x) => x.key !== p.key))}
                className="absolute right-1 top-1 rounded-full bg-ink/80 px-1.5 text-[10px] font-bold text-white hover:bg-red-600"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {!full && (
        <label className={cn("mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-4 text-sm font-bold", busy ? "pointer-events-none border-brand-300 text-brand-700" : "border-line bg-paper text-ink hover:border-brand-300")}>
          <input ref={inputRef} type="file" accept="image/*" multiple className="sr-only" onChange={(e) => pick(e.target.files)} disabled={busy} />
          <Icon name="camera" size={22} />
          {photos.length ? "사진 더 고르기" : "사진 고르기 (여러 장 가능)"}
        </label>
      )}

      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={CHECKIN_MAX_NOTE}
        disabled={busy}
        placeholder="메모 (선택) — 어려웠던 문제 등"
        className="input mt-3 !py-2 text-sm"
      />

      {error && <p role="alert" className="mt-2 text-xs font-semibold text-amber-800">{error}</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={submit} disabled={busy || photos.length === 0} className="btn-primary !px-4 !py-2 text-sm">
          {busy ? (progress ?? "올리는 중…") : `인증 제출${photos.length ? ` · 사진 ${photos.length}장` : ""}`}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            photos.forEach((p) => URL.revokeObjectURL(p.url));
            setPhotos([]);
            setOpen(false);
            setError(null);
          }}
          className="btn-ghost !px-3 !py-2 text-sm"
        >
          취소
        </button>
      </div>
    </div>
  );
}
