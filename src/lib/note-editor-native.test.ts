// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { parseDoc } from "./note-format";

/**
 * 글 편집기 (2026-10-29 점검). 실제로 그려서 브라우저가 하는 일을 흉내 낸다.
 *  1. 서식 있는 낱말을 끝까지 지우고 이어 치면 크롬이 `<b>Q</b>` · `<font color="#dc2626">` · `<span style="font-size">` 로 감싼다 (크롬 실측).
 *     예전에는 우리 조각(data-note)만 읽어 칸에는 굵게 보이는데 저장은 보통 글자였다 → 읽어서 우리 꼴로 다시 그린다
 *  2. 사진은 고른 때의 커서 자리에 들어가고, 다 올라가도 포커스를 가져가지 않는다 · 한글 조합 중이면 끝난 뒤에 넣는다
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({ resolve: null as null | ((v: { path: string }) => void) }));
vi.mock("@/lib/upload-client", () => ({
  uploadFile: (_bucket: string, path: string) =>
    new Promise<{ path: string }>((resolve) => {
      h.resolve = () => resolve({ path });
    }),
}));

const { NoteEditor } = await import("@/components/note/NoteEditor");

let root: Root | null = null;
let host: HTMLElement | null = null;
let style: HTMLStyleElement | null = null;
beforeEach(() => {
  h.resolve = null;
  URL.createObjectURL = () => "blob:photo";
  // 우리 색 · 크기 클래스가 이 화면에서 계산되는 값 (Tailwind 대신 — 휴대폰 폭: '크게' = text-base, '아주 크게' = text-lg)
  style = document.createElement("style");
  style.textContent = ".text-red-600{color:rgb(220, 38, 38)} .text-blue-600{color:rgb(37, 99, 235)} .text-sm{font-size:14px} .text-base{font-size:16px} .text-lg{font-size:18px} .bg-yellow-200{background-color:rgb(254, 240, 138)}";
  document.head.append(style);
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  style?.remove();
  root = null;
  host = null;
});

function mount(value: string, withImages = false) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  const images = withImages ? { bucket: "class-notices", folder: "images/", urls: {} } : undefined;
  act(() => root!.render(createElement("div", null, createElement("input", { id: "title" }), createElement(NoteEditor, { id: "note", defaultValue: value, max: 50_000, images }))));
  const editor = host.querySelector<HTMLElement>('[contenteditable="true"]')!;
  const hidden = host.querySelector<HTMLTextAreaElement>("textarea")!;
  return { editor, hidden };
}

/** 크롬이 하는 것처럼 — 굵은 조각을 지우고 그 자리에 브라우저 꼴로 감싼 글자를 넣는다 */
function chromeRetype(editor: HTMLElement, html: string, composing = false) {
  const span = editor.querySelector<HTMLElement>("[data-note]")!;
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  span.replaceWith(tpl.content);
  act(() => {
    editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: composing ? "insertCompositionText" : "insertText", isComposing: composing }));
  });
}

function caret(editor: HTMLElement, text: string, at: number) {
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const i = (n as Text).data.indexOf(text);
    if (i < 0) continue;
    editor.focus();
    const r = document.createRange();
    r.setStart(n, i + at);
    r.collapse(true);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(r);
    act(() => document.dispatchEvent(new Event("selectionchange")));
    return;
  }
  throw new Error(`칸에 '${text}' 가 없어요`);
}

