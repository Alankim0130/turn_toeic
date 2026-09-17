"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { Reveal } from "@/components/ui/Reveal";
import { site } from "@/lib/site";
import { cn } from "@/lib/utils";

const REVIEWS = site.reviews;

/** 화살표 도형. 이모지를 쓰지 않고 버튼 색을 따라가도록 도형으로 그린다 (AudioPlayer 의 Glyph 와 같은 이유) */
function Chevron({ back }: { back?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn("h-5 w-5 fill-none stroke-current stroke-[2.5]", back && "rotate-180")}>
      <path d="m9 5 7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * 실제 수강후기 캡쳐 (2026-09-17 Alan 제공).
 *
 * YBM 공식 수강후기 화면을 그대로 찍은 그림이라 **본문을 옮겨 적지 않는다** — 캡쳐가 원문이고,
 * 카드 겉면에는 제목·강좌·작성자·날짜만 둔다 (`site.reviews`). 자동 수집은 아직 안 한다 (미확정 8).
 *
 * 카드는 **옆으로 넘겨 보고**(스크롤 스냅), 누르면 **전체가 팝업으로 열린다** — 캡쳐가 세로로 길어
 * 카드 안에서는 윗부분만 보이기 때문이다. 팝업 안에서는 ← → 로 다음 후기로 넘어간다.
 */
export function Reviews() {
  const [open, setOpen] = useState<number | null>(null);
  const trackRef = useRef<HTMLUListElement>(null);

  /** 카드 한 장 폭만큼 옆으로 */
  const slide = (dir: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * ((el.firstElementChild?.clientWidth ?? 280) + 16), behavior: "smooth" });
  };

  return (
    <section aria-labelledby="reviews-title" className="py-16">
      <Reveal className="container-x mx-auto max-w-2xl text-center">
        <p className="chip">수강 후기</p>
        <h2 id="reviews-title" className="mt-4 text-3xl font-black tracking-tight text-ink sm:text-4xl">
          먼저 다녀간 수강생들이
          <br />
          <span className="text-gradient-brand">직접 남긴 이야기</span>
        </h2>
        <p className="mt-3 text-sm text-slate">학생들이 보내 준 메시지와 YBM 공식 홈페이지 후기예요. 눌러서 전체를 볼 수 있어요.</p>
      </Reveal>

      <Reveal delay={80} className="relative mt-8">
        {/* 좌우 버튼은 넉넉한 화면에서만 — 좁은 화면은 손으로 넘긴다 */}
        {(["back", "next"] as const).map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => slide(d === "next" ? 1 : -1)}
            aria-label={d === "next" ? "다음 후기" : "이전 후기"}
            className={cn(
              "absolute top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-paper text-ink-soft shadow-soft ring-1 ring-line transition hover:text-brand-600 hover:ring-brand-300 lg:flex",
              d === "next" ? "right-4" : "left-4",
            )}
          >
            <Chevron back={d === "back"} />
          </button>
        ))}

        <ul
          ref={trackRef}
          className="flex snap-x snap-mandatory gap-4 overflow-x-auto px-[max(1rem,calc((100vw-72rem)/2))] pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {REVIEWS.map((r, i) => (
            <li key={r.src} className="w-[76%] shrink-0 snap-center sm:w-64 lg:w-80">
              <button
                type="button"
                onClick={() => setOpen(i)}
                aria-label={`후기 전체 보기 — ${r.title}`}
                className="group card h-full w-full overflow-hidden p-0 text-left transition hover:-translate-y-1 hover:border-brand-300 hover:shadow-pink"
              >
                <span className="relative block h-72 overflow-hidden bg-surface">
                  {/* 로컬 WebP 는 이미 줄여 두었다 — `unoptimized` 로 Vercel 이미지 변환(과금)을 타지 않는다 */}
                  <Image
                    src={r.src}
                    alt={`${r.title} — ${r.badge} 수강 후기`}
                    width={r.w}
                    height={r.h}
                    unoptimized
                    className="h-full w-full object-cover object-top transition duration-500 group-hover:scale-[1.03]"
                  />
                  <span aria-hidden className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-paper to-transparent" />
                </span>
                {/* YBM 후기는 캡쳐 맨 위에 제목이 이미 있어 캡션에 또 적지 않는다.
                    카톡은 제목이 없으므로 한 줄 요약을 적는다 — 어느 쪽이든 `alt` 와 팝업에는 제목이 남는다 */}
                <span className="block p-4">
                  <span
                    className={cn(
                      "inline-flex rounded-full px-2.5 py-1 text-[0.7rem] font-black",
                      // 카톡은 점수라 진한 분홍으로 눈에 띄게, YBM 강좌명은 연분홍
                      r.kind === "kakao" ? "bg-brand-500 text-white" : "bg-brand-50 text-brand-700",
                    )}
                  >
                    {r.badge}
                  </span>
                  {r.kind === "kakao" && <span className="mt-2 block line-clamp-2 font-black leading-snug text-ink">{r.title}</span>}
                  <span className="mt-2 flex items-center gap-2 text-xs text-mist">
                    <span className="min-w-0 flex-1 truncate">{r.meta}</span>
                    <span className="shrink-0 font-black text-brand-600 transition group-hover:translate-x-0.5">전체 보기 ›</span>
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Reveal>

      {open !== null && <Lightbox index={open} onClose={() => setOpen(null)} onMove={(i) => setOpen(i)} />}
    </section>
  );
}

