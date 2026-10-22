// @vitest-environment jsdom
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { RECHECK_MS, subscribeViewportShift, usePinnedBottom } from "@/components/layout/visible-viewport";
import { VisibleViewportVars } from "@/components/layout/VisibleViewportVars";
import type { ViewportShift } from "./bottom-nav";

/**
 * 하단 메뉴 · 저장 막대 · 머리줄 · 팝업을 **보이는 화면**에 맞추는 값 (2026-10-22 Alan — 관리자 반 편성 화면에서
 * "위로 스크롤을 올리니 하단네비게이션바가 위로 올라가고 있어"). 아이폰 홈 화면 앱에서 키보드를 닫은 뒤 iOS 가 화면을
 * 키보드 높이만큼 짧게 붙잡아 두는 상태(유령 키보드)를 가짜 visualViewport 로 흉내 내 실제로 재고 그려 본다.
 * 진짜 아이폰의 그림은 이 시험이 못 본다 — 계산 · 다시 재는 때 · 화면 조각이 그 값을 쓰는지만 본다.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

class FakeViewport extends EventTarget {
  height = 873;
  width = 430;
  offsetTop = 0;
  offsetLeft = 0;
  scale = 1;
}

let vv: FakeViewport;
/** `position: fixed; top: 0; bottom: 0` 탐침의 높이 (고정 칸 = 레이아웃 뷰포트 높이) */
let box = 873;
/**
 * 탐침의 맨 위가 화면 좌표로 어디에 오나 — 화면 좌표가 레이아웃 뷰포트 기준이면 0,
 * 비주얼 뷰포트 기준이면 −offsetTop 이다. 어느 쪽이든 같은 값이 나와야 한다
 */
let visualFrame = false;
const define = (target: object, key: string, value: unknown) => Object.defineProperty(target, key, { value, configurable: true, writable: true });

beforeEach(() => {
  vi.useFakeTimers();
  vv = new FakeViewport();
  box = 873;
  visualFrame = false;
  define(window, "visualViewport", vv);
  define(window, "innerHeight", 873);
  Object.defineProperty(document.documentElement, "clientHeight", { configurable: true, get: () => 873 });
  define(navigator, "maxTouchPoints", 5);
  define(window, "requestAnimationFrame", (cb: FrameRequestCallback) => setTimeout(() => cb(0), 16) as unknown as number);
  define(window, "cancelAnimationFrame", (id: number) => clearTimeout(id));
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const probe = this.dataset.viewportProbe !== undefined;
    const top = probe && visualFrame ? -vv.offsetTop : 0;
    const height = probe ? box : 0;
    return { top, bottom: top + height, left: 0, right: 0, width: 0, height, x: 0, y: top, toJSON: () => ({}) } as DOMRect;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.body.innerHTML = "";
});

/** 키보드를 닫았는데 화면이 키보드(345px)만큼 짧게 남은 상태로 바꾼다 */
function ghost(offsetTop: number) {
  vv.height = 528;
  vv.offsetTop = offsetTop;
}
const frame = () => vi.advanceTimersByTime(20);

