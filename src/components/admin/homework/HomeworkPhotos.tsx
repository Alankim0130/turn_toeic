"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { fitBox, stepIndex, swipeDirection } from "@/lib/photo-viewer";
import { cn } from "@/lib/utils";

export type HomeworkPhoto = { id: number; name: string };

/** 팝업에서 크게 볼 때 받는 폭 — 원본(장당 20MB)을 그대로 받으면 휴대폰에서 한 장마다 한참 기다린다 */
const VIEW_WIDTH = 1200;
/** 썸네일 폭 */
const THUMB_WIDTH = 400;

/** 화살표·닫기·회전 도형. 이모지를 쓰지 않고 버튼 색을 따라가도록 도형으로 그린다 (Reviews·AudioPlayer 와 같은 이유) */
function Glyph({ kind }: { kind: "back" | "next" | "close" | "rotate" }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn("h-5 w-5 fill-none stroke-current stroke-[2.5]", kind === "back" && "rotate-180")}>
      {kind === "close" ? (
        <path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" />
      ) : kind === "rotate" ? (
        <path d="M4 12a8 8 0 1 0 2.6-5.9M4 4.5V9h4.5" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="m9 5 7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}

/**
 * 숙제 사진 — **썸네일을 누르면 그 자리에서 크게 열리고 옆으로 넘긴다** (2026-09-22 Alan 요청:
 * "숙제 이미지를 클릭했을때 웹페이지가 열리는것처럼 열려서 다음 이미지 선택하기가 힘들어").
 *
 * 그전에는 썸네일이 `/files/homework/{id}` 로 나가는 **링크**여서 새 화면이 떴다 — 한 장 보고 뒤로 가서
 * 다음 장을 또 눌러야 했고, 제출 1건에 사진이 10장까지라 그 왕복이 그대로 열 번이었다.
 * 지금은 팝업 안에서 `n / N` · 화살표 · 손가락 넘기기 · 키보드 ← → 로 넘어간다 —
 * 수강후기 팝업(`Reviews`)과 같은 규칙이다 (ESC·배경·닫기로 닫고, 열려 있는 동안 뒤 화면 스크롤을 막는다).
 * 판정(넘기기·회전 칸·다음 장)은 `src/lib/photo-viewer.ts` 한곳이다.
 *
 * **첨삭 도구(핀·스탬프·필기·지우개)는 만들지 않았다** — 채점·첨삭은 "아직 논의되지 않음" 이고
 * 숙제는 점검완료 표시까지만이다. 보는 데 필요한 **회전**만 두었다 (교재를 손으로 찍으면 눕는 사진이 흔하다).
 * **점검완료 버튼도 팝업에 두지 않는다** — 카드의 `HomeworkCheckForm` 한곳에서만 한다.
 */
export function HomeworkPhotos({ photos, student, label, checkedNote }: { photos: HomeworkPhoto[]; student: string; label?: string | null; checkedNote?: string | null }) {
  const [open, setOpen] = useState<number | null>(null);
  if (photos.length === 0) return null;

  return (
    <>
      <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
        {photos.map((p, i) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => setOpen(i)}
              title={`${p.name} 크게 보기`}
              className="block w-full overflow-hidden rounded-xl border border-line bg-surface transition hover:border-brand-300"
            >
              {/* 비공개 서명 URL 로 리다이렉트되는 썸네일이라 next/image 최적화를 쓰지 않는다 */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/files/homework/${p.id}?w=${THUMB_WIDTH}`} alt={`${student} 숙제 사진 ${i + 1}`} loading="lazy" className="aspect-square w-full object-cover" />
            </button>
          </li>
        ))}
      </ul>

      {open !== null && <Viewer photos={photos} index={open} student={student} label={label} checkedNote={checkedNote} onMove={setOpen} onClose={() => setOpen(null)} />}
    </>
  );
}

function Viewer({
  photos,
  index,
  student,
  label,
  checkedNote,
  onMove,
  onClose,
}: {
  photos: HomeworkPhoto[];
  index: number;
  student: string;
  label?: string | null;
  checkedNote?: string | null;
  onMove: (i: number) => void;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  /**
   * 회전은 **보고 있는 장에 딸려 있다** — 넘기면 0도로 돌아간다 (다음 장은 이미 바로 서 있을 수 있다).
   * effect 로 되돌리면 한 번 더 그려지므로 어느 장의 값인지(`at`)를 같이 들고 그릴 때 판단한다.
   */
  const [turn, setTurn] = useState({ at: index, deg: 0 });
  const [box, setBox] = useState({ w: 0, h: 0 });
  // createPortal 은 document 가 있어야 한다 (Reviews 의 Lightbox 와 같은 방법)
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const photo = photos[index];
  const many = photos.length > 1;
  const deg = turn.at === index ? turn.deg : 0;

  const move = useCallback((dir: 1 | -1) => onMove(stepIndex(index, dir, photos.length)), [index, onMove, photos.length]);

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

  if (!mounted) return null;

  const fit = fitBox(box, deg);

  return createPortal(
    <div className="fixed inset-0 z-[70] flex flex-col p-3 sm:p-5">
      <div aria-hidden onClick={onClose} className="absolute inset-0 bg-ink/80 backdrop-blur-sm" />

      <div role="dialog" aria-modal="true" aria-label={`${student} 숙제 사진 ${index + 1} / ${photos.length}`} className="relative flex min-h-0 flex-1 flex-col">
        <div className="mb-2 flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-sm font-black text-white">
            {student}
            {label && <span className="ml-2 rounded-full bg-white/15 px-2 py-0.5 text-[0.7rem] font-bold">{label}</span>}
          </p>
          <p className="shrink-0 text-xs font-bold text-white/70" aria-hidden>
            {index + 1} / {photos.length}
          </p>
          <button
            type="button"
            onClick={() => setTurn({ at: index, deg: deg + 90 })}
            aria-label="사진 회전"
            title="사진 회전"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
          >
            <Glyph kind="rotate" />
          </button>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
          >
            <Glyph kind="close" />
          </button>
        </div>

        <div ref={boxRef} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} className="flex min-h-0 flex-1 items-center justify-center overflow-hidden">
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

        <div className="mt-2 flex items-center gap-2">
          <div className="min-w-0 flex-1 text-xs text-white/70">
            <p className="truncate">{checkedNote ?? photo.name}</p>
            {/* 작은 글씨를 더 키워 봐야 할 때의 길 — 팝업은 축소본(폭 {VIEW_WIDTH})을 보여 준다 */}
            <a href={`/files/homework/${photo.id}`} target="_blank" rel="noopener noreferrer" className="font-bold text-white/80 underline decoration-white/40 hover:text-white">
              원본 보기
            </a>
          </div>
          {many && (
            <div className="flex shrink-0 items-center gap-2">
              {(["back", "next"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => move(d === "next" ? 1 : -1)}
                  aria-label={d === "next" ? "다음 사진" : "이전 사진"}
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
                >
                  <Glyph kind={d} />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
