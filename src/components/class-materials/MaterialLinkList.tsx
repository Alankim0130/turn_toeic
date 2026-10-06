"use client";

import { useId, useState } from "react";
import { linkTitle, shortLinkUrl, type MaterialLink } from "@/lib/class-materials";
import { linkKindLabel } from "@/lib/live-links";
import { youtubeEmbedSrc, youtubeThumb, youtubeVideo } from "@/lib/youtube-video";
import { cn } from "@/lib/utils";

/**
 * 수업자료실 자료에 붙은 링크 목록 (2026-10-06 Alan — "수업 자료실에 유튜브 링크를 한번씩 올릴 수도 있어 … 링크를 여러개 올릴 수 있도록").
 * 학생 화면(`ClassMaterialsView`)과 관리자 줄(`ClassMaterialRow`)이 함께 쓴다 — 파일 목록(`MaterialFileList`)과 같은 꼴.
 * - **유튜브 영상은 그 자리에서 튼다** (다시보기 · 랜딩 소개 영상과 같다). 처음에는 작은 그림 한 장만 받고, `보기` 를 누른 뒤에야
 *   youtube-nocookie 플레이어를 불러온다 — 누르지도 않은 학생에게 플레이어 수백 KB 와 쿠키를 심지 않는다. 한 목록에서 한 번에 하나만 튼다.
 *   `유튜브` 버튼은 유튜브 앱 · 새 창으로 — 강사가 퍼가기를 막아 둔 영상은 거기서 본다.
 * - 영상이 아닌 링크(재생목록 · 채널 · 블로그 · 구글 문서 …)는 `열기` 로 새 창.
 * - 주소는 `materialLinks` 를 거친 http(s) 뿐이다 (DB check 도 같다). 새 창은 `noopener noreferrer`.
 */
export function MaterialLinkList({ links, className }: { links: readonly MaterialLink[]; className?: string }) {
  const [playing, setPlaying] = useState<number | null>(null);
  // 그림을 못 받은 줄 — 영상이 지워졌거나 막혔다. 깨진 그림 대신 `유튜브` 글자 칩을 세운다
  const [noThumb, setNoThumb] = useState<ReadonlySet<number>>(() => new Set());
  const base = useId();

  return (
    <ul aria-label="링크" className={cn("divide-y divide-line overflow-hidden rounded-xl border border-line bg-paper", className)}>
      {links.map((link, k) => {
        const video = youtubeVideo(link.url);
        const title = linkTitle(link, k, links.length);
        const open = video !== null && playing === k;
        const playerId = `${base}-player-${k}`;
        const toggle = () => setPlaying(open ? null : k);
        return (
          <li key={`${k}-${link.url}`} className="px-3 py-2">
            {/* 이름 칸이 7rem 보다 좁아지면 버튼이 다음 줄 오른쪽으로 내려간다 (파일 목록과 같다 — 320px 에서 이름이 쪼개지지 않게) */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
              {video && !noThumb.has(k) ? (
                <button
                  type="button"
                  onClick={toggle}
                  aria-label={`${title} ${open ? "닫기" : "보기"}`}
                  aria-controls={playerId}
                  aria-expanded={open}
                  className="group relative h-9 w-16 shrink-0 overflow-hidden rounded-md bg-ink ring-1 ring-line"
                >
                  {/* 유튜브가 주는 그림이라 `Icon` 을 쓰지 않는다 (랜딩 소개 영상과 같은 이유 — next/image 는 외부 그림 변환에 과금된다) */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={youtubeThumb(video.id)}
                    alt=""
                    aria-hidden
                    loading="lazy"
                    onError={() => setNoThumb((prev) => new Set(prev).add(k))}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                  <span aria-hidden className="absolute inset-0 flex items-center justify-center bg-ink/25 transition group-hover:bg-ink/10">
                    <span className="flex size-5 items-center justify-center rounded-full bg-brand-500">
                      {/* 재생 삼각형은 도형으로 그린다 — 이모지를 쓰지 않는다 */}
                      <svg viewBox="0 0 24 24" className="ml-px size-3 fill-white">
                        <path d="M8 5.5v13a1 1 0 0 0 1.53.85l10.5-6.5a1 1 0 0 0 0-1.7L9.53 4.65A1 1 0 0 0 8 5.5Z" />
                      </svg>
                    </span>
                  </span>
                </button>
              ) : (
                <span className="shrink-0 rounded-md bg-brand-50 px-1.5 py-0.5 text-[10px] font-black text-brand-700">{linkKindLabel(link.url)}</span>
              )}
              <span className="min-w-0 flex-[1_1_7rem]">
                <span className="block text-sm leading-snug text-ink [overflow-wrap:anywhere]">{title}</span>
                <span className="block truncate text-xs text-mist">{shortLinkUrl(link.url)}</span>
              </span>
              <span className="ml-auto flex shrink-0 gap-1">
                {video && (
                  <button type="button" onClick={toggle} aria-controls={playerId} aria-expanded={open} className="btn-secondary !px-3 !py-1.5 text-xs">
                    {open ? "닫기" : "보기"}
                  </button>
                )}
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${title} ${video ? "유튜브에서 보기" : "새 창으로 열기"}`}
                  className="btn-secondary !px-3 !py-1.5 text-xs"
                >
                  {video ? "유튜브" : "열기"}
                  {/* 새 창 표시 — 사이트 밖으로 나간다는 것을 미리 보이게 (도형) */}
                  <svg viewBox="0 0 24 24" aria-hidden className="size-3 fill-none stroke-current" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
                  </svg>
                </a>
              </span>
            </div>
            {open && video && (
              <div id={playerId} className="relative mt-2 aspect-video overflow-hidden rounded-lg bg-ink">
                <iframe
                  src={youtubeEmbedSrc(video)}
                  title={title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                  className="absolute inset-0 h-full w-full border-0"
                />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