describe("subscribeViewportShift — 한곳에서 재고 나눠 준다", () => {
  it("평소에는 0 — 구독하자마자 지금 값을 한 번 준다", () => {
    const seen: ViewportShift[] = [];
    const stop = subscribeViewportShift((s) => seen.push(s));
    expect(seen).toEqual([{ pin: 0, ghost: 0 }]);
    stop();
  });

  it("유령 키보드: 페이지를 내려 offsetTop 이 키보드만큼이면 그만큼 내린다 · 위로 넘겨 0 이면 제자리", () => {
    const seen: ViewportShift[] = [];
    const stop = subscribeViewportShift((s) => seen.push(s));
    ghost(345);
    vv.dispatchEvent(new Event("scroll"));
    frame();
    expect(seen.at(-1)).toEqual({ pin: 345, ghost: 345 });
    ghost(0);
    vv.dispatchEvent(new Event("scroll"));
    frame();
    expect(seen.at(-1)).toEqual({ pin: 0, ghost: 0 });
    stop();
  });

  it("화면 좌표가 비주얼 뷰포트 기준이어도(탐침의 맨 위가 −offsetTop) 같은 값이다 — 좌표 기준에 기대지 않는다", () => {
    visualFrame = true;
    const seen: ViewportShift[] = [];
    const stop = subscribeViewportShift((s) => seen.push(s));
    for (const offsetTop of [345, 120, 0]) {
      ghost(offsetTop);
      vv.dispatchEvent(new Event("scroll"));
      frame();
      expect(seen.at(-1)).toEqual({ pin: offsetTop, ghost: offsetTop });
    }
    stop();
  });

  it("고정 칸이 짧은 화면만큼 줄었으면(레이아웃 뷰포트가 짧다) 바닥 막대만 내리고 머리줄 · 팝업은 그대로다", () => {
    const seen: ViewportShift[] = [];
    const stop = subscribeViewportShift((s) => seen.push(s));
    ghost(0);
    box = 528;
    vv.dispatchEvent(new Event("resize"));
    frame();
    expect(seen.at(-1)).toEqual({ pin: 345, ghost: 0 });
    stop();
  });

  it("글자를 치는 동안은 손대지 않고, 키보드를 닫으면(포커스가 빠지면) visualViewport 이벤트가 없어도 다시 잰다", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    const seen: ViewportShift[] = [];
    const stop = subscribeViewportShift((s) => seen.push(s));
    input.focus();
    ghost(345);
    frame();
    expect(seen.at(-1)).toEqual({ pin: 0, ghost: 0 });
    input.blur();
    // 이벤트 없이 시간만 — 키보드가 닫히는 동안 · 그 뒤에 다시 잰다
    vi.advanceTimersByTime(RECHECK_MS.at(-1)! + 20);
    expect(seen.at(-1)).toEqual({ pin: 345, ghost: 345 });
    stop();
  });

  it("visualViewport 이벤트면 같은 값이라도 다시 알리고(늦은 그림 되돌리기), 페이지 스크롤은 값이 바뀔 때만 알린다", () => {
    let calls = 0;
    const stop = subscribeViewportShift(() => calls++);
    expect(calls).toBe(1);
    vv.dispatchEvent(new Event("resize"));
    frame();
    expect(calls).toBe(2);
    window.dispatchEvent(new Event("scroll"));
    frame();
    expect(calls).toBe(2);
    ghost(200);
    window.dispatchEvent(new Event("scroll"));
    frame();
    expect(calls).toBe(3);
    stop();
  });

  it("한 프레임에 한 번만 잰다 — 스크롤 중에는 이벤트가 픽셀마다 온다", () => {
    let calls = 0;
    const stop = subscribeViewportShift(() => calls++);
    for (let i = 0; i < 30; i++) vv.dispatchEvent(new Event("scroll"));
    frame();
    expect(calls).toBe(2);
    stop();
  });

  it("구독을 다 풀면 탐침 · 이벤트를 치운다", () => {
    const seen: ViewportShift[] = [];
    const stopA = subscribeViewportShift((s) => seen.push(s));
    const stopB = subscribeViewportShift(() => {});
    expect(document.querySelectorAll("[data-viewport-probe]")).toHaveLength(1);
    stopA();
    expect(document.querySelectorAll("[data-viewport-probe]")).toHaveLength(1);
    stopB();
    expect(document.querySelectorAll("[data-viewport-probe]")).toHaveLength(0);
    const before = seen.length;
    ghost(345);
    vv.dispatchEvent(new Event("resize"));
    frame();
    expect(seen).toHaveLength(before);
  });

  it("손가락 기기가 아니면(PC) 재지 않는다 — 탐침도 만들지 않는다", () => {
    define(navigator, "maxTouchPoints", 0);
    const seen: ViewportShift[] = [];
    const stop = subscribeViewportShift((s) => seen.push(s));
    expect(seen).toHaveLength(0);
    expect(document.querySelectorAll("[data-viewport-probe]")).toHaveLength(0);
    stop();
  });

  it("visualViewport 가 없는 브라우저에서는 아무것도 하지 않는다", () => {
    define(window, "visualViewport", undefined);
    const seen: ViewportShift[] = [];
    subscribeViewportShift((s) => seen.push(s))();
    expect(seen).toHaveLength(0);
  });
});

describe("화면 조각 — 하단 메뉴는 transform, 나머지는 <html> 의 CSS 변수", () => {
  let root: Root | null = null;
  let host: HTMLDivElement;
  afterEach(() => {
    act(() => root?.unmount());
    root = null;
  });

  function Bar() {
    const ref = useRef<HTMLElement>(null);
    usePinnedBottom(ref);
    return createElement("nav", { ref, "data-testid": "bar" });
  }

  it("유령 키보드면 하단 메뉴를 내리고 --vv-shift · --vv-ghost 를 적는다 · 빠지면 지운다", () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(createElement("div", null, createElement(Bar), createElement(VisibleViewportVars))));
    const bar = host.querySelector("nav") as HTMLElement;
    const html = document.documentElement;
    expect(bar.style.transform).toBe("translateY(0px)");
    expect(html.style.getPropertyValue("--vv-shift")).toBe("0px");
    act(() => {
      ghost(345);
      vv.dispatchEvent(new Event("resize"));
      frame();
    });
    expect(bar.style.transform).toBe("translateY(345px)");
    expect(html.style.getPropertyValue("--vv-shift")).toBe("345px");
    expect(html.style.getPropertyValue("--vv-ghost")).toBe("345px");
    act(() => root!.unmount());
    root = null;
    expect(html.style.getPropertyValue("--vv-shift")).toBe("");
    expect(html.style.getPropertyValue("--vv-ghost")).toBe("");
  });
});