/** 후기 전체를 띄우는 팝업. 캡쳐가 세로로 길어 안에서 스크롤한다 */
function Lightbox({ index, onClose, onMove }: { index: number; onClose: () => void; onMove: (i: number) => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  // createPortal 은 document 가 있어야 한다. 서버에서는 false, 화면에 붙은 뒤 true
  // (effect 안에서 setState 를 하지 않으려고 useSyncExternalStore 를 쓴다 — RefreshButton 과 같은 방법)
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const r = REVIEWS[index];

  const move = useCallback(
    (dir: 1 | -1) => onMove((index + dir + REVIEWS.length) % REVIEWS.length),
    [index, onMove],
  );

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") move(1);
      else if (e.key === "ArrowLeft") move(-1);
    };
    window.addEventListener("keydown", onKey);
    // 뒤 화면이 같이 움직이면 어지럽다
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose, move]);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-6">
      <div aria-hidden onClick={onClose} className="absolute inset-0 bg-ink/70 backdrop-blur-sm" />

      <div role="dialog" aria-modal="true" aria-label={`${r.title} 후기 전체`} className="relative flex max-h-full w-full max-w-lg flex-col">
        <div className="mb-2 flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-sm font-black text-white">
            <span className="mr-2 rounded-full bg-white/15 px-2 py-0.5 text-[0.7rem]">{r.badge}</span>
            {r.title}
          </p>
          <p className="shrink-0 text-xs font-bold text-white/70">
            {index + 1} / {REVIEWS.length}
          </p>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
          >
            <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5 fill-none stroke-current stroke-[2.5]">
              <path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* 캡쳐 전체. 세로로 길어 여기서 스크롤한다.
            **원본 폭보다 크게 늘리지 않는다** — 카톡 캡쳐는 309~434px 뿐이라 늘리면 글자가 뭉개진다 */}
        <div className="flex min-h-0 flex-1 justify-center overflow-y-auto overscroll-contain rounded-xl2 bg-paper">
          <Image
            src={r.src}
            alt={`${r.title} — ${r.badge} 수강 후기 전체`}
            width={r.w}
            height={r.h}
            unoptimized
            style={{ maxWidth: r.w }}
            className="h-auto w-full"
          />
        </div>

        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="min-w-0 truncate text-xs text-white/70">
            {r.meta}
          </p>
          <div className="flex shrink-0 gap-2">
            {(["back", "next"] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => move(d === "next" ? 1 : -1)}
                aria-label={d === "next" ? "다음 후기" : "이전 후기"}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
              >
                <Chevron back={d === "back"} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
