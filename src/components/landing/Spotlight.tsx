"use client";

import { useEffect, useState } from "react";

/**
 * 히어로 아래 헤드라인 띠 — **한 문구씩** 크게 확 들어와서 빛줄기가 스치고, 흐려지며 다음 문구로 넘어간다
 * (2026-09-17 Alan — 흐르는 띠(marquee)가 "너무 클로드 디자인 표시가 나", "한 문구씩 나왔다가 반짝이면서 바뀌는 걸로. 마블 느낌").
 * 마블 인트로처럼: 굵은 흰 글자 + 브랜드 분홍 바탕 + 글자 위를 지나는 광택(`.spot-shine`) + 띠를 가로지르는 빛줄기(`.spot-beam`) + 작은 반짝이(`.spot-glint`, CSS 도형).
 * 문구는 `WORDS` 한곳. 장식이라 `aria-hidden`. 움직임 줄이기면 페이드만 한다 (globals.css).
 */
const WORDS = [
  "귀에 꽂히는 압도적인 전달력",
  "YBM서면 전체 1위",
  "족집게식 핵심 학습",
  "최신 경향 실시간 반영",
  "현장 강의 + 불라방",
  "650 · 750 · 850 목표반",
  "이혜영 LC · 이영수 RC",
  "누적 후기 7,356건",
];

const HOLD = 2400; // 문구가 서 있는 시간 — 들어오기 0.5초 + 빛 스침 1.1초가 이 안에 든다
const OUT = 360; // 흐려지며 나가는 시간 (`spot-out` 과 같아야 한다)

export function Spotlight() {
  const [index, setIndex] = useState(0);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    let out = 0;
    const cycle = window.setInterval(() => {
      setLeaving(true);
      out = window.setTimeout(() => {
        setIndex((i) => (i + 1) % WORDS.length);
        setLeaving(false);
      }, OUT);
    }, HOLD + OUT);
    return () => {
      window.clearInterval(cycle);
      window.clearTimeout(out);
    };
  }, []);

  return (
    <div className="spotlight relative overflow-hidden border-y border-brand-200/60 bg-brand-500 text-white" aria-hidden>
      {/* 가운데가 은은히 밝은 바탕 — 무대 조명 */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_160%_at_50%_50%,rgba(255,255,255,0.16),transparent_70%)]" />
      {/* key 로 문구마다 애니메이션을 처음부터 다시 튼다 */}
      <span key={`beam-${index}`} className="spot-beam" />
      <div className="container-x flex h-16 items-center justify-center sm:h-20">
        <div key={index} className="spot-word relative" data-leaving={leaving || undefined}>
          <span className="spot-shine block whitespace-nowrap text-lg font-black tracking-tight min-[400px]:text-xl sm:text-3xl">{WORDS[index]}</span>
          <i className="spot-glint" style={{ left: "-7%", top: "-18%", animationDelay: "0.7s" }} />
          <i className="spot-glint" style={{ right: "-6%", top: "50%", width: 10, height: 10, animationDelay: "1.0s" }} />
          <i className="spot-glint" style={{ left: "40%", bottom: "-30%", width: 8, height: 8, animationDelay: "1.25s" }} />
        </div>
      </div>
    </div>
  );
}
