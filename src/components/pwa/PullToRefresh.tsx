"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getInstallEnv } from "./install-store";
import { PULL_START, PULL_THRESHOLD, pullDistance, pullOffset, shouldRefresh } from "@/lib/pull-to-refresh";

/** 앱으로 돌아왔을 때 이만큼 넘게 떠나 있었으면 화면을 새로 받는다 */
const STALE_MS = 30_000;

/**
 * 홈 화면 앱(PWA)의 새로고침 (2026-09-16 Alan 요청 — "앱처럼 쓰는데 새로고침을 할 수 없다").
 *
 * standalone 으로 열면 주소창이 없어 새로고침 버튼도, 브라우저의 당겨서 새로고침도 없다. 그래서 두 가지를 둔다.
 *  1. **당겨서 새로고침** — 맨 위에서 아래로 당기면 `location.reload()`.
 *     `router.refresh()` 가 아니라 통째로 다시 받는다 — 배포가 잦아서 새 자바스크립트까지 받아야 한다.
 *  2. **앱으로 돌아오면 자동으로** — 30초 넘게 떠나 있었으면 `router.refresh()` 로 서버 데이터만 새로 받는다
 *     (화면이 깜빡이지 않는다). 손이 아니라 시간이 해결해 주는 쪽이라 대부분 이걸로 끝난다.
 *
 * 스크롤을 가로채지 않는다 — `preventDefault` 를 쓰지 않는다. 판정은 `lib/pull-to-refresh.ts` 한곳.
 */
export function PullToRefresh() {
  const router = useRouter();
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  const startY = useRef<number | null>(null);
  const startX = useRef(0);
  // 지금 당긴 거리. 상태 갱신 함수 안에서 새로고침을 부르면 StrictMode 에서 두 번 돈다
  const dist = useRef(0);

  useEffect(() => {
    if (!getInstallEnv().standalone) return;

    const stop = () => {
      startY.current = null;
      dist.current = 0;
      setPull(0);
    };

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1 || window.scrollY > 0) return;
      startY.current = e.touches[0].clientY;
      startX.current = e.touches[0].clientX;
    };

    const onMove = (e: TouchEvent) => {
      const t = e.touches[0];
      const d = t
        ? pullDistance({
            startY: startY.current,
            startX: startX.current,
            y: t.clientY,
            x: t.clientX,
            scrollY: window.scrollY,
            touches: e.touches.length,
          })
        : null;
      if (d == null) return stop();
      dist.current = d;
      setPull(d);
    };

    const onEnd = () => {
      const go = startY.current != null && shouldRefresh(dist.current, window.scrollY);
      stop();
      if (go) {
        setBusy(true);
        window.location.reload();
      }
    };

    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: true });
    document.addEventListener("touchend", onEnd, { passive: true });
    document.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onEnd);
    };
  }, []);

  // 앱으로 돌아왔을 때 — 오래 떠나 있었으면 서버 데이터를 새로 받는다
  useEffect(() => {
    if (!getInstallEnv().standalone) return;
    let hiddenAt = 0;
    const onVisible = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      if (hiddenAt && Date.now() - hiddenAt > STALE_MS) router.refresh();
      hiddenAt = 0;
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [router]);

  if (!busy && pull <= PULL_START) return null;

  const ready = pull >= PULL_THRESHOLD;
  const offset = busy ? PULL_THRESHOLD : pullOffset(pull);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center"
      style={{ transform: `translateY(${offset - 24}px)`, opacity: busy ? 1 : Math.min(1, pull / PULL_THRESHOLD + 0.15) }}
    >
      <span
        className={`rounded-full px-3.5 py-1.5 text-xs font-black shadow-pink transition-colors ${
          ready || busy ? "bg-brand-500 text-white" : "bg-paper text-ink-soft ring-1 ring-line"
        }`}
      >
        {busy ? "새로고침 중…" : ready ? "놓으면 새로고침" : "당겨서 새로고침"}
      </span>
    </div>
  );
}
