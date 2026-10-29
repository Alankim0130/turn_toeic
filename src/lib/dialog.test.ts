// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, createElement as h, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Dialog } from "@/components/ui/Dialog";

/**
 * 가운데 팝업 (2026-10-29 점검). 실제로 그려서 친다:
 * 부르는 쪽이 `onClose={() => …}` 로 그릴 때마다 새 함수를 넘기고 칸의 값도 부모가 쥐면(반 편성 달력 특강 팝업의 메모),
 * 한 글자 칠 때마다 부모가 다시 그려진다 — 예전에는 그때마다 포커스가 제목으로 튀어 두 글자째가 안 들어갔다.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement | null = null;
let closed: string[] = [];
beforeEach(() => {
  closed = [];
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function Parent() {
  const [memo, setMemo] = useState("");
  return h(Dialog, {
    open: true,
    title: "10월 24일 특강",
    onClose: () => void closed.push(memo),
    dismissible: false,
    children: h("input", { "aria-label": "메모", value: memo, onChange: (e: { target: { value: string } }) => setMemo(e.target.value) }),
  });
}

function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("Dialog — 열릴 때 한 번만 제목에 포커스", () => {
  it("열면 제목에 포커스가 간다", async () => {
    await act(async () => root!.render(h(Parent)));
    expect(document.activeElement?.id).toBe("dialog-title");
  });

  it("부모가 쥔 칸에 글자를 쳐도 포커스가 칸에 남는다", async () => {
    await act(async () => root!.render(h(Parent)));
    const input = host!.querySelector<HTMLInputElement>('input[aria-label="메모"]')!;
    input.focus();
    await act(async () => type(input, "오"));
    expect(document.activeElement).toBe(input);
    await act(async () => type(input, "오후"));
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe("오후");
  });

  it("ESC 는 마지막으로 받은 onClose 를 부른다", async () => {
    await act(async () => root!.render(h(Parent)));
    const input = host!.querySelector<HTMLInputElement>('input[aria-label="메모"]')!;
    await act(async () => type(input, "2시"));
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(closed).toEqual(["2시"]);
  });
});
