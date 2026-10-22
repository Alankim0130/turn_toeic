// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NoteEditor } from "@/components/note/NoteEditor";
import { parseDoc, runsText } from "./note-format";

/**
 * 글 편집기를 실제로 그려서 브라우저가 보내는 입력을 흉내 낸다 (2026-10-22 오류 점검).
 * - 아이폰 사파리 글자 메뉴의 B · I · U · 사파리 서식 메뉴 · 한글 조합 중의 Ctrl+B 는 브라우저가 스스로 `<b>` 로 감싼다(`formatBold` 입력).
 *   예전에는 칸에는 굵게 보였는데 저장하는 글에는 없어 학생에게는 보통 글자로 갔다 → 막고 도구줄과 같은 길로 건다
 * - 칸에 `[b]` 를 글자로 치면 저장한 뒤 다시 열 때 굵게로 바뀌었다 → 글자로 남는다 (`note-format.ts` 의 LITERAL_MARK)
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function mount(value: string) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(createElement(NoteEditor, { id: "note", defaultValue: value, max: 50_000 })));
  const editor = host.querySelector<HTMLElement>('[contenteditable="true"]');
  const hidden = host.querySelector<HTMLTextAreaElement>("textarea");
  if (!editor || !hidden) throw new Error("편집기를 그리지 못했어요");
  return { editor, hidden };
}

/** 칸 안의 글자를 고른다 (사람이 끌어 고른 것처럼) */
function select(editor: HTMLElement, text: string) {
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const at = (n as Text).data.indexOf(text);
    if (at < 0) continue;
    const r = document.createRange();
    r.setStart(n, at);
    r.setEnd(n, at + text.length);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(r);
    act(() => document.dispatchEvent(new Event("selectionchange")));
    return;
  }
  throw new Error(`칸에 '${text}' 가 없어요`);
}

function beforeInput(editor: HTMLElement, inputType: string, init: InputEventInit = {}) {
  const e = new InputEvent("beforeinput", { inputType, bubbles: true, cancelable: true, ...init });
  act(() => {
    editor.dispatchEvent(e);
  });
  return e;
}

describe("브라우저가 스스로 거는 서식 (아이폰 글자 메뉴 B · I · U)", () => {
  it("formatBold 는 브라우저에 맡기지 않고 저장하는 글에 [b] 로 건다", () => {
    const { editor, hidden } = mount("정답은 B 입니다");
    select(editor, "B");
    const e = beforeInput(editor, "formatBold");
    expect(e.defaultPrevented).toBe(true);
    expect(hidden.value).toBe("정답은 [b]B[/b] 입니다");
    // 칸도 저장한 글과 같은 모양 — 브라우저가 감싼 <b> 가 아니라 우리 조각(data-note)
    expect(editor.querySelector("b")).toBeNull();
    expect(editor.querySelector("[data-note]")?.textContent).toBe("B");
  });

  it("기울임 · 밑줄도 같은 길이고, 한 번 더 누르면 푼다 (도구줄과 같다)", () => {
    const { editor, hidden } = mount("가 나 다");
    select(editor, "나");
    beforeInput(editor, "formatItalic");
    expect(hidden.value).toBe("가 [i]나[/i] 다");
    select(editor, "나");
    beforeInput(editor, "formatUnderline");
    expect(parseDoc(hidden.value).runs.find((r) => r.text === "나")?.style).toEqual({ italic: true, underline: true });
    select(editor, "나");
    beforeInput(editor, "formatItalic");
    expect(hidden.value).toBe("가 [u]나[/u] 다");
  });

  it("한글을 조합하는 중이면 막기만 한다 — 칸을 다시 그리면 조합하던 글자가 깨진다", () => {
    const { editor, hidden } = mount("정답은 B 입니다");
    select(editor, "B");
    const e = beforeInput(editor, "formatBold", { isComposing: true });
    expect(e.defaultPrevented).toBe(true);
    expect(hidden.value).toBe("정답은 B 입니다");
  });

  it("우리가 저장하지 않는 서식(글자 색 · 들여쓰기 · 정렬 메뉴)은 막기만 한다 — 칸과 저장한 글이 어긋나지 않게", () => {
    const { editor, hidden } = mount("정답은 B 입니다");
    select(editor, "B");
    for (const t of ["formatFontColor", "formatIndent", "formatJustifyCenter", "formatStrikeThrough"]) {
      expect(beforeInput(editor, t).defaultPrevented).toBe(true);
    }
    expect(hidden.value).toBe("정답은 B 입니다");
  });

  it("글자 치기 · 지우기는 예전처럼 브라우저에 맡긴다 (표에 닿지 않은 선택)", () => {
    const { editor } = mount("정답은 B 입니다");
    select(editor, "B");
    expect(beforeInput(editor, "insertText", { data: "C" }).defaultPrevented).toBe(false);
    expect(beforeInput(editor, "deleteContentBackward").defaultPrevented).toBe(false);
  });
});

describe("칸에 글자로 친 [b] — 저장하고 다시 열어도 글자", () => {
  it("치는 대로 저장한 글을 다시 읽으면 친 글자 그대로, 굵게가 아니다", () => {
    const { editor, hidden } = mount("가격");
    const text = editor.querySelector("div")?.firstChild;
    if (!(text instanceof Text)) throw new Error("첫 줄 글자가 없어요");
    // 사람이 친 것처럼 글자를 바꾸고 input — 브라우저가 칸에 글자를 넣은 뒤와 같다
    text.data = "가격 [b]15,000원[/b] [center]";
    act(() => {
      editor.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const doc = parseDoc(hidden.value);
    expect(runsText(doc.runs)).toBe("가격 [b]15,000원[/b] [center]");
    expect(doc.runs.every((r) => !r.style.bold)).toBe(true);
    expect(doc.aligns).toEqual(["left"]);
  });
});