/** src 아래 .tsx 전부 */
function tsxFiles(dir = "src"): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return tsxFiles(path);
    return path.endsWith(".tsx") ? [path] : [];
  });
}
const read = (path: string) => readFileSync(path, "utf8");

describe("소스 — 보이는 화면에 붙는 것은 전부 보정값을 쓴다 (안 쓰면 그것만 떠오른다)", () => {
  const files = tsxFiles();

  it("globals.css — 하단 메뉴 위 막대는 --vv-shift, 화면을 덮는 것은 --vv-ghost", () => {
    const css = read("src/app/globals.css");
    expect(css).toMatch(/\.bar-above-nav \{\s*position: sticky;[^}]*bottom: calc\(4\.75rem \+ var\(--safe-bottom\) - var\(--vv-shift, 0px\)\)/);
    expect(css).toMatch(/\.bar-above-nav \{ bottom: calc\(1rem - var\(--vv-shift, 0px\)\); \}/);
    expect(css).toMatch(/\.follow-screen \{ translate: 0 var\(--vv-ghost, 0px\); \}/);
  });

  it("하단 메뉴(학생 · 관리자)는 usePinnedBottom — 학생 쪽은 /admin early return 보다 위", () => {
    const student = read("src/components/layout/BottomNav.tsx");
    expect(student).toContain("usePinnedBottom(ref, !hidden)");
    expect(student.indexOf("usePinnedBottom(ref")).toBeLessThan(student.indexOf("if (hidden) return null"));
    expect(student).toMatch(/<nav\s+ref=\{ref\}/);
    const admin = read("src/components/admin/AdminBottomNav.tsx");
    expect(admin).toContain("usePinnedBottom(ref)");
    expect(admin).toMatch(/<nav\s+ref=\{ref\}/);
  });

  it("루트 레이아웃이 VisibleViewportVars 를 그린다", () => {
    expect(read("src/app/layout.tsx")).toContain("<VisibleViewportVars />");
  });

  it("바닥에 붙는 막대는 전부 .bar-above-nav — 'sticky bottom-…' 을 손으로 적지 않는다", () => {
    const hand = files.filter((f) => /\bsticky\b[^"'`]*\bbottom-/.test(read(f)) || /\bbottom-[^"'`]*\bsticky\b/.test(read(f)));
    expect(hand).toEqual([]);
    const users = files.filter((f) => /className="[^"]*\bbar-above-nav\b/.test(read(f))).sort();
    expect(users).toEqual(
      [
        "src/components/admin/board/BulkSelect.tsx",
        "src/components/admin/homework/MissingBoard.tsx",
        "src/components/admin/sections/BulkCreateSections.tsx",
        "src/components/admin/sections/TermCalendar.tsx",
      ].sort(),
    );
  });

  it("화면 전체를 덮는 팝업 · 서랍(fixed inset-0)은 .follow-screen — 첫 화면(스플래시)만 뺀다", () => {
    // 스플래시는 앱을 켤 때만 뜬다 — 그때는 유령 키보드가 없다
    const ALLOWED = ["src/components/pwa/AppSplash.tsx"];
    const missing = files.filter((f) => {
      if (ALLOWED.includes(f)) return false;
      return [...read(f).matchAll(/className=\{?[^>]*?\bfixed inset-0\b[^>]*>/g)].some((m) => !m[0].includes("follow-screen"));
    });
    expect(missing).toEqual([]);
  });

  it("위에 붙는 머리줄 · 관리자 사이드바는 --vv-ghost 만큼 내려 붙는다", () => {
    expect(read("src/components/layout/SiteHeader.tsx")).toContain('<header className="sticky top-[var(--vv-ghost,0px)]');
    expect(read("src/components/admin/AdminNav.tsx")).toContain('<aside className="sticky top-[calc(5rem+var(--vv-ghost,0px))]');
    const stickyTop = files.filter((f) => /className="[^"]*\bsticky top-(?!\[)/.test(read(f)));
    expect(stickyTop).toEqual([]);
  });
});
