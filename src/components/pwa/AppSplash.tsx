"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

const SESSION_KEY = "turn-toeic:splash-shown";
/** 영상(약 2.7초)이 안 불러와지거나 끝 신호가 안 와도 이 시간 뒤엔 반드시 걷는다 */
const MAX_MS = 3400;
/** 이번 세션에 이미 봤으면 하이드레이션 전에 CSS 로 감춘다 (globals.css 의 html[data-splash-seen]) */
const SEEN_SCRIPT = `try{if(sessionStorage.getItem(${JSON.stringify(SESSION_KEY)})==="1")document.documentElement.setAttribute("data-splash-seen","")}catch(e){}`;

type Mode = "boot" | "skip" | "portrait" | "landscape";
const noopSubscribe = () => () => {};
let mode: Mode | null = null;
/** 이 실행에서 스플래시를 틀지 한 번만 판정한다 (마운트 뒤 클라이언트에서만) */
function getMode(): Mode {
  if (mode) return mode;
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const preview = new URLSearchParams(window.location.search).get("splash") === "1";
  let seen = false;
  try {
    seen = sessionStorage.getItem(SESSION_KEY) === "1";
  } catch {}
  if ((!standalone && !preview) || (seen && !preview)) mode = "skip";
  else mode = window.matchMedia("(orientation: portrait)").matches ? "portrait" : "landscape";
  return mode;
}

/**
 * 홈 화면 앱으로 실행할 때 첫 화면에 한 번 나오는 브랜드 인트로 (핑크 → 흰 화면으로 뒤집히며 로고·"인생 역전 시켜줄게").
 * - CSS 가 먼저 그린다: `@media (display-mode: standalone)` 에서만 보이므로 앱이 하이드레이션되기 전에도 화면이 비지 않고,
 *   OS 첫 화면(핑크 + 흰 화살표)에서 그대로 이어진다. 브라우저 탭에서는 아예 렌더되지 않는다 (`?splash=1` 로 미리보기만 가능)
 * - 앱을 켜는 동안(세션) 한 번만. 백그라운드에서 돌아와도 다시 틀지 않는다
 * - 소리 없음 (자동재생 조건), 탭하면 건너뜀, 움직임 줄이기 설정이면 끝 장면만 잠깐
 */
export function AppSplash() {
  const current = useSyncExternalStore(noopSubscribe, getMode, () => "boot" as Mode);
  const [leaving, setLeaving] = useState(false);
  const [done, setDone] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const playing = current === "portrait" || current === "landscape";

  useEffect(() => {
    if (!playing) return;
    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {}
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => setLeaving(true), reduce ? 900 : MAX_MS);
    if (!reduce) videoRef.current?.play().catch(() => {});
    return () => window.clearTimeout(timer);
  }, [playing]);

  useEffect(() => {
    if (!leaving) return;
    const t = window.setTimeout(() => setDone(true), 380);
    return () => window.clearTimeout(t);
  }, [leaving]);

  if (current === "skip" || done) return null;
  const src = current === "landscape" ? "/splash/intro-pc" : "/splash/intro-m";
  const phase = leaving ? "leave" : playing ? "play" : "boot";

  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: SEEN_SCRIPT }} />
      <div
        role="presentation"
        onClick={() => setLeaving(true)}
        data-phase={phase}
        className="app-splash fixed inset-0 z-[100] items-center justify-center bg-[#ff2e88] transition-opacity duration-300 data-[phase=leave]:opacity-0"
        style={{ backgroundImage: `url(${src}-poster.jpg)`, backgroundSize: "cover", backgroundPosition: "center" }}
      >
        {playing && (
          <video
            ref={videoRef}
            className="h-full w-full object-cover"
            src={`${src}.mp4`}
            poster={`${src}-poster.jpg`}
            muted
            playsInline
            autoPlay
            preload="auto"
            onEnded={() => setLeaving(true)}
            onError={() => setLeaving(true)}
            aria-label="역전토익 — 인생 역전 시켜줄게"
          />
        )}
      </div>
    </>
  );
}
