"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteAudioTrack, setAudioTracks, setLessonOffset, setTrackLabel } from "@/app/admin/lc-audio/actions";
import { AudioPlayer } from "@/components/lc/AudioPlayer";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/lib/study";
import { contentTypeOf, isAudioType, MB, objectName, type UploadedFile } from "@/lib/upload";
import { removeUploaded, uploadFile } from "@/lib/upload-client";
import { AUDIO_KINDS, AUDIO_KIND_HINT, AUDIO_KIND_LABEL, DAYS, DAY_COUNT, groupByDay, lessonLabel, sortByName, type AudioKind } from "@/lib/lc-audio";

const BUCKET = "lc-audio";
const MAX = 50 * MB;

export type AudioDayTrack = {
  id: number;
  day: number;
  kind: string;
  label: string | null;
  sort_order: number;
  file_name: string;
  file_size: number | null;
};

type Pending = { file: File; day: number; label: string };

/**
 * 관리자: 교재 한 권의 음원 — 수업/숙제 종류를 고르고 강 칸을 채운다.
 * 한 강에 파일이 여러 개일 수 있어(650A 3강 = 교과서 현재진행형 + 영국발음) 덮어쓰지 않고 더한다.
 */
export function AudioDays({
  bookId,
  label,
  lessonOffset,
  tracks,
}: {
  bookId: number;
  label: string;
  lessonOffset: number;
  tracks: AudioDayTrack[];
}) {
  const router = useRouter();
  const bulkRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<AudioKind>("lesson");
  const [pending, setPending] = useState<Pending[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [offset, setOffset] = useState(String(lessonOffset));
  const [savingOffset, startOffset] = useTransition();
  const [deleting, startDelete] = useTransition();

  const byDay = groupByDay(tracks, kind);
  const lesson = (day: number) => lessonLabel(day, lessonOffset);
  const working = busy || deleting;

  const reset = () => {
    setError(null);
    setDone(null);
  };

  /**
   * 고른 파일을 강 칸에 미리 배치한다 — 파일명 숫자 순서로 1강부터 채우고,
   * 칸보다 파일이 많으면 남는 파일은 마지막 칸에 함께 넣는다
   * (650A 는 10강 파일을 9강과 같이 둔다 — 2026-09-16 Alan).
   * 올리기 전에 화면에서 고칠 수 있다.
   */
  function stage(list: FileList | null) {
    reset();
    const files = sortByName([...(list ?? [])].map((f) => ({ f, name: f.name }))).map((x) => x.f);
    if (files.length === 0) return;
    const bad = files.find((f) => !isAudioType(contentTypeOf(f)));
    if (bad) return setError(`${bad.name}: 음원 파일(mp3 · m4a · wav 등)만 올릴 수 있어요.`);
    const big = files.find((f) => f.size > MAX);
    if (big) return setError(`${big.name}: 50MB 이하 파일만 올릴 수 있어요.`);

    setPending(files.map((file, i) => ({ file, day: Math.min(i + 1, DAY_COUNT), label: "" })));
  }

  async function upload() {
    if (!pending?.length) return;
    reset();
    setBusy(true);
    const uploaded: { day: number; label: string | null; file: UploadedFile }[] = [];
    try {
      for (let i = 0; i < pending.length; i++) {
        setProgress(`${i + 1} / ${pending.length} 업로드 중…`);
        const p = pending[i];
        uploaded.push({ day: p.day, label: p.label.trim() || null, file: await uploadFile(BUCKET, `${bookId}/${objectName(p.file)}`, p.file) });
      }
      setProgress("목록에 등록 중…");
      const res = await setAudioTracks({ bookId, kind, tracks: uploaded });
      if (!res.ok) {
        await removeUploaded(BUCKET, uploaded.map((u) => u.file.path));
        setError(res.error ?? "등록하지 못했어요.");
        return;
      }
      if (bulkRef.current) bulkRef.current.value = "";
      setPending(null);
      setDone(`${AUDIO_KIND_LABEL[kind]} ${res.count}개를 올렸어요.`);
      router.refresh();
    } catch (e) {
      await removeUploaded(BUCKET, uploaded.map((u) => u.file.path));
      setError(e instanceof Error ? e.message : "업로드하지 못했어요.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  const onDelete = (id: number) =>
    startDelete(async () => {
      const res = await deleteAudioTrack(id);
      setConfirmId(null);
      if (res.ok) router.refresh();
      else setError(res.error ?? "삭제하지 못했어요.");
    });

  const saveOffset = () =>
    startOffset(async () => {
      reset();
      const res = await setLessonOffset(bookId, Number(offset));
      if (res.ok) {
        setDone("시작 강 번호를 저장했어요.");
        router.refresh();
      } else setError(res.error ?? "저장하지 못했어요.");
    });

  return (
    <div className="space-y-4">
      {/* 종류 · 시작 강 번호 */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex gap-1 rounded-full bg-surface p-1 ring-1 ring-line">
          {AUDIO_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setKind(k);
                setPending(null);
                reset();
              }}
              aria-pressed={kind === k}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-black transition",
                kind === k ? "bg-brand-500 text-white shadow-pink" : "text-slate hover:text-brand-600",
              )}
            >
              {AUDIO_KIND_LABEL[k]}
              <span className="ml-1.5 tabular-nums opacity-70">{tracks.filter((t) => t.kind === k).length}</span>
            </button>
          ))}
        </span>

        <span className="ml-auto flex items-center gap-1.5">
          <label htmlFor={`offset-${bookId}`} className="text-xs font-bold text-slate">
            시작 강 번호
          </label>
          <input
            id={`offset-${bookId}`}
            inputMode="numeric"
            value={offset}
            onChange={(e) => setOffset(e.target.value.replace(/[^\d]/g, ""))}
            className="input !w-16 !py-1.5 text-center text-sm"
            aria-describedby={`offset-hint-${bookId}`}
          />
          <button type="button" onClick={saveOffset} disabled={savingOffset || offset === String(lessonOffset)} className="btn-ghost !px-3 !py-1.5 text-xs">
            {savingOffset ? "저장 중…" : "저장"}
          </button>
        </span>
      </div>
      <p id={`offset-hint-${bookId}`} className="-mt-2 text-xs text-mist">
        {AUDIO_KIND_HINT[kind]} · 칸은 {lesson(1)} ~ {lesson(DAY_COUNT)} 로 보여요. 11강부터 시작하는 교재는 시작 번호에 10 을 넣어 주세요.
      </p>

      {/* 파일 고르기 */}
      <label
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl2 border-2 border-dashed p-6 text-center transition",
          "border-line bg-paper hover:border-brand-300 hover:bg-brand-50/50",
          working && "pointer-events-none opacity-60",
        )}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          stage(e.dataTransfer.files);
        }}
      >
        <input
          ref={bulkRef}
          type="file"
          accept="audio/*,.mp3,.m4a,.wav,.aac,.ogg"
          multiple
          className="sr-only"
          onChange={(e) => stage(e.target.files)}
          disabled={working}
          aria-label={`${label} ${AUDIO_KIND_LABEL[kind]} 파일 선택`}
        />
        <Icon name="headphones" size={44} />
        <span className="text-sm font-bold text-ink">
          여기를 눌러 {label} {AUDIO_KIND_LABEL[kind]} 파일 선택 (여러 개 가능)
        </span>
        <span className="text-xs text-mist">파일명 숫자 순서로 배치한 뒤, 올리기 전에 강 칸을 고칠 수 있어요 · 파일당 50MB 이하</span>
      </label>

      {/* 올리기 전 확인 */}
      {pending && (
        <div className="rounded-xl2 border border-brand-200 bg-brand-50/40 p-3 sm:p-4">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <p className="text-sm font-black text-ink">
              {AUDIO_KIND_LABEL[kind]} {pending.length}개를 이렇게 넣습니다
            </p>
            <span className="ml-auto flex gap-1">
              <button type="button" onClick={() => void upload()} disabled={busy} className="btn-primary !px-3 !py-1.5 text-xs">
                {busy ? (progress ?? "올리는 중…") : "올리기"}
              </button>
              <button type="button" onClick={() => setPending(null)} disabled={busy} className="btn-ghost !px-3 !py-1.5 text-xs">
                취소
              </button>
            </span>
          </div>
          <ul className="space-y-1.5">
            {pending.map((p, i) => (
              <li key={`${p.file.name}-${i}`} className="grid gap-2 rounded-xl bg-paper p-2 sm:grid-cols-[1fr_7rem_9rem_2rem] sm:items-center">
                <p className="min-w-0 truncate text-xs text-slate">
                  <span className="font-bold text-ink">{p.file.name}</span> · {formatBytes(p.file.size)}
                </p>
                <select
                  value={p.day}
                  onChange={(e) => setPending(pending.map((x, j) => (j === i ? { ...x, day: Number(e.target.value) } : x)))}
                  className="input !py-1.5 text-xs"
                  aria-label={`${p.file.name} 강 칸`}
                >
                  {DAYS.map((d) => (
                    <option key={d} value={d}>
                      {lesson(d)}
                    </option>
                  ))}
                </select>
                <input
                  value={p.label}
                  onChange={(e) => setPending(pending.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                  placeholder="구분 이름 (선택)"
                  className="input !py-1.5 text-xs"
                  aria-label={`${p.file.name} 구분 이름`}
                />
                <button
                  type="button"
                  onClick={() => setPending(pending.filter((_, j) => j !== i))}
                  className="btn-ghost !px-2 !py-1 text-xs text-red-600 hover:!bg-red-50"
                  aria-label={`${p.file.name} 목록에서 빼기`}
                >
                  빼기
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-mist">같은 강에 파일을 여러 개 둘 수 있어요 (예: {lesson(3)} 에 교과서용·영국발음 두 개).</p>
        </div>
      )}

      {/* 강 1~9 */}
      <ul className="space-y-2">
        {DAYS.map((day) => {
          const list = byDay.get(day) ?? [];
          return (
            <li key={day} className={cn("rounded-xl2 border p-3 transition sm:p-4", list.length ? "border-line bg-paper" : "border-dashed border-line bg-surface")}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span
                  className={cn(
                    "inline-flex h-9 min-w-14 shrink-0 items-center justify-center rounded-full px-2 text-xs font-black tabular-nums",
                    list.length ? "bg-brand-500 text-white shadow-pink" : "bg-line/60 text-slate",
                  )}
                >
                  {lesson(day)}
                </span>
                {list.length === 0 && <p className="text-sm text-mist">아직 음원이 없어요.</p>}
                <label
                  className={cn(
                    "ml-auto cursor-pointer rounded-full px-3 py-1.5 text-xs font-bold transition",
                    list.length ? "bg-surface text-ink-soft ring-1 ring-line hover:text-brand-600" : "bg-brand-500 text-white shadow-pink hover:bg-brand-600",
                    working && "pointer-events-none opacity-60",
                  )}
                >
                  <input
                    type="file"
                    accept="audio/*,.mp3,.m4a,.wav,.aac,.ogg"
                    multiple
                    className="sr-only"
                    disabled={working}
                    aria-label={`${label} ${lesson(day)} ${AUDIO_KIND_LABEL[kind]} 추가`}
                    onChange={(e) => {
                      const files = [...(e.target.files ?? [])];
                      e.target.value = "";
                      if (!files.length) return;
                      reset();
                      setPending(files.map((file) => ({ file, day, label: "" })));
                    }}
                  />
                  파일 추가
                </label>
              </div>

              {list.length > 0 && (
                <ul className="mt-3 space-y-3">
                  {list.map((t) => (
                    <li key={t.id}>
                      <div className="mb-1.5 flex flex-wrap items-center gap-2">
                        <p className="min-w-0 flex-1 truncate text-xs text-slate">
                          <span className="font-bold text-ink">{t.file_name}</span> · {formatBytes(t.file_size)}
                        </p>
                        <input
                          defaultValue={t.label ?? ""}
                          placeholder="구분 이름"
                          className="input !w-36 !py-1 text-xs"
                          aria-label={`${t.file_name} 구분 이름`}
                          onBlur={async (e) => {
                            const next = e.target.value.trim();
                            if (next === (t.label ?? "")) return;
                            const res = await setTrackLabel(t.id, next);
                            if (res.ok) router.refresh();
                            else setError(res.error ?? "이름을 저장하지 못했어요.");
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            reset();
                            setConfirmId(t.id);
                          }}
                          disabled={working}
                          className="btn-ghost !px-3 !py-1 text-xs text-red-600 hover:!bg-red-50"
                        >
                          삭제
                        </button>
                      </div>
                      <AudioPlayer src={`/files/audio/${t.id}`} title={`${lesson(day)} ${t.label ?? ""}`.trim()} note={AUDIO_KIND_LABEL[kind]} />

                      {confirmId === t.id && (
                        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-red-200 bg-red-50/60 p-3 text-sm">
                          <Icon name="warning" size={20} />
                          <span className="text-ink">{t.file_name} 을(를) 삭제할까요? 파일도 함께 지워져요.</span>
                          <span className="ml-auto flex gap-1">
                            <button type="button" onClick={() => onDelete(t.id)} disabled={deleting} className="btn-dark !bg-red-600 !px-3 !py-1.5 text-xs hover:!bg-red-700">
                              {deleting ? "삭제 중…" : "삭제 확정"}
                            </button>
                            <button type="button" onClick={() => setConfirmId(null)} className="btn-ghost !px-3 !py-1.5 text-xs">
                              닫기
                            </button>
                          </span>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
      {done && <p className="text-sm font-semibold text-brand-600">{done}</p>}
    </div>
  );
}
