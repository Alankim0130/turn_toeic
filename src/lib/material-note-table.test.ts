import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MaterialNote } from "@/components/class-materials/MaterialNote";
import { noteView, notePreview, NOTE_PREVIEW_LINES } from "./class-materials";
import { OBJ } from "./note-format";

/**
 * 표가 든 안내도 접힌다 (2026-10-30 — 강사님 "표가 있는경우는 접어서 보기를 해도 접히지가 않아서 파일올린거를 한눈에 보기가 좀 힘든데 …
 * 두번째 이미지처럼 올린 파일을 한눈에 보고싶은데 표가 들어가면 화면이 접히지가 않네요"). 표는 글에서 한 글자(`OBJ`)라
 * 짧은 안내로 펼쳐 두거나 앞 네 줄 안에 통째로 들어가 큰 표가 회차 자료 목록을 밀어냈다 — 표가 있으면 늘 접고 앞부분은 표 앞에서 끊는다.
 */

const TABLE = "[table][tr][td]7[/td][td]where 의문사[/td][/tr][tr][td]8[/td][td]부가의문문[/td][/tr][/table]";
const scriptNote = `[b]750+A 교재 9강[/b] 스크립트\n${TABLE}\n9. (A) 정답 확인`;

const render = (note: string, showCount = false) => renderToStaticMarkup(createElement(MaterialNote, { note, showCount }));
const split = (html: string) => {
  const end = html.indexOf("</summary>");
  return { summary: end < 0 ? html : html.slice(0, end), body: end < 0 ? "" : html.slice(end) };
};

describe("noteView — 표가 있으면 짧아도 접고, 앞부분은 표 앞에서 끊는다", () => {
  it("한 줄 + 표 + 한 줄도 접힌다 · 앞부분에 표가 없다 · 표 수를 센다", () => {
    const v = noteView(scriptNote);
    expect(v.folded).toBe(true);
    expect(v.tables).toBe(1);
    expect(v.images).toBe(0);
    expect(v.preview.some((r) => r.style.table)).toBe(false);
    expect(v.preview.map((r) => r.text).join("")).toBe("750+A 교재 9강 스크립트");
    expect(v.full.some((r) => r.style.table)).toBe(true);
  });

  it("표로 시작하는 안내는 앞부분이 비어 있다 (표는 전체 보기 안에서만)", () => {
    const v = noteView(`${TABLE}\n정답`);
    expect(v.folded).toBe(true);
    expect(v.preview).toEqual([]);
  });

  it("표 앞 글이 길면 그 글도 네 줄까지만", () => {
    const lines = Array.from({ length: 8 }, (_, i) => `M: line ${i + 1}`).join("\n");
    const r = notePreview(`${lines}\n${TABLE}`);
    expect(r.folded).toBe(true);
    expect(r.preview.split("\n")).toHaveLength(NOTE_PREVIEW_LINES);
    expect(r.preview).not.toContain(OBJ);
  });

  it("표 없는 짧은 안내는 예전처럼 펼쳐 둔다", () => {
    const v = noteView("수업 전에 출력해 오세요.");
    expect(v.folded).toBe(false);
    expect(v.tables).toBe(0);
  });
});

describe("MaterialNote — 표는 전체 보기를 눌러야 보인다", () => {
  it("접힌 앞부분(summary)에 표가 없고 `전체 보기 · 표 1개` 가 선다 · 펼친 쪽에 표", () => {
    const html = render(scriptNote);
    expect(html).toMatch(/^<details class="group/);
    expect(html).not.toMatch(/<details[^>]*\sopen/);
    const { summary, body } = split(html);
    expect(summary).not.toContain("<table");
    expect(summary).toContain("750+A 교재 9강");
    expect(summary).toContain("전체 보기 · 표 1개");
    expect(body).toContain("<table");
    expect(body).toContain("부가의문문");
  });

  it("관리자 줄은 글자 수도 함께 — `전체 보기 · 표 1개 · N자`", () => {
    expect(split(render(scriptNote, true)).summary).toMatch(/전체 보기 · 표 1개 · [\d,]+자/);
  });

  it("표 없는 긴 스크립트는 예전 그대로 `전체 보기` (표 수 없음)", () => {
    const long = Array.from({ length: 12 }, (_, i) => `M: line ${i + 1}`).join("\n");
    const { summary } = split(render(long));
    expect(summary).toContain("전체 보기");
    expect(summary).not.toContain("표 ");
  });
});
