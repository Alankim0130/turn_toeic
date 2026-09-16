"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";

/**
 * 토익 LC 전용 음원 플레이어 (2026-09-16 Alan 요청).
 *  - 재생 · 일시정지 · 정지, 5초 뒤로/앞으로
 *  - 배속 0.5~2.0 (받아쓰기는 느리게, 복습은 빠르게)
 *  - 구간반복: A 를 찍고 B 를 찍으면 그 사이만 계속 돈다
 *
 * 파일은 재생을 누를 때 처음 받는다 (preload="none") — 학생 수가 많아 전송량을 아낀다.
 * 한 화면에서 여러 음원을 눌러도 동시에 울리지 않게, 재생을 시작하면 다른 플레이어는 멈춘다.
 */

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
const PLAY_EVENT = "lc-audio-play";

/**
 * 재생·일시정지·정지·반복 표시.
 * 힉스필드 PNG 아이콘(Icon) 대신 도형으로 그린다 — 22px 에서 또렷하고, 버튼 색이 바뀔 때
 * 글자색을 그대로 따라가야 하기 때문이다(PNG 는 invert 같은 편법이 필요하다). 이모지는 쓰지 않는다.
 * 나중에 힉스필드 아이콘으로 바꾸려면 이 컴포넌트만 교체하면 된다.
 */
function Glyph({ shape, size = 20 }: { shape: "play" | "pause" | "stop" | "repeat"; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", "aria-hidden": true, focusable: "false" as const };
  if (shape === "play")
    return (
      <svg {...common} fill="currentColor" style={{ width: size, height: size }}>
        <path d="M8.5 5.6c0-.9 1-1.5 1.8-1L18 11a1.2 1.2 0 0 1 0 2l-7.7 6.4c-.8.5-1.8-.1-1.8-1z" />
      </svg>
    );
  if (shape === "pause")
    return (
      <svg {...common} fill="currentColor" style={{ width: size, height: size }}>
        <rect x="7" y="5" width="3.6" height="14" rx="1.4" />
        <rect x="13.4" y="5" width="3.6" height="14" rx="1.4" />
      </svg>
    );
  if (shape === "stop")
    return (
      <svg {...common} fill="currentColor" style={{ width: size, height: size }}>
        <rect x="6.5" y="6.5" width="11" height="11" rx="2.4" />
      </svg>
    );
  return (
    <svg {...common} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: size, height: size }}>
      <path d="M4 9.5a4 4 0 0 1 4-4h8.5" />
      <path d="M14 3l2.8 2.5L14 8" />
      <path d="M20 14.5a4 4 0 0 1-4 4H7.5" />
      <path d="M10 21l-2.8-2.5L10 16" />
    </svg>
  );
}

const two = (n: number) => String(Math.floor(n)).padStart(2, "0");
export const formatTime = (s: number) => {
  if (!Number.isFinite(s) || s < 0) return "0:00";
  const total = Math.floor(s);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  return h > 0 ? `${h}:${two(m)}:${two(sec)}` : `${m}:${two(sec)}`;
};

