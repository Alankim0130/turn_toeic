"use client";

import { useEffect } from "react";
import { subscribeViewportShift } from "./visible-viewport";

/**
 * 보이는 화면 보정값을 `<html>` 의 CSS 변수로 적는다 — 저장 · 선택 막대(`.bar-above-nav`) · 머리줄 · 팝업 · 서랍(`.follow-screen`)이 쓴다.
 * 평소에는 둘 다 0 이다. 아이폰 홈 화면 앱에서 키보드를 닫은 뒤 화면이 키보드 높이만큼 짧게 남을 때(유령 키보드)만 값이 생긴다
 * (2026-10-22 — `src/lib/bottom-nav.ts`).
 */
export function VisibleViewportVars() {
  useEffect(() => {
    const root = document.documentElement;
    const stop = subscribeViewportShift(({ pin, ghost }) => {
      root.style.setProperty("--vv-shift", `${pin}px`);
      root.style.setProperty("--vv-ghost", `${ghost}px`);
    });
    return () => {
      stop();
      root.style.removeProperty("--vv-shift");
      root.style.removeProperty("--vv-ghost");
    };
  }, []);
  return null;
}
