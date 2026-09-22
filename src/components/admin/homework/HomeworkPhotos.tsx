"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fitBox, stepIndex, swipeDirection } from "@/lib/photo-viewer";
import { cn } from "@/lib/utils";

export type HomeworkPhoto = { id: number; name: string };

/** 크게 볼 때 받는 폭 — 원본(장당 20MB)을 그대로 받으면 휴대폰에서 한 장마다 한참 기다린다 */
const VIEW_WIDTH = 1200;
/** 아래 줄 썸네일 폭 */
const THUMB_WIDTH = 200;

/** 화살표·회전 도형. 이모지를 쓰지 않고 버튼 색을 따라가도록 도형으로 그린다 (Reviews·AudioPlayer 와 같은 이유) */
function Glyph({ kind }: { kind: "back" | "next" | "rotate" }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn("h-5 w-5 fill-none stroke-current stroke-[2.5]", kind === "back" && "rotate-180")}>
      {kind === "rotate" ? (
        <path d="M4 12a8 8 0 1 0 2.6-5.9M4 4.5V9h4.5" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="m9 5 7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}

/**
 * 숙제 사진 보기 — **제출 한 건 안에서 `n / N` 으로 넘겨 본다** (2026-09-22 Alan 요청:
 * "숙제 이미지를 클릭했을때 웹페이지가 열리는것처럼 열려서 다음 이미지 선택하기가 힘들어").
 *
 * 그전에는 썸네일이 `/files/homework/{id}` 로 나가는 **링크**여서 새 화면이 떴다 — 한 장 보고 뒤로 가서
 * 다음 장을 또 눌러야 했고, 제출 1건에 사진이 10장까지라 그 왕복이 그대로 열 번이었다.
 * 화살표 · 손가락 넘기기 · 키보드 ← → · 아래 썸네일 줄로 넘어간다.
 * 판정(넘기기·회전 칸·다음 장)은 `src/lib/photo-viewer.ts` 한곳이다.
 *
 * **이 컴포넌트는 팝업이 아니다** — `HomeworkDetail` 안에 얹혀 있다. ESC·뒤 화면 잠금은 그쪽이 맡는다
 * (팝업 안에 팝업을 겹치면 닫기가 어느 것을 닫는지 흐려진다).
 *
 * **첨삭 도구(핀·스탬프·필기·지우개)는 만들지 않았다** — 채점·첨삭은 "아직 논의되지 않음" 이고
 * 숙제는 점검완료 표시까지만이다. 보는 데 필요한 **회전**만 두었다 (교재를 손으로 찍으면 눕는 사진이 흔하다).
 */
export function HomeworkPhotos({ photos, student }: { photos: HomeworkPhoto[]; student: string }) {
  const [index, setIndex] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  /**
   * 회전은 **보고 있는 장에 딸려 있다** — 넘기면 0도로 돌아간다 (다음 장은 이미 바로 서 있을 수 있다).
   * effect 로 되돌리면 한 번 더 그려지므로 어느 장의 값인지(`at`)를 같이 들고 그릴 때 판단한다.
   */
  const [turn, setTurn] = useState({ at: 0, deg: 0 });
  const [box, setBox] = useState({ w: 0, h: 0 });

  const many = photos.length > 1;
  const move = useCallback((dir: 1 | -1) => setIndex((i) => stepIndex(i, dir, photos.length)), [photos.length]);

  useEffect(() => {
    if (!many) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") move(1);
      else if (e.key === "ArrowLeft") move(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [many, move]);

  // 회전 칸을 맞바꾸려면 담는 칸의 실제 크기가 필요하다 (화면을 돌리면 다시 잰다)
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const read = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /**
   * 손가락으로 옆으로 밀면 넘어간다. **`preventDefault` 를 쓰지 않는다** — 세로로 훑으려던 손짓을
   * 넘기기로 잘못 읽으면 보던 사진이 제멋대로 바뀐다 (`PullToRefresh` 와 같은 규칙).
   * 가로가 세로보다 확실히 클 때만 넘긴다 — 판정은 `swipeDirection`.
   */
  const touch = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    touch.current = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touch.current;
    touch.current = null;
    if (!start || !many) return;
    const dir = swipeDirection(e.changedTouches[0].clientX - start.x, e.changedTouches[0].clientY - start.y);
    if (dir) move(dir);
  };

  if (photos.length === 0) return <p className="rounded-xl2 bg-surface px-4 py-6 text-center text-sm text-mist">올린 사진이 없어요.</p>;

  const photo = photos[index];
  const deg = turn.at === index ? turn.deg : 0;
  const fit = fitBox(box, deg);

  return (
    <div>
      <div className="relative overflow-hidden rounded-xl2 bg-ink">
        <div ref={boxRef} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} className="flex h-[42vh] min-h-56 items-center justify-center sm:h-[46vh]">
          {/* 비공개 서명 URL 이라 next/image 최적화를 쓰지 않는다.
              `key` 를 주어 장을 넘길 때 이전 그림이 남아 있지 않게 한다 */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={photo.id}
            src={`/files/homework/${photo.id}?w=${VIEW_WIDTH}`}
            alt={`${student} 숙제 사진 ${index + 1}`}
            style={{ ...(fit ?? {}), transform: `rotate(${deg}deg)` }}
            className={cn("h-auto w-auto object-contain", !fit && "max-h-full max-w-full")}
          />
        </div>

        {many && (
          <>
            {(["back", "next"] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => move(d === "next" ? 1 : -1)}
                aria-label={d === "next" ? "다음 사진" : "이전 사진"}
                className={cn(
                  "absolute top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition hover:bg-white/30",
                  d === "back" ? "left-2" : "right-2",
                )}
              >
                <Glyph kind={d} />
              </button>
            ))}
            <p className="absolute left-1/2 top-2 -translate-x-1/2 rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-bold text-white backdrop-blur tabular-nums" aria-hidden>
              {index + 1} / {photos.length}
            </p>
          </>
        )}

        <button
          type="button"
          onClick={() => setTurn({ at: index, deg: deg + 90 })}
          aria-label="사진 회전"
          title="사진 회전"
          className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition hover:bg-white/30"
        >
          <Glyph kind="rotate" />
        </button>
      </div>

      <div className="mt-2 flex items-center gap-2">
        {many && (
          <ul className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
            {photos.map((p, i) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setIndex(i)}
                  aria-label={`${i + 1}번째 사진`}
                  aria-current={i === index}
                  className={cn("block overflow-hidden rounded-lg border-2 transition", i === index ? "border-brand-500" : "border-transparent opacity-60 hover:opacity-100")}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/files/homework/${p.id}?w=${THUMB_WIDTH}`} alt="" loading="lazy" className="size-12 object-cover" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {/* 작은 글씨를 더 키워 봐야 할 때의 길 — 위 그림은 축소본(폭 1200)이다 */}
        <a
          href={`/files/homework/${photo.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto shrink-0 text-xs font-bold text-ink-soft underline decoration-brand-200 hover:text-brand-600"
        >
          원본 보기
        </a>
      </div>
    </div>
  );
}
