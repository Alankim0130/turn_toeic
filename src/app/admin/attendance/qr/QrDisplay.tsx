"use client";

import { useEffect, useState } from "react";
import { getAttendanceQr, type QrFrame } from "../actions";

/** 칸 모양(0/1) → 네모 조각. 라이브러리 SVG 를 innerHTML 로 넣지 않고 React 로 그린다 */
function QrSvg({ size, cells }: { size: number; cells: string }) {
  const q = 4; // 조용한 여백 (규격상 4칸)
  const rects: string[] = [];
  for (let y = 0; y < size; y++) {
    let x = 0;
    while (x < size) {
      if (cells[y * size + x] === "1") {
        let w = 1;
        while (x + w < size && cells[y * size + x + w] === "1") w++;
        rects.push(`M${x + q} ${y + q}h${w}v1h-${w}z`);
        x += w;
      } else x++;
    }
  }
  return (
    <svg viewBox={`0 0 ${size + q * 2} ${size + q * 2}`} className="h-full w-full" role="img" aria-label="출석 QR 코드" shapeRendering="crispEdges">
      <rect width="100%" height="100%" fill="#fff" />
      <path d={rects.join("")} fill="#17121F" />
    </svg>
  );
}

/**
 * 교실에 띄우는 출석 QR (2026-09-21). 5초마다 새 칸을 받아 그린다 — 토큰은 30초마다 바뀌고 2분 동안 받는다.
 * 학생은 휴대폰 카메라로 찍거나 앱의 출석 화면에 아래 6자리를 친다.
 */
export function QrDisplay() {
  const [frame, setFrame] = useState<QrFrame | null>(null);
  const [left, setLeft] = useState(30);

  useEffect(() => {
    let alive = true;
    const pull = () =>
      getAttendanceQr()
        .then((f) => alive && setFrame(f))
        .catch(() => alive && setFrame({ error: "연결이 끊겼어요. 잠시 뒤 다시 받아요." }));
    pull();
    const t = setInterval(pull, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    if (!frame || "error" in frame) return;
    const tick = () => setLeft(Math.max(0, Math.round((new Date(frame.expiresAt).getTime() - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [frame]);

  if (!frame) return <p className="py-20 text-center text-lg text-slate">QR 을 준비하는 중이에요…</p>;
  if ("error" in frame) return <p className="py-20 text-center text-lg font-bold text-amber-800">{frame.error}</p>;

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="aspect-square w-full max-w-[min(80vw,70vh)] rounded-3xl bg-white p-3 shadow-xl ring-1 ring-line">
        <QrSvg size={frame.size} cells={frame.cells} />
      </div>
      <div className="text-center">
        <p className="text-sm font-bold text-slate">앱의 출석 화면에서 입력하는 코드</p>
        <p className="mt-1 text-6xl font-black tracking-[0.25em] text-ink tabular-nums sm:text-7xl">{frame.code}</p>
        <p className="mt-2 text-sm text-slate">{left}초 뒤 바뀌어요 · 들어올 때 한 번, 나갈 때 한 번</p>
      </div>
    </div>
  );
}