describe("브라우저가 만든 서식 꼴 — 읽고 우리 꼴로", () => {
  it("<b> 로 감싼 글자는 굵게 저장되고 칸도 우리 조각이 된다", () => {
    const { editor, hidden } = mount("앞 [b]AB[/b]");
    chromeRetype(editor, "<b>Q</b>");
    expect(hidden.value).toBe("앞 [b]Q[/b]");
    expect(editor.querySelector("b")).toBeNull();
    expect(editor.querySelector("[data-note]")?.textContent).toBe("Q");
  });

  it("기울임 · 밑줄 · 우리 색과 같은 <font color> · 크기 · 형광펜도 읽는다", () => {
    const { editor, hidden } = mount("앞 [b]AB[/b]");
    chromeRetype(editor, '<b><i><u><font color="#dc2626"><span style="font-size: 16px; background-color: rgb(254, 240, 138);">Q</span></font></u></i></b>');
    expect(parseDoc(hidden.value).runs.find((r) => r.text === "Q")?.style).toEqual({ bold: true, italic: true, underline: true, color: "red", size: "lg", mark: true });
    expect(editor.querySelector("b, i, u, font, span:not([data-note])")).toBeNull();
  });

  it("우리에게 없는 색은 버린다 — 칸도 그 색 없이 다시 그린다 (보이는 것 = 저장되는 것)", () => {
    const { editor, hidden } = mount("앞 [b]AB[/b]");
    chromeRetype(editor, '<font color="#123456">Z</font>');
    expect(hidden.value).toBe("앞 Z");
    expect(editor.querySelector("font")).toBeNull();
  });

  it("한글을 조합하는 중에는 다시 그리지 않고, 조합이 끝나면 그린다", async () => {
    const { editor, hidden } = mount("앞 [b]AB[/b]");
    act(() => editor.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true })));
    chromeRetype(editor, "<b>가</b>", true);
    expect(editor.querySelector("b")).not.toBeNull(); // 조합 중 — 그대로
    expect(hidden.value).toBe("앞 [b]가[/b]"); // 읽기는 이미 굵게
    await act(async () => {
      editor.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 5));
    });
    expect(editor.querySelector("b")).toBeNull();
    expect(hidden.value).toBe("앞 [b]가[/b]");
  });
});

describe("사진 넣기 — 고른 자리 · 포커스는 그대로", () => {
  async function pickPhoto(editor: HTMLElement) {
    const input = host!.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, "files", { configurable: true, value: [new File(["x"], "a.png", { type: "image/png" })] });
    await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
    expect(h.resolve).not.toBeNull();
    void editor;
  }

  it("올리는 동안 제목 칸으로 옮겨 가 써도, 사진은 고른 자리에 들어가고 제목 칸에서 튕기지 않는다", async () => {
    const { editor, hidden } = mount("가나다", true);
    caret(editor, "가나다", 1);
    await pickPhoto(editor);
    const title = host!.querySelector<HTMLInputElement>("#title")!;
    title.focus();
    await act(async () => {
      h.resolve!({ path: "" });
      await new Promise((r) => setTimeout(r, 5));
    });
    expect(document.activeElement).toBe(title);
    const doc = parseDoc(hidden.value);
    expect(doc.runs.map((r) => (r.style.img ? "[사진]" : r.text)).join("")).toBe("가\n[사진]\n나다");
  });

  it("한글을 조합하는 중에 다 올라가면 조합이 끝난 뒤에 넣는다", async () => {
    const { editor, hidden } = mount("가나다", true);
    caret(editor, "가나다", 3);
    await pickPhoto(editor);
    act(() => editor.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true })));
    await act(async () => {
      h.resolve!({ path: "" });
      await new Promise((r) => setTimeout(r, 5));
    });
    expect(hidden.value).toBe("가나다"); // 아직
    await act(async () => {
      editor.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 5));
    });
    expect(parseDoc(hidden.value).runs.some((r) => r.style.img)).toBe(true);
  });

  it("올리는 동안은 표 넣기를 열지 않는다", async () => {
    const { editor } = mount("가나다", true);
    caret(editor, "가나다", 1);
    await pickPhoto(editor);
    const tableBtn = [...host!.querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === "표 넣기" || b.textContent?.includes("표 넣기"))!;
    expect(tableBtn.disabled).toBe(true);
    await act(async () => {
      h.resolve!({ path: "" });
      await new Promise((r) => setTimeout(r, 5));
    });
    expect(tableBtn.disabled).toBe(false);
  });
});
