"use client";

import { Fragment, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { submitHomework } from "@/app/my/homework/actions";
import { HomeworkRecorder, type Recording } from "@/components/my/homework/HomeworkRecorder";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";
import {
  HOMEWORK_AUDIO_ACCEPT,
  homeworkAudioType,
  homeworkFilesError,
  homeworkFolder,
  MAX_AUDIO_MB,
  MAX_AUDIOS,
  MAX_PHOTO_MB,
  MAX_PHOTOS,
  MAX_QUESTION,
  type HomeworkSubject,
} from "@/lib/homework";
import { recordingName } from "@/lib/homework-recorder";
import { formatBytes } from "@/lib/study";
import { contentTypeOf, MB, objectName, type UploadedFile } from "@/lib/upload";
import { removeUploaded, uploadFile } from "@/lib/upload-client";

const BUCKET = "homework";

/**
 * 고른 파일 하나 — `type` 은 저장소에 붙여 올릴 형식이다 (녹음 파일은 브라우저가 형식을 비워 주기도 해서 확장자로 채운다).
 * `quiet` 는 화면에서 바로 녹음했는데 소리가 거의 안 잡힌 것 — 막지 않고 들어 보라고만 한다.
 */
type Picked = { key: string; file: File; url: string; type: string; quiet?: boolean };

/**
 * 사진 고르기(여러 장, 최대 10장) + **음성 파일 고르기**(최대 5개, 2026-10-07 Alan — "학생들이 숙제제출할때 음성파일도
 * 올릴수 있도록 부탁해!") + 질문(선택) → 브라우저에서 Storage 로 바로 올린 뒤 서버 액션에 등록.
 * `classDate` 는 학생이 달력에서 고른 **수업 날짜**다 (2026-09-19 Alan).
 *
 * 사진과 음성은 **고르는 칸이 따로다** — 한 칸에 둘 다 받으면 아이폰이 사진 보관함부터 열어 음성을 고를 수 있는지 안 보인다.
 * 둘 중 하나만 있어도 낼 수 있다 (음성만 내는 숙제가 있다). 개수 · 크기 규칙은 `homeworkFilesError` 한곳이고 서버도 같은 것을 본다.
 *
 * 음성은 **화면에서 바로 녹음**할 수도 있다 (2026-10-08 Alan — `HomeworkRecorder`). 녹음은 고른 파일과 같은 목록에 `녹음 N.wav` 로 들어가
 * 같은 길(미리 듣기 · 빼기 · 올리기)을 탄다. 녹음하는 동안은 파일 고르기 칸을 숨기고 제출을 잠근다 (끝내지 않은 녹음이 빠진 채 나가지 않게).
 */
export function HomeworkUploadForm({
  userId,
  level,
  subject,
  classDate,
  onDone,
}: {
  userId: string;
  level: number;
  subject: HomeworkSubject;
  classDate: string;
  onDone?: (id: number) => void;
}) {
  const router = useRouter();
  const photoRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<Picked[]>([]);
  const [audios, setAudios] = useState<Picked[]>([]);
  const [recording, setRecording] = useState(false);
  /** 바로 녹음한 순서 — 이름 `녹음 N` 에 쓴다 (뺀 녹음의 번호를 다시 쓰지 않는다) */
  const recordCount = useRef(0);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** 사진 · 음성이 같은 길로 고른다 — 형식 · 크기 · 개수만 다르다 */
  function pick(kind: "photo" | "audio", list: FileList | null) {
    setError(null);
    const incoming = [...(list ?? [])];
    const input = kind === "photo" ? photoRef.current : audioRef.current;
    if (input) input.value = ""; // 같은 파일을 다시 골라도 onChange 가 나게
    if (incoming.length === 0) return;

    const current = kind === "photo" ? photos : audios;
    const max = kind === "photo" ? MAX_PHOTOS : MAX_AUDIOS;
    const maxMb = kind === "photo" ? MAX_PHOTO_MB : MAX_AUDIO_MB;
    const next: Picked[] = [];
    const problems: string[] = [];
    for (const f of incoming) {
      const type = kind === "photo" ? (contentTypeOf(f).startsWith("image/") ? contentTypeOf(f) : null) : homeworkAudioType(f);
      if (!type) {
        problems.push(`${f.name}: ${kind === "photo" ? "사진 파일만 올릴 수 있어요" : "음성 파일만 올릴 수 있어요"}`);
        continue;
      }
      if (f.size > maxMb * MB) {
        problems.push(`${f.name}: ${maxMb}MB 이하만 올릴 수 있어요`);
        continue;
      }
      next.push({ key: crypto.randomUUID(), file: f, url: URL.createObjectURL(f), type });
    }
    const room = Math.max(max - current.length, 0);
    if (next.length > room) {
      next.slice(room).forEach((p) => URL.revokeObjectURL(p.url));
      problems.push(kind === "photo" ? `사진은 ${max}장까지 올릴 수 있어서 ${next.length - room}장은 빠졌어요` : `음성 파일은 ${max}개까지 올릴 수 있어서 ${next.length - room}개는 빠졌어요`);
    }
    (kind === "photo" ? setPhotos : setAudios)([...current, ...next.slice(0, room)]);
    if (problems.length) setError(problems.join(" · "));
  }

  /** 바로 녹음한 것을 음성 목록에 — 고른 파일과 같은 한도를 본다 */
  function addRecording(r: Recording) {
    setError(null);
    if (audios.length >= MAX_AUDIOS) return setError(`음성 파일은 ${MAX_AUDIOS}개까지 올릴 수 있어요.`);
    if (r.blob.size > MAX_AUDIO_MB * MB) return setError(`녹음이 ${MAX_AUDIO_MB}MB 를 넘어 담지 못했어요. 나눠서 녹음해 주세요.`);
    recordCount.current += 1;
    const file = new File([r.blob], recordingName(recordCount.current, r.ext), { type: r.type, lastModified: Date.now() });
    setAudios([...audios, { key: crypto.randomUUID(), file, url: URL.createObjectURL(file), type: r.type, quiet: r.quiet }]);
  }

  function remove(kind: "photo" | "audio", key: string) {
    setError(null);
    (kind === "photo" ? setPhotos : setAudios)((prev) => {
      const target = prev.find((p) => p.key === key);
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((p) => p.key !== key);
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    const picked = [...photos, ...audios];
    const filesError = homeworkFilesError(picked.map((p) => ({ type: p.type, size: p.file.size })));
    if (filesError) return setError(filesError);
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
      for (let i = 0; i < picked.length; i++) {
        setProgress(`파일 ${i + 1} / ${picked.length} 올리는 중…`);
        uploaded.push(await uploadFile(BUCKET, `${folder}/${objectName(picked[i].file)}`, picked[i].file, picked[i].type));
      }
      setProgress("제출하는 중…");
      const res = await submitHomework({ level, subject, classDate, question: q, files: uploaded });
      if (!res.ok || !res.id) return await fail(res.error ?? "제출하지 못했어요.");

      // 같은 화면에서 목록만 새로 받는다 (달력·고른 날짜는 그대로 둔다)
      setProgress("완료! 잠시만요…");
      picked.forEach((p) => URL.revokeObjectURL(p.url));
      setPhotos([]);
      setAudios([]);
      setQuestion("");
      router.refresh();
      onDone?.(res.id);
      setBusy(false);
      setProgress(null);
    } catch (err) {
      await fail(err instanceof Error ? err.message : "제출하지 못했어요.");
    }
  }

  const photosFull = photos.length >= MAX_PHOTOS;
  const audiosFull = audios.length >= MAX_AUDIOS;
  const counts = [photos.length ? `사진 ${photos.length}장` : null, audios.length ? `음성 ${audios.length}개` : null].filter((c): c is string => !!c);
  const dropClass = cn(
    "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl2 border-2 border-dashed px-4 py-6 text-center text-sm font-bold transition",
    busy ? "pointer-events-none border-brand-300 bg-brand-50 text-brand-700" : "border-line bg-paper text-ink hover:border-brand-300 hover:bg-brand-50/50",
  );

  return (
    <form onSubmit={submit} className="space-y-5" aria-busy={busy}>
      <section className="card p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <h3 className="font-black text-ink">풀이 사진</h3>
          <span className={cn("text-sm font-bold tabular-nums", photosFull ? "text-brand-600" : "text-slate")}>
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
                  onClick={() => remove("photo", p.key)}
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

        {!photosFull && (
          <label className={cn("mt-3", dropClass)}>
            <input ref={photoRef} type="file" accept="image/*" multiple className="sr-only" onChange={(e) => pick("photo", e.target.files)} disabled={busy} />
            <Icon name="camera" size={36} />
            {photos.length ? "사진 더 고르기" : "사진 고르기 (여러 장 선택 가능)"}
            <span className="text-xs font-medium text-mist">
              찍어 둔 사진을 고르거나 지금 찍어서 올려요 · 한 장에 {MAX_PHOTO_MB}MB 이하
            </span>
          </label>
        )}
      </section>

      {/* 음성 파일 (2026-10-07 Alan) — 사진과 칸을 나눈다. 고른 파일은 올리기 전에 들어 볼 수 있다 (같은 이름의 녹음이 여럿일 때 맞는 것을 골랐는지) */}
      <section className="card p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <h3 className="font-black text-ink">음성 파일</h3>
          <span className={cn("text-sm font-bold tabular-nums", audiosFull ? "text-brand-600" : "text-slate")}>
            {audios.length} / {MAX_AUDIOS}
          </span>
        </div>

        {audios.length > 0 && (
          <ul className="mt-3 space-y-2">
            {audios.map((a, i) => (
              <li key={a.key} className="animate-fade-up rounded-xl border border-line bg-paper p-2.5">
                <div className="flex min-w-0 items-center gap-2">
                  <Icon name="headphones" size={18} />
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink" title={a.file.name}>
                    {a.file.name}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-mist">{formatBytes(a.file.size)}</span>
                  <button
                    type="button"
                    onClick={() => remove("audio", a.key)}
                    disabled={busy}
                    aria-label={`음성 파일 ${i + 1} 빼기`}
                    className="shrink-0 rounded-full bg-surface px-2.5 py-1 text-[11px] font-bold text-ink-soft ring-1 ring-line transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                  >
                    빼기
                  </button>
                </div>
                {/* 올리기 전 미리 듣기 — 아직 내 기기에 있는 파일이라 브라우저 기본 재생 칸으로 충분하다 */}
                <audio controls preload="metadata" src={a.url} className="mt-2 h-10 w-full" aria-label={`${a.file.name} 미리 듣기`} />
                {a.quiet && (
                  <p className="mt-1.5 text-xs font-bold text-amber-800">소리가 거의 녹음되지 않았어요. 들어 보고 안 들리면 빼고 다시 녹음해 주세요.</p>
                )}
              </li>
            ))}
          </ul>
        )}

        {/* 바로 녹음 · 파일 고르기 두 길 (넓은 화면은 나란히). 녹음하는 동안은 녹음 칸만 — 끝내기 · 취소에 손이 가게 */}
        {!audiosFull && (
          <div className={cn("mt-3 grid gap-2", !recording && "sm:grid-cols-2")}>
            <HomeworkRecorder disabled={busy} onRecorded={addRecording} onActiveChange={setRecording} />
            {!recording && (
              <label className={dropClass}>
                <input
                  ref={audioRef}
                  type="file"
                  accept={HOMEWORK_AUDIO_ACCEPT}
                  multiple
                  className="sr-only"
                  onChange={(e) => pick("audio", e.target.files)}
                  disabled={busy}
                />
                <Icon name="headphones" size={36} />
                {audios.length ? "음성 파일 더 고르기" : "음성 파일 고르기"}
                <span className="text-xs font-medium text-mist">녹음 앱으로 녹음한 파일을 골라요 · 한 개에 {MAX_AUDIO_MB}MB 이하</span>
                <span className="text-xs font-medium text-mist">아이폰 음성 메모는 ⋯ → 공유 → ‘파일에 저장’ 한 뒤 여기서 골라요</span>
              </label>
            )}
          </div>
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

      <button type="submit" disabled={busy || recording || (photos.length === 0 && audios.length === 0)} className="btn-primary w-full text-base">
        {busy ? (
          (progress ?? "올리는 중…")
        ) : recording ? (
          "녹음을 끝내면 낼 수 있어요"
        ) : (
          // 좁은 화면(320px)에서 두 줄이 되면 `음성` / `2개` 처럼 쪼개지지 않게 덩어리마다 묶는다
          <span className="text-center">
            <span className="whitespace-nowrap">숙제 제출하기</span>
            {counts.map((c) => (
              <Fragment key={c}>
                {" "}
                <span className="whitespace-nowrap">· {c}</span>
              </Fragment>
            ))}
          </span>
        )}
      </button>
      <p className="text-center text-xs text-mist">사진은 글씨가 잘 보이게 찍어 주세요. 사진과 음성 중 하나만 있어도 낼 수 있어요. 점검이 끝나면 제출을 바꿀 수 없어요.</p>
    </form>
  );
}
