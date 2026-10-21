import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MaterialCard, type MyClassMaterial } from "@/components/my/ClassMaterialsView";
import type { MaterialFile } from "./class-materials";

/**
 * 학생 수업자료실의 자료 카드는 **닫힌 채로 선다** (2026-10-21 Alan — "학생모드에서 수업자료실에 전부다 열려있는데, 닫힘으로 해주고
 * 클릭하는것만 열리도록 부탁해"). 제목 줄만 보이고 안내 · 파일 · 링크는 누른 카드에서만 열린다 — 실제로 그려 본다.
 */

const file = (id: number, name: string, size: number | null = 2048): MaterialFile => ({ id, file_name: name, file_size: size, content_type: "application/pdf", sort_order: id });
const material = (over: Partial<MyClassMaterial> = {}): MyClassMaterial => ({
  id: 7,
  title: "600B DAY6 수업내용요약본 외 2개",
  note: "1. 전치사 p23-24 예문 모두 암기하기",
  files: [file(11, "600B DAY6 수업내용요약본.pdf"), file(12, "650B p24-25해설.pdf"), file(13, "650B p31 빈칸넣기 퀴즈.pdf")],
  links: [{ url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", label: "1강 해설 영상" }],
  created_at: "2026-10-21T01:00:00Z",
  ...over,
});
const render = (m: MyClassMaterial) => renderToStaticMarkup(createElement("ul", null, createElement(MaterialCard, { m })));
/** 카드의 제목 줄(첫 summary) 과 그 뒤 — 열어야 보이는 곳 */
const split = (html: string) => {
  const end = html.indexOf("</summary>");
  return { summary: html.slice(html.indexOf("<summary"), end), body: html.slice(end) };
};

describe("학생 수업자료실 자료 카드 — 닫힌 채로, 누른 것만 열린다", () => {
  it("처음에는 닫혀 있다 — 카드의 details 에 open 이 없다", () => {
    const html = render(material());
    expect(html).toMatch(/^<ul><li class="card overflow-hidden"><details class="group\/card">/);
    expect(html).not.toMatch(/<details[^>]*\sopen/);
  });

  it("제목 줄에는 종류 · 제목 · 올린 날 · 파일 수만 — 안내 · 파일 · 링크는 열어야 보인다", () => {
    const { summary, body } = split(render(material()));
    expect(summary).toContain("600B DAY6 수업내용요약본 외 2개");
    expect(summary).toContain("10월 21일 올림");
    expect(summary).toContain("파일 3개");
    expect(summary).toContain("영상 1개");
    expect(summary).not.toContain("전치사");
    expect(summary).not.toContain("받기");
    expect(summary).not.toContain("/files/class/");
    expect(body).toContain("전치사 p23-24");
    for (const id of [11, 12, 13]) expect(body).toContain(`/files/class/${id}?download=1`);
    expect(body).toContain('aria-label="링크"');
    expect(body).toContain("1강 해설 영상");
  });

  it("파일이 하나여도 제목 줄에 열기 · 받기를 두지 않는다 — 열면 파일 목록 한 줄", () => {
    const { summary, body } = split(render(material({ title: "1강 해설.pdf", note: null, links: [], files: [file(21, "1강 해설.pdf", 48 * 1024)] })));
    expect(summary).toContain("48KB");
    expect(summary).not.toContain("/files/class/21");
    expect(body).toContain('aria-label="첨부 파일"');
    expect(body).toContain('href="/files/class/21"');
    expect(body).toContain('href="/files/class/21?download=1"');
  });

  it("글만 올린 자료도 닫힌 채 — 열면 안내", () => {
    const html = render(material({ title: "수업 전에 출력해 오세요", note: "수업 전에 출력해 오세요", files: [], links: [] }));
    const { summary, body } = split(html);
    expect(summary).toContain(">글<");
    expect(body).toContain("수업 전에 출력해 오세요");
    expect(html).not.toContain("첨부 파일");
  });

  it("카드는 이름 붙은 group/card 다 — 안내의 이름 없는 group-open 이 카드가 열릴 때 함께 걸리지 않게", () => {
    // 긴 안내는 앞 네 줄 + 전체 보기 (MaterialNote 의 details.group). 카드가 그냥 `group` 이면 카드가 열리는 순간 접힌 앞부분이 숨는다
    const long = Array.from({ length: 12 }, (_, i) => `${i + 1}. 스크립트 한 줄 — M: Where is the meeting?`).join("\n");
    const html = render(material({ note: long }));
    const details = [...html.matchAll(/<details class="([^"]*)"/g)].map((m) => m[1].split(/\s+/));
    expect(details).toHaveLength(2);
    expect(details[0]).toContain("group/card");
    expect(details[0]).not.toContain("group");
    expect(details[1]).toContain("group");
    expect(html).toContain("전체 보기");
  });

  it("학생 화면 소스 — 자료 카드를 펴 둔 채로 그리지 않는다 · 영상은 카드를 닫으면 멈춘다", () => {
    const view = readFileSync("src/components/my/ClassMaterialsView.tsx", "utf8");
    expect(view).not.toMatch(/<details[^>]*\bopen\b/);
    const links = readFileSync("src/components/class-materials/MaterialLinkList.tsx", "utf8");
    expect(links).toContain('closest("details")');
    expect(links).toMatch(/addEventListener\("toggle", stop\)/);
    expect(links).toMatch(/if \(!details\.open\) setPlaying\(null\)/);
  });
});