export function AudioPlayer({ src, title, note, className }: { src: string; title: string; note?: string | null; className?: string }) {
  const id = useId();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRate] = useState(1);
  const [loop, setLoop] = useState<{ a: number; b: number | null } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const el = () => audioRef.current;

  /* 다른 플레이어가 시작하면 이 플레이어는 멈춘다 */
  useEffect(() => {
    const onOther = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== id) el()?.pause();
    };
    window.addEventListener(PLAY_EVENT, onOther);
    return () => window.removeEventListener(PLAY_EVENT, onOther);
  }, [id]);

  /* 배속은 오디오 요소에 바로 반영한다 */
  useEffect(() => {
    const a = el();
    if (a) a.playbackRate = rate;
  }, [rate]);

  const play = useCallback(async () => {
    const a = el();
    if (!a) return;
    setError(null);
    // preload="none" 이라 누르기 전에는 아무것도 받지 않는다 — 누른 뒤에만 "불러오는 중" 을 보여 준다
    if (!a.readyState) setLoading(true);
    window.dispatchEvent(new CustomEvent(PLAY_EVENT, { detail: id }));
    try {
      a.playbackRate = rate;
      await a.play();
    } catch {
      setLoading(false);
      setError("재생하지 못했어요. 잠시 뒤 다시 눌러 주세요.");
    }
  }, [id, rate]);

  const toggle = () => {
    const a = el();
    if (!a) return;
    if (a.paused) void play();
    else a.pause();
  };

  const stop = () => {
    const a = el();
    if (!a) return;
    a.pause();
    a.currentTime = 0;
    setTime(0);
  };

  const seekBy = (delta: number) => {
    const a = el();
    if (!a) return;
    a.currentTime = Math.min(Math.max(a.currentTime + delta, 0), a.duration || 0);
    setTime(a.currentTime);
  };

  const seekTo = (v: number) => {
    const a = el();
    if (!a) return;
    a.currentTime = v;
    setTime(v);
  };

  /* 구간반복: A → B 순서로 찍는다. 이미 다 찍혀 있으면 새 A 로 다시 시작 */
  const markLoop = () => {
    const a = el();
    if (!a) return;
    const t = a.currentTime;
    if (!loop || loop.b !== null) return setLoop({ a: t, b: null });
    if (t <= loop.a + 0.3) return; // 너무 짧은 구간은 무시 (무한 반복 방지)
    setLoop({ a: loop.a, b: t });
  };

  const loopReady = loop?.b != null;

  return (
    <div className={cn("rounded-xl2 border border-line bg-paper p-3 sm:p-4", className)}>
      <audio
        ref={audioRef}
        src={src}
        preload="none"
        onLoadedMetadata={(e) => {
          setDuration(e.currentTarget.duration || 0);
          e.currentTarget.playbackRate = rate;
        }}
        onCanPlay={() => setLoading(false)}
        onPlaying={() => setLoading(false)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setTime(0);
        }}
        onError={() => {
          setLoading(false);
          setError("음원을 불러오지 못했어요.");
        }}
        onTimeUpdate={(e) => {
          const a = e.currentTarget;
          if (loop && loop.b != null && a.currentTime >= loop.b) {
            a.currentTime = loop.a;
            setTime(loop.a);
            return;
          }
          setTime(a.currentTime);
        }}
      >
        브라우저가 음원 재생을 지원하지 않아요.
      </audio>

      {/* 제목 */}
      <div className="mb-2 flex min-w-0 items-center gap-2">
        <Icon name="headphones" size={18} />
        <p className="min-w-0 flex-1 truncate text-sm font-black text-ink">{title}</p>
        {note && <span className="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-bold text-brand-700">{note}</span>}
      </div>

      {/* 진행바 */}
      <div className="flex items-center gap-2">
        <span className="w-11 shrink-0 text-right text-xs font-bold tabular-nums text-slate">{formatTime(time)}</span>
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={Math.min(time, duration || 0)}
          onChange={(e) => seekTo(Number(e.target.value))}
          disabled={!duration}
          aria-label={`${title} 재생 위치`}
          className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-line accent-brand-500 disabled:cursor-default"
        />
        <span className="w-11 shrink-0 text-xs font-bold tabular-nums text-mist">{duration ? formatTime(duration) : "--:--"}</span>
      </div>

      {/* 구간반복 표시 */}
      {loop && (
        <p className="mt-1.5 text-[11px] font-bold text-brand-600">
          구간반복 {formatTime(loop.a)} ~ {loop.b != null ? formatTime(loop.b) : "끝 지점을 찍어 주세요"}
        </p>
      )}

      {/* 조작 */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? `${title} 일시정지` : `${title} 재생`}
          className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-brand-500 text-white shadow-pink transition hover:bg-brand-600"
        >
          <Glyph shape={playing ? "pause" : "play"} size={22} />
        </button>
        <button
          type="button"
          onClick={stop}
          aria-label={`${title} 정지`}
          className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-surface text-ink-soft ring-1 ring-line transition hover:text-brand-600"
        >
          <Glyph shape="stop" size={18} />
        </button>

        <button type="button" onClick={() => seekBy(-5)} className="btn-ghost !px-2.5 !py-2 text-xs font-bold" aria-label="5초 뒤로">
          -5초
        </button>
        <button type="button" onClick={() => seekBy(5)} className="btn-ghost !px-2.5 !py-2 text-xs font-bold" aria-label="5초 앞으로">
          +5초
        </button>

        {/* 구간반복 */}
        <button
          type="button"
          onClick={markLoop}
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-3 py-2 text-xs font-bold transition",
            loopReady ? "bg-brand-500 text-white shadow-pink" : loop ? "bg-brand-50 text-brand-700 ring-1 ring-brand-200" : "bg-surface text-ink-soft ring-1 ring-line hover:text-brand-600",
          )}
          aria-label={!loop ? "구간반복 시작 지점 찍기" : loop.b == null ? "구간반복 끝 지점 찍기" : "구간반복 다시 찍기"}
        >
          <Glyph shape="repeat" size={15} />
          {!loop ? "구간반복" : loop.b == null ? "끝 지점" : "다시 찍기"}
        </button>
        {loop && (
          <button type="button" onClick={() => setLoop(null)} className="btn-ghost !px-2.5 !py-2 text-xs font-bold text-red-600 hover:!bg-red-50">
            반복 해제
          </button>
        )}

        {/* 배속 */}
        <span className="ml-auto flex items-center gap-1 rounded-full bg-surface p-1 ring-1 ring-line">
          {RATES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRate(r)}
              aria-pressed={rate === r}
              aria-label={`재생 속도 ${r}배`}
              className={cn(
                "rounded-full px-2 py-1 text-[11px] font-black tabular-nums transition",
                rate === r ? "bg-brand-500 text-white" : "text-slate hover:text-brand-600",
              )}
            >
              {r}x
            </button>
          ))}
        </span>
      </div>

      {loading && <p className="mt-2 text-xs font-semibold text-mist">불러오는 중…</p>}
      {error && <p className="mt-2 text-xs font-semibold text-red-600">{error}</p>}
    </div>
  );
}
