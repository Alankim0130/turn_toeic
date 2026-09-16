"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteAudioTrack, setAudioTracks } from "@/app/admin/lc-audio/actions";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/lib/study";
import { contentTypeOf, isAudioType, MB, objectName, type UploadedFile } from "@/lib/upload";
import { removeUploaded, uploadFile } from "@/lib/upload-client";
import { DAYS, dayLabel, sortByName } from "@/lib/lc-audio";

const BUCKET = "lc-audio";
const MAX = 50 * MB;

export type AudioDayTrack = { id: number; day: number; file_name: string; file_size: number | null };

/** 관리자: 교재 한 권의 Day 1~9 음원 — 빈 칸 채우기 · 파일 바꾸기 · 지우기 */
export function AudioDays({ bookId, label, tracks }: { bookId: number; label: string; tracks: AudioDayTrack[] }) {
  const router = useRouter();
  const bulkRef = useRef<HTMLInputElement>(null);
  const [busyDays, setBusyDays] = useState<number[]>([]);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [confirmDay, setConfirmDay] = useState<number | null>(null);
  const [deleting, startDelete] = useTransition();

  const byDay = new Map(tracks.map((t) => [t.day, t]));
  const freeDays = DAYS.filter((d) => !byDay.has(d));
  const busy = busyDays.length > 0 || deleting;

  /** 고른 파일을 Day 칸에 올린다. 그 Day 에 이미 있으면 파일이 바뀐다 */
  async function send(items: { day: number; file: File }[]) {
    setError(null);
    setDone(null);
    const bad = items.find((i) => !isAudioType(contentTypeOf(i.file)));
    if (bad) return setError(`${bad.file.name}: 음원 파일(mp3 · m4a · wav 등)만 올릴 수 있어요.`);
    const big = items.find((i) => i.file.size > MAX);
    if (big) return setError(`${big.file.name}: 50MB 이하 파일만 올릴 수 있어요.`);

    setBusyDays(items.map((i) => i.day));
    const uploaded: { day: number; file: UploadedFile }[] = [];
    try {
      for (let i = 0; i < items.length; i++) {
        setProgress(items.length > 1 ? `${i + 1} / ${items.length} 업로드 중…` : "업로드 중…");
        uploaded.push({ day: items[i].day, file: await uploadFile(BUCKET, `${bookId}/${objectName(items[i].file)}`, items[i].file) });
      }
      setProgress("목록에 등록 중…");
      const res = await setAudioTracks({ bookId, tracks: uploaded });
      if (!res.ok) {
        await removeUploaded(BUCKET, uploaded.map((u) => u.file.path));
        setError(res.error ?? "등록하지 못했어요.");
        return;
      }
      if (bulkRef.current) bulkRef.current.value = "";
      setDone(items.length > 1 ? `음원 ${res.count}개를 올렸어요.` : `${dayLabel(items[0].day)} 음원을 올렸어요.`);
      router.refresh();
    } catch (e) {
      await removeUploaded(BUCKET, uploaded.map((u) => u.file.path));
      setError(e instanceof Error ? e.message : "업로드하지 못했어요.");
    } finally {
      setBusyDays([]);
      setProgress(null);
    }
  }

  /** 여러 개를 한 번에 고르면 파일명 숫자 순서로 빈 Day 칸부터 채운다 */
  function bulk(list: FileList | null) {
    setError(null);
    setDone(null);
    const files = sortByName([...(list ?? [])]);
    if (files.length === 0) return;
    if (freeDays.length === 0) return setError("빈 Day 칸이 없어요. 바꾸려면 각 Day 의 “바꾸기”를 눌러 주세요.");
    if (files.length > freeDays.length) return setError(`빈 Day 칸은 ${freeDays.length}개인데 파일은 ${files.length}개예요. 파일을 줄이거나 먼저 지워 주세요.`);
    void send(files.map((file, i) => ({ day: freeDays[i], file })));
  }

  const onDelete = (track: AudioDayTrack) =>
    startDelete(async () => {
      const res = await deleteAudioTrack(track.id);
      setConfirmDay(null);
      if (res.ok) router.refresh();
      else setError(res.error ?? "삭제하지 못했어요.");
    });

  return (
    <div className="space-y-4">
      {/* 여러 개 한 번에 */}
      <label
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl2 border-2 border-dashed p-6 text-center transition",
          "border-line bg-paper hover:border-brand-300 hover:bg-brand-50/50",
          (busy || freeDays.length === 0) && "pointer-events-none opacity-60",
        )}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          bulk(e.dataTransfer.files);
        }}
      >
        <input
          ref={bulkRef}
          type="file"
          accept="audio/*,.mp3,.m4a,.wav,.aac,.ogg"
          multiple
          className="sr-only"
          onChange={(e) => bulk(e.target.files)}
          disabled={busy || freeDays.length === 0}
          aria-label={`${label} 음원 여러 개 선택`}
        />
        <Icon name="headphones" size={44} />
        <span className="text-sm font-bold text-ink">
          {freeDays.length === 0 ? `${label} Day 1~9 가 모두 찼어요` : `여기를 눌러 ${label} 음원 파일 선택 (여러 개 가능)`}
        </span>
        <span className="text-xs text-mist">
          {freeDays.length === 0
            ? "바꾸려면 아래 Day 칸의 “바꾸기”를 눌러 주세요"
            : `파일명 숫자 순서대로 빈 칸(${freeDays.map(dayLabel).join(" · ")})을 채워요 · mp3 · m4a · wav, 파일당 50MB 이하`}
        </span>
      </label>

      {/* Day 1~9 */}
      <ul className="space-y-2">
        {DAYS.map((day) => {
          const track = byDay.get(day);
          const dayBusy = busyDays.includes(day);
          return (
            <li key={day} className={cn("rounded-xl2 border p-3 transition sm:p-4", track ? "border-line bg-paper" : "border-dashed border-line bg-surface")}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span
                  className={cn(
                    "inline-flex h-9 w-14 shrink-0 items-center justify-center rounded-full text-xs font-black tabular-nums",
                    track ? "bg-brand-500 text-white shadow-pink" : "bg-line/60 text-slate",
                  )}
                >
                  {dayLabel(day)}
                </span>
                {/* 좁은 화면에서는 파일명이 Day·버튼 아래 한 줄을 차지한다 */}
                <div className="order-last w-full min-w-0 sm:order-none sm:w-auto sm:flex-1">
                  {track ? (
                    <p className="truncate text-sm text-slate">
                      <span className="font-bold text-ink">{track.file_name}</span> · {formatBytes(track.file_size)}
                    </p>
                  ) : (
                    <p className="text-sm text-mist">{dayBusy ? (progress ?? "올리는 중…") : "아직 음원이 없어요."}</p>
                  )}
                </div>
                <span className="flex shrink-0 gap-1">
                  <label
                    className={cn(
                      "cursor-pointer rounded-full px-3 py-1.5 text-xs font-bold transition",
                      track ? "bg-surface text-ink-soft ring-1 ring-line hover:text-brand-600" : "bg-brand-500 text-white shadow-pink hover:bg-brand-600",
                      busy && "pointer-events-none opacity-60",
                    )}
                  >
                    <input
                      type="file"
                      accept="audio/*,.mp3,.m4a,.wav,.aac,.ogg"
                      className="sr-only"
                      disabled={busy}
                      aria-label={`${label} ${dayLabel(day)} 음원 ${track ? "바꾸기" : "올리기"}`}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (file) void send([{ day, file }]);
                      }}
                    />
                    {dayBusy ? "올리는 중…" : track ? "바꾸기" : "음원 올리기"}
                  </label>
                  {track && (
                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setConfirmDay(day);
                      }}
                      disabled={busy}
                      className="btn-ghost !px-3 !py-1.5 text-xs text-red-600 hover:!bg-red-50"
                    >
                      삭제
                    </button>
                  )}
                </span>
              </div>

              {track && (
                <audio controls preload="none" src={`/files/audio/${track.id}`} className="mt-3 w-full">
                  브라우저가 음원 재생을 지원하지 않아요.
                </audio>
              )}

              {track && confirmDay === day && (
                <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-red-200 bg-red-50/60 p-3 text-sm">
                  <Icon name="warning" size={20} />
                  <span className="text-ink">{dayLabel(day)} 음원을 삭제할까요? 파일도 함께 지워져요.</span>
                  <span className="ml-auto flex gap-1">
                    <button type="button" onClick={() => onDelete(track)} disabled={deleting} className="btn-dark !bg-red-600 !px-3 !py-1.5 text-xs hover:!bg-red-700">
                      {deleting ? "삭제 중…" : "삭제 확정"}
                    </button>
                    <button type="button" onClick={() => setConfirmDay(null)} className="btn-ghost !px-3 !py-1.5 text-xs">
                      닫기
                    </button>
                  </span>
                </div>
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
