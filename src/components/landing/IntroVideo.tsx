"use client";

import { useState } from "react";
import { Reveal } from "@/components/ui/Reveal";
import { site } from "@/lib/site";

/**
 * 랜딩 초반의 소개 영상 (2026-09-17 Alan 제공). 영상 id 는 `site.introVideo` 한곳.
 *
 * **처음에는 썸네일 한 장만 받고, 누른 뒤에야 유튜브를 불러온다.**
 * 유튜브 플레이어는 누르지도 않은 방문자에게 수백 KB 와 추적 쿠키를 심는다 —
 * 방학에 학생이 600명이라 전송량을 아끼는 다른 화면들(LC 음원 `preload="none"`)과 같은 생각이다.
 * 불러올 때도 `youtube-nocookie.com` 을 쓴다.
 */
export function IntroVideo() {
  const { id, label } = site.introVideo;
  const [playing, setPlaying] = useState(false);
  // maxresdefault 는 **없는 영상이 있는데 404 가 아니라 120×90 회색 이미지가 200 으로 온다.**
  // 그래서 `onError` 로는 못 잡고 실제로 받은 가로폭을 보고 hqdefault(늘 있다)로 내려간다
  const [thumb, setThumb] = useState(`https://i.ytimg.com/vi/${id}/maxresdefault.jpg`);
  // 아예 못 받으면 그림을 치운다 — 브라우저가 그리는 깨진 이미지 아이콘이 남는다.
  // 그래도 검은 바탕에 분홍 재생 버튼이라 누를 곳은 그대로 보인다
  const [broken, setBroken] = useState(false);

  return (
    <section aria-labelledby="intro-video-title" className="container-x py-16">
      <Reveal className="mx-auto max-w-2xl text-center">
        <p className="chip">소개 영상</p>
        <h2 id="intro-video-title" className="mt-4 text-3xl font-black tracking-tight text-ink sm:text-4xl">
          역전토익이 어떤 곳인지
          <br />
          <span className="text-gradient-brand">영상으로 먼저 만나 보세요</span>
        </h2>
      </Reveal>

      <Reveal delay={80} className="mx-auto mt-8 max-w-4xl">
        <div className="relative aspect-video overflow-hidden rounded-xl2 bg-ink shadow-pink ring-1 ring-brand-200">
          {playing ? (
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1&playsinline=1`}
              title={label}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
              className="absolute inset-0 h-full w-full border-0"
            />
          ) : (
            <button
              type="button"
              onClick={() => setPlaying(true)}
              aria-label={`${label} 재생`}
              className="group absolute inset-0 h-full w-full cursor-pointer"
            >
              {/* 썸네일은 유튜브가 주는 그림이라 `Icon` 을 쓰지 않는다. 늘어나지 않게 크기를 CSS 로 못박는다.
                  `next/image` 를 쓰지 않는 이유: 외부 도메인을 태우면 Vercel 이미지 최적화에 과금되는데
                  유튜브 썸네일은 이미 최적화된 JPEG 한 장이라 얻을 게 없고, 아래 naturalWidth 검사도 못 한다 */}
              {!broken && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={thumb}
                  alt=""
                  aria-hidden
                  loading="lazy"
                  onLoad={(e) => {
                    if (e.currentTarget.naturalWidth <= 120) setThumb(`https://i.ytimg.com/vi/${id}/hqdefault.jpg`);
                  }}
                  onError={() => setBroken(true)}
                  className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                />
              )}
              <span aria-hidden className="absolute inset-0 bg-ink/15 transition group-hover:bg-ink/5" />
              <span
                aria-hidden
                className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-brand-500 shadow-pink transition duration-300 group-hover:scale-110 group-hover:bg-brand-600 sm:h-20 sm:w-20"
              >
                {/* 재생 삼각형은 도형으로 그린다 — 이모지를 쓰지 않고, 작은 크기에서도 또렷하다 */}
                <svg viewBox="0 0 24 24" className="ml-1 h-7 w-7 fill-white sm:h-9 sm:w-9">
                  <path d="M8 5.5v13a1 1 0 0 0 1.53.85l10.5-6.5a1 1 0 0 0 0-1.7L9.53 4.65A1 1 0 0 0 8 5.5Z" />
                </svg>
              </span>
            </button>
          )}
        </div>
      </Reveal>
    </section>
  );
}
