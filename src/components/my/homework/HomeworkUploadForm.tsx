"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { submitHomework } from "@/app/my/homework/actions";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";
import { homeworkFolder, MAX_PHOTO_MB, MAX_PHOTOS, MAX_QUESTION, type HomeworkSubject } from "@/lib/homework";
import { contentTypeOf, MB, objectName, type UploadedFile } from "@/lib/upload";
import { removeUploaded, uploadFile } from "@/lib/upload-client";

const BUCKET = "homework";

type Picked = { key: string; file: File; url: string };

/** 3단계: 사진 고르기(여러 장, 최대 10장) + 질문(선택) → 브라우저에서 Storage 로 바로 올린 뒤 서버 액션에 등록 */
export function HomeworkUploadForm({ userId, level, subject }: { userId: string; level: number; subject: HomeworkSubject }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<Picked[]>([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function pick(list: FileList | null) {
    setError(null);
    const incoming = [...(list ?? [])];
    if (inputRef.current) inputRef.current.value = ""; // 같은 사진을 다시 골라도 onChange 가 나게
    if (incoming.length === 0) return;

    const next: Picked[] = [];
    const problems: string[] = [];
    for (const f of incoming) {
      if (!contentTypeOf(f).startsWith("image/")) {
        problems.push(`${f.name}: 사진 파일만 올릴 수 있어요`);
        continue;
      }
      if (f.size > MAX_PHOTO_MB * MB) {
        problems.push(`${f.name}: ${MAX_PHOTO_MB}MB 이하만 올릴 수 있어요`);
        continue;
      }
      next.push({ key: crypto.randomUUID(), file: f, url: URL.createObjectURL(f) });
    }
    const room = Math.max(MAX_PHOTOS - photos.length, 0);
    if (next.length > room) {
      next.slice(room).forEach((p) => URL.revokeObjectURL(p.url));
      problems.push(`사진은 ${MAX_PHOTOS}장까지 올릴 수 있어서 ${next.length - room}장은 빠졌어요`);
    }
    setPhotos([...photos, ...next.slice(0, room)]);
    if (problems.length) setError(problems.join(" · "));
  }

  function remove(key: string) {
    setError(null);
    setPhotos((prev) => {
      const target = prev.find((p) => p.key === key);
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((p) => p.key !== key);
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (photos.length === 0) return setError("풀이 사진을 한 장 이상 골라 주세요.");
    const q = question.trim();
    if (q.length > MAX_QUESTION) return setError(`질문은 ${MAX_QUESTION}자 이내로 적어 주세요.`);

    setBusy(true);
    const uploaded: UploadedFile[] = [];
    const fail = async (message: string) => {
      await removeUploaded(BUCKET, uploaded.map((u) => u.path));
      setError(message);
      setBusy(false);
      setProgress(null);
    };
    try {
      const folder = homeworkFolder(userId, level, subject);
      for (let i = 0; i < photos.length; i++) {
        setProgress(`사진 ${i + 1} / ${photos.length} 올리는 중…`);
        uploaded.push(await uploadFile(BUCKET, `${folder}/${objectName(photos[i].file)}`, photos[i].file));
      }
      setProgress("제출하는 중…");
      const res = await submitHomework({ level, subject, question: q, files: uploaded });
      if (!res.ok || !res.id) return await fail(res.error ?? "제출하지 못했어요.");

      // 완료 화면으로 이동. 이동이 끝날 때까지 버튼은 잠긴 채 둔다
      setProgress("완료! 잠시만요…");
      photos.forEach((p) => URL.revokeObjectURL(p.url));
      router.push(`/my/homework/${level}/${subject}?done=${res.id}`);
    } catch (err) {
      await fail(err instanceof Error ? err.message : "제출하지 못했어요.");
    }
  }

  const full = photos.length >= MAX_PHOTOS;

  return (
    <form onSubmit={submit} className="space-y-5" aria-busy={busy}>
      <section className="card p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <h3 className="font-black text-ink">풀이 사진</h3>
          <span className={cn("text-sm font-bold tabular-nums", full ? "text-brand-600" : "text-slate")}>
            {photos.length} / {MAX_PHOTOS}
          </span>
        </div>

        {photos.length > 0 && (
          <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
            {photos.map((p, i) => (
              <li key={p.key} className="relative animate-fade-up" style={{ animationDelay: `${Math.min(i, 9) * 40}ms` }}>
                {/* 아직 올리지 않은 로컬 미리보기(blob URL)라 next/image 를 쓰지 않는다 */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={`고른 사진 ${i + 1}`} className="aspect-square w-full rounded-xl border border-line object-cover" />
                <span className="absolute left-1 top-1 rounded-full bg-ink/80 px-1.5 text-[11px] font-bold text-white">{i + 1}</span>
                <button
                  type="button"
                  onClick={() => remove(p.key)}
                  disabled={busy}
                  aria-label={`사진 ${i + 1} 빼기`}
                  className="absolute right-1 top-1 rounded-full bg-ink/80 px-2 py-0.5 text-[11px] font-bold text-white hover:bg-red-600 disabled:opacity-50"
                >
                  빼기
                </button>
              </li>
            ))}
          </ul>
        )}

        {!full && (
          <label
            className={cn(
              "mt-3 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl2 border-2 border-dashed px-4 py-6 text-center text-sm font-bold transition",
              busy ? "pointer-events-none border-brand-300 bg-brand-50 text-brand-700" : "border-line bg-paper text-ink hover:border-brand-300 hover:bg-brand-50/50",
            )}
          >
            <input ref={inputRef} type="file" accept="image/*" multiple className="sr-only" onChange={(e) => pick(e.target.files)} disabled={busy} />
            <Icon name="camera" size={36} />
            {photos.length ? "사진 더 고르기" : "사진 고르기 (여러 장 선택 가능)"}
            <span className="text-xs font-medium text-mist">
              찍어 둔 사진을 고르거나 지금 찍어서 올려요 · 한 장에 {MAX_PHOTO_MB}MB 이하
            </span>
          </label>
        )}
      </section>

      <section className="card p-4 sm:p-5">
        <label htmlFor="question" className="label">
          질문 <span className="font-normal text-mist">(선택)</span>
        </label>
        <textarea
          id="question"
          name="question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={MAX_QUESTION}
          rows={3}
          disabled={busy}
          placeholder="헷갈리는 문제나 궁금한 점이 있으면 적어 주세요. 없으면 비워 두어도 돼요."
          className="input min-h-24 resize-y"
        />
        <p className="mt-1 text-right text-xs text-mist tabular-nums">
          {question.length} / {MAX_QUESTION}
        </p>
      </section>

      {error && (
        <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
          {error}
        </p>
      )}

      <button type="submit" disabled={busy || photos.length === 0} className="btn-primary w-full text-base">
        {busy ? (progress ?? "올리는 중…") : `숙제 제출하기${photos.length ? ` · 사진 ${photos.length}장` : ""}`}
      </button>
      <p className="text-center text-xs text-mist">글씨가 잘 보이게 찍어 주세요. 점검이 끝나면 제출을 바꿀 수 없어요.</p>
    </form>
  );
}
