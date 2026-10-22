import { useEffect, type RefObject } from "react";
import { isTypingTarget, viewportShift, type ViewportShift } from "@/lib/bottom-nav";

/**
 * 고정 · 붙박이 요소를 **지금 보이는 화면**에 맞추는 값을 한곳에서 재고 모두에게 나눠 준다 (계산은 `src/lib/bottom-nav.ts` 의 `viewportShift`).
 *
 * - 하단 메뉴(학생 · 관리자)는 `usePinnedBottom` 으로 값이 올 때마다 `transform` 을 다시 쓴다 — visualViewport 이벤트마다 같은 값이라도
 *   다시 쓴다 (2026-09-19 — 다시 써 주는 것 자체가 iOS 의 늦은 그림을 제자리로 되돌린다).
 * - 저장 · 선택 막대 · 머리줄 · 팝업 · 서랍은 `<html>` 의 CSS 변수(`--vv-shift` · `--vv-ghost`, `VisibleViewportVars`)를 쓴다 (globals.css).
 *
 * 고정 요소의 바닥이 실제로 어디에 섰는지는 `position: fixed; bottom: 0` 탐침의 바닥으로 잰다.
 * 유령 키보드는 visualViewport 이벤트 없이 남기도 해서 포커스가 바뀔 때(키보드가 닫힐 때) · 페이지를 넘길 때 · 앱으로 돌아올 때도 다시 잰다.
 * **손가락으로 쓰는 기기에서만 돈다** — 키보드 · 도구막대가 없는 PC 에서는 늘 0 이라 재지 않는다.
 */

type Listener = (shift: ViewportShift) => void;

const ZERO: ViewportShift = { pin: 0, ghost: 0 };
/** 키보드가 닫히는 동안(0.3초 남짓)과 그 뒤에 몇 번 더 잰다 */
export const RECHECK_MS = [120, 400, 900];

const listeners = new Set<Listener>();
let probe: HTMLElement | null = null;
let frame = 0;
let forced = false;
let last: ViewportShift = ZERO;
let timers: ReturnType<typeof setTimeout>[] = [];
let detach: (() => void) | null = null;

/** 손가락으로 쓰는 기기인가 — 휴대폰 · 태블릿 (터치 노트북도 여기 들지만 그쪽은 늘 0 이 나온다) */
function touchDevice(): boolean {
  if ((navigator.maxTouchPoints ?? 0) > 0) return true;
  return typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
}

/** 브라우저가 `position: fixed; bottom: 0` 을 실제로 세우는 자리를 재는 보이지 않는 상자 */
function fixedBottomProbe(): HTMLElement {
  if (probe?.isConnected) return probe;
  probe = document.createElement("div");
  probe.setAttribute("aria-hidden", "true");
  probe.dataset.viewportProbe = "";
  probe.style.cssText = "position:fixed;left:0;bottom:0;width:0;height:0;visibility:hidden;pointer-events:none";
  document.body.appendChild(probe);
  return probe;
}

/** 지금 화면을 재서 옮길 양을 낸다 */
export function readViewportShift(): ViewportShift {
  const vv = window.visualViewport;
  if (!vv) return ZERO;
  return viewportShift({
    innerHeight: window.innerHeight,
    layoutHeight: document.documentElement.clientHeight,
    viewportHeight: vv.height,
    offsetTop: vv.offsetTop,
    scale: vv.scale,
    boxBottom: fixedBottomProbe().getBoundingClientRect().bottom,
    typing: isTypingTarget(document.activeElement as (Element & { type?: string; isContentEditable?: boolean }) | null),
  });
}

function flush() {
  frame = 0;
  const force = forced;
  forced = false;
  const next = readViewportShift();
  if (!force && next.pin === last.pin && next.ghost === last.ghost) return;
  last = next;
  for (const listener of listeners) listener(next);
}

/** 한 프레임에 한 번만 잰다 — 스크롤 중에는 이벤트가 픽셀마다 온다. `force` 면 값이 같아도 다시 알린다 */
function schedule(force: boolean) {
  if (force) forced = true;
  if (!frame) frame = requestAnimationFrame(flush);
}

function attach(vv: VisualViewport): () => void {
  const now = () => schedule(true);
  const soon = () => schedule(false);
  // 키보드가 열리고 닫히는 동안 · 그 뒤에 — 유령 키보드는 닫힌 뒤 visualViewport 이벤트 없이 남기도 한다
  const recheck = () => {
    schedule(true);
    for (const t of timers) clearTimeout(t);
    timers = RECHECK_MS.map((ms) => setTimeout(now, ms));
  };
  vv.addEventListener("resize", now);
  vv.addEventListener("scroll", now);
  window.addEventListener("scroll", soon, { passive: true });
  window.addEventListener("resize", now);
  window.addEventListener("pageshow", now);
  document.addEventListener("visibilitychange", now);
  document.addEventListener("focusin", recheck);
  document.addEventListener("focusout", recheck);
  return () => {
    vv.removeEventListener("resize", now);
    vv.removeEventListener("scroll", now);
    window.removeEventListener("scroll", soon);
    window.removeEventListener("resize", now);
    window.removeEventListener("pageshow", now);
    document.removeEventListener("visibilitychange", now);
    document.removeEventListener("focusin", recheck);
    document.removeEventListener("focusout", recheck);
    for (const t of timers) clearTimeout(t);
    timers = [];
  };
}

/**
 * 옮길 양이 바뀔 때마다(visualViewport 이벤트면 같은 값이라도) 알려 준다. 처음 부를 때 지금 값을 바로 한 번 준다.
 * 손가락 기기가 아니거나 visualViewport 가 없으면 아무것도 하지 않는다.
 */
export function subscribeViewportShift(listener: Listener): () => void {
  if (typeof window === "undefined" || !window.visualViewport || !touchDevice()) return () => {};
  listeners.add(listener);
  if (!detach) {
    detach = attach(window.visualViewport);
    last = readViewportShift();
  }
  listener(last);
  return () => {
    if (!listeners.delete(listener) || listeners.size > 0) return;
    detach?.();
    detach = null;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    forced = false;
    last = ZERO;
    probe?.remove();
    probe = null;
  };
}

/** `position: fixed; bottom: 0` 막대(하단 메뉴)를 지금 보이는 화면 바닥에 붙인다 */
export function usePinnedBottom(ref: RefObject<HTMLElement | null>, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    return subscribeViewportShift(({ pin }) => {
      const el = ref.current;
      if (el) el.style.transform = `translateY(${pin}px)`;
    });
  }, [enabled, ref]);
}
