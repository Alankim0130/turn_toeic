// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AudioPlayer } from "@/components/lc/AudioPlayer";

/**
 * LC 음원 · 숙제 음성 플레이어 (2026-10-29 점검). 불러오는 동안 멈추면(일시정지 · 다른 음원을 눌러 이 음원이 멈춤)
 * 브라우저의 play() 가 AbortError 로 끝난다 — 고장이 아닌데 예전에는 '재생하지 못했어요' 가 떴다.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement | null = null;
let failWith: string = "AbortError";
beforeEach(() => {
  failWith = "AbortError";
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(() => Promise.reject(Object.assign(new Error("x"), { name: failWith })));
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.restoreAllMocks();
});

async function pressPlay() {
  await act(async () => root!.render(createElement(AudioPlayer, { src: "/files/audio/1", title: "3강" })));
  await act(async () => host!.querySelector<HTMLButtonElement>('button[aria-label="3강 재생"]')!.click());
}

describe("AudioPlayer — 멈춤으로 끝난 재생은 오류가 아니다", () => {
  it("AbortError 면 아무 말도 띄우지 않는다", async () => {
    await pressPlay();
    expect(host!.textContent).not.toContain("재생하지 못했어요");
  });

  it("다른 실패(못 트는 형식 등)는 그대로 알린다", async () => {
    failWith = "NotSupportedError";
    await pressPlay();
    expect(host!.textContent).toContain("재생하지 못했어요");
  });
});
