// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { pullBlockedAt } from "./pull-to-refresh";

/**
 * 당겨서 새로고침을 시작하지 않는 곳 (2026-10-29 점검). 예전에는 화면이 맨 위이기만 하면 어디서 끌든 새로고침이라,
 * 팝업 안의 목록 · 글쓰기 칸 안을 거슬러 올리다 쓰던 공지 · 코멘트가 날아갔다.
 */

function make(html: string) {
  document.body.innerHTML = html;
  return (sel: string) => document.querySelector(sel)!;
}

describe("pullBlockedAt", () => {
  it("보통 화면(맨 위)에서는 당김이다", () => {
    const q = make('<main><section><p id="t">글</p></section></main>');
    expect(pullBlockedAt(q("#t"))).toBe(false);
    expect(pullBlockedAt(q("#t").firstChild)).toBe(false); // 글자 마디에서 시작해도
  });

  it("열린 팝업 · 서랍 안이면 당김이 아니다", () => {
    const q = make('<div role="dialog" aria-modal="true"><div><p id="t">글</p></div></div>');
    expect(pullBlockedAt(q("#t"))).toBe(true);
  });

  it("글을 쓰는 칸(textarea · contenteditable · input)이면 당김이 아니다", () => {
    const q = make('<textarea id="a"></textarea><div contenteditable="true"><p id="b">공지</p></div><input id="c" />');
    expect(pullBlockedAt(q("#a"))).toBe(true);
    expect(pullBlockedAt(q("#b"))).toBe(true);
    expect(pullBlockedAt(q("#c"))).toBe(true);
  });

  it("안쪽 스크롤이 내려가 있는 상자 안이면 당김이 아니다 · 맨 위면 당김이다", () => {
    const q = make('<div id="box"><p id="t">줄</p></div>');
    const box = q("#box") as HTMLElement;
    let top = 120;
    Object.defineProperty(box, "scrollTop", { configurable: true, get: () => top });
    expect(pullBlockedAt(q("#t"))).toBe(true);
    top = 0;
    expect(pullBlockedAt(q("#t"))).toBe(false);
  });

  it("손가락 대상이 없으면 막지 않는다", () => {
    expect(pullBlockedAt(null)).toBe(false);
  });
});

it("홈 화면 앱의 당겨서 새로고침이 손가락을 댈 때 이 판정을 본다", () => {
  const src = fs.readFileSync(path.resolve(__dirname, "../components/pwa/PullToRefresh.tsx"), "utf8");
  expect(src).toMatch(/const onStart = \(e: TouchEvent\) => \{[\s\S]{0,200}pullBlockedAt\(e\.target\)/);
});
