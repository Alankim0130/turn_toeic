// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement as h, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Recording } from "@/components/my/homework/HomeworkRecorder";

/**
 * 숙제 바로 녹음 (2026-10-29 점검). 가짜 마이크 · 녹음기로 실제로 눌러 본다:
 *  - `녹음 끝내기` 를 두 번 눌러도 녹음을 잃지 않는다 (예전에는 둘째 누름이 마지막 조각 전에 담아 '녹음된 소리가 없어요')
 *  - 녹음이 담기는 순간 녹음 칸이 사라져도(다섯째 음성) 폼의 '녹음 중' 이 풀린다 (예전에는 제출이 잠긴 채 남았다)
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let now = 0;
class FakeRecorder {
  static isTypeSupported = () => true;
  state: "inactive" | "recording" = "inactive";
  mimeType = "audio/webm";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  start() {
    this.state = "recording";
  }
  stop() {
    if (this.state === "inactive") throw new Error("InvalidStateError");
    this.state = "inactive";
    // 진짜 녹음기처럼 조금 뒤에 마지막 조각 → onstop
    setTimeout(() => {
      this.ondataavailable?.({ data: new Blob(["voice"], { type: "audio/webm" }) });
      this.onstop?.();
    }, 5);
  }
}

const track = { stop: vi.fn(), addEventListener: vi.fn() };
beforeEach(() => {
  now = 0;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  (globalThis as { MediaRecorder?: unknown }).MediaRecorder = FakeRecorder;
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: async () => ({ getTracks: () => [track], getAudioTracks: () => [track] }) },
  });
});

const { HomeworkRecorder } = await import("@/components/my/homework/HomeworkRecorder");

let root: Root | null = null;
let host: HTMLElement | null = null;
beforeEach(() => {
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

const button = (label: string) => [...host!.querySelectorAll("button")].find((b) => b.textContent?.includes(label));
const flush = () => act(async () => void (await new Promise((r) => setTimeout(r, 20))));

/** 숙제 폼처럼 — 음성이 `max` 개가 되면 녹음 칸을 숨긴다 */
function Form({ max, got }: { max: number; got: Recording[] }) {
  const [count, setCount] = useState(0);
  const [recording, setRecording] = useState(false);
  return h(
    "div",
    null,
    h("p", { id: "state" }, recording ? "녹음 중" : "쉬는 중"),
    count < max
      ? h(HomeworkRecorder, {
          disabled: false,
          onRecorded: (r: Recording) => {
            got.push(r);
            setCount((c) => c + 1);
          },
          onActiveChange: setRecording,
        })
      : null,
  );
}

async function record(got: Recording[], max: number, taps: number) {
  await act(async () => root!.render(h(Form, { max, got })));
  await act(async () => button("바로 녹음하기")!.click());
  await flush();
  now = 3_000; // 3초 녹음
  const stop = button("녹음 끝내기")!;
  await act(async () => {
    for (let i = 0; i < taps; i++) stop.click();
  });
  await flush();
}

describe("HomeworkRecorder", () => {
  it("녹음 끝내기를 두 번 눌러도 녹음이 담긴다", async () => {
    const got: Recording[] = [];
    await record(got, 5, 2);
    expect(got).toHaveLength(1);
    expect(got[0].blob.size).toBeGreaterThan(0);
    expect(host!.textContent).not.toContain("녹음된 소리가 없어요");
  });

  it("담기는 순간 녹음 칸이 사라져도 폼의 '녹음 중' 이 풀린다", async () => {
    const got: Recording[] = [];
    await record(got, 1, 1);
    expect(got).toHaveLength(1);
    expect(host!.querySelector("#state")!.textContent).toBe("쉬는 중");
  });
});
