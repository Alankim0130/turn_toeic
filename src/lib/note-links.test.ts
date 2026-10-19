import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MaterialNote } from "@/components/class-materials/MaterialNote";
import { NoteBody, NoteTableView } from "@/components/note/NoteBody";
import { CLASS_MATERIAL_LINK_URL_MAX, noteView } from "./class-materials";
import { OBJ, cellWithRuns, parseDoc, runsLength, runsText, sliceRuns, splitLines, tableToNote, type NoteRun, type NoteTable } from "./note-format";
import { findUrls, linkRuns, noteLinkHref } from "./note-links";

/**
 * 특강 안내 글 속 주소를 누르면 바로 가는 링크 (2026-10-16 Alan — "특강신청에서 안내글에서 링크가 있다면 클릭했을때 바로가기가 되면 좋겠어").
 * 글은 그대로 두고 그릴 때 주소를 찾는다 — 무엇이 주소인지 · 어디서 끝나는지 · href 에 무엇이 서는지를 못박는다.
 */

const urls = (text: string) => findUrls(text).map((s) => ({ text: text.slice(s.start, s.end), href: s.href }));

describe("주소 찾기 — https:// · http:// · www. 로 시작하는 것만", () => {
  it("글 속 주소를 찾고 href 는 다시 읽은 주소다", () => {
    expect(urls("시험지 PDF: https://forms.gle/AbC123 에서 받아요")).toEqual([{ text: "https://forms.gle/AbC123", href: "https://forms.gle/AbC123" }]);
    expect(urls("http://example.com/a?b=1&c=2#d")).toEqual([{ text: "http://example.com/a?b=1&c=2#d", href: "http://example.com/a?b=1&c=2#d" }]);
    expect(urls("www.ybmedu.com 에서 후기")).toEqual([{ text: "www.ybmedu.com", href: "https://www.ybmedu.com/" }]);
    expect(urls("HTTPS://Open.Kakao.com/o/sAbc")).toEqual([{ text: "HTTPS://Open.Kakao.com/o/sAbc", href: "https://open.kakao.com/o/sAbc" }]);
  });
  it("한 줄에 여럿 · 줄마다", () => {
    expect(urls("1차 https://a.com/1 · 2차 https://b.co.kr/2\n카톡 https://open.kakao.com/o/x").map((u) => u.text)).toEqual([
      "https://a.com/1",
      "https://b.co.kr/2",
      "https://open.kakao.com/o/x",
    ]);
  });
  it("한글이 바로 붙어도 한글 앞에서 끊긴다 — `https://naver.me/abc에서 신청`", () => {
    expect(urls("https://naver.me/xYz9에서 신청하세요").map((u) => u.text)).toEqual(["https://naver.me/xYz9"]);
    expect(urls("링크https://naver.me/xYz9입니다").map((u) => u.text)).toEqual(["https://naver.me/xYz9"]);
    expect(urls("https://a.com/x·https://b.com/y").map((u) => u.text)).toEqual(["https://a.com/x", "https://b.com/y"]);
    expect(urls("https://a.com/x。다음").map((u) => u.text)).toEqual(["https://a.com/x"]);
  });
  it("끝에 붙은 문장부호 · 짝 없는 괄호는 뗀다 — 짝이 맞는 괄호는 주소다", () => {
    expect(urls("주소는 https://a.com/x.").map((u) => u.text)).toEqual(["https://a.com/x"]);
    expect(urls("(https://a.com/x)").map((u) => u.text)).toEqual(["https://a.com/x"]);
    expect(urls("[링크](https://a.com/x)").map((u) => u.text)).toEqual(["https://a.com/x"]);
    expect(urls("https://a.com/x!!~~ 꼭!").map((u) => u.text)).toEqual(["https://a.com/x"]);
    expect(urls("'https://a.com/x', \"https://b.com/y\"").map((u) => u.text)).toEqual(["https://a.com/x", "https://b.com/y"]);
    expect(urls("https://en.wikipedia.org/wiki/Foo_(bar)").map((u) => u.text)).toEqual(["https://en.wikipedia.org/wiki/Foo_(bar)"]);
    expect(urls("https://a.com/a,b;c=d").map((u) => u.text)).toEqual(["https://a.com/a,b;c=d"]);
    expect(urls("<https://a.com/x>").map((u) => u.text)).toEqual(["https://a.com/x"]);
  });
  it("주소가 아닌 것 — 앞을 뺀 주소 · 낱말 가운데 · 메일 · 이름 없는 사이트 · 아이디가 낀 주소 · 다른 꼴", () => {
    for (const text of [
      "naver.me/abc",
      "forms.gle/abc 에서",
      "1.5배속 · file.pdf · v1.2",
      "abcwww.naver.com",
      "a@www.naver.com",
      "http://localhost:3000/x",
      "https://",
      "https://.",
      "https://a.b",
      "https://youtube.com@evil.com/x",
      "javascript:alert(1)",
      "data:text/html,<script>",
      "ftp://a.com/x",
      "xhttps://a.com",
    ]) {
      expect(findUrls(text), text).toEqual([]);
    }
  });
  it("2,000자가 넘는 주소는 링크로 만들지 않는다 (수업자료실 링크와 같은 상한)", () => {
    const head = "https://a.com/";
    expect(findUrls(head + "x".repeat(CLASS_MATERIAL_LINK_URL_MAX - head.length))).toHaveLength(1);
    expect(findUrls(head + "x".repeat(CLASS_MATERIAL_LINK_URL_MAX - head.length + 1))).toEqual([]);
  });
  it("href 는 늘 http(s) 다 — 어떤 글이 와도", () => {
    const tricky = [
      "javascript://a.com/%0aalert(1)",
      "https://a.com/\"onmouseover=alert(1)",
      "www.a.com/<img src=x>",
      "https://a.com/x'onclick='y",
      "jav\u0000ascript:https://a.com",
      "https://xn--3e0b707e.kr/한국",
      "https://192.168.0.1/admin",
    ];
    // href 속성에는 빈칸 · 따옴표 · 꺾쇠가 들어가지 않는다 (React 가 어차피 이스케이프한다 — 두 겹). `'` 는 주소 글자라 남을 수 있다
    for (const t of tricky) for (const s of findUrls(t)) expect(s.href, t).toMatch(/^https?:\/\/[^\s"<>]+$/);
    expect(noteLinkHref("javascript:alert(1)")).toBeNull();
    expect(noteLinkHref("https://xn--3e0b707e.kr/x")).toBe("https://xn--3e0b707e.kr/x");
    expect(noteLinkHref("https://192.168.0.1/admin")).toBe("https://192.168.0.1/admin");
  });
});

describe("조각에 링크 표시 — 서식이 갈라도 한 링크 · 그림 · 표 · 접힌 앞부분", () => {
  it("글은 한 자도 바뀌지 않고, 주소 자리만 링크 표시가 붙는다", () => {
    const { runs } = parseDoc("[b]신청 링크[/b]: https://forms.gle/AbC123 꼭 내세요");
    const linked = linkRuns(runs);
    expect(runsText(linked)).toBe(runsText(runs));
    expect(linked.filter((r) => r.link).map((r) => r.text)).toEqual(["https://forms.gle/AbC123"]);
    expect(linked.find((r) => r.text.startsWith("신청"))?.style.bold).toBe(true);
  });
  it("주소 가운데만 서식이 달라도(빨간 글자) 같은 링크 하나다", () => {
    const { runs } = parseDoc("https://forms.gle/[color=red]AbC[/color]123 끝");
    const parts = linkRuns(runs).filter((r) => r.link);
    expect(parts.map((r) => r.text)).toEqual(["https://forms.gle/", "AbC", "123"]);
    expect(new Set(parts.map((r) => r.link?.id)).size).toBe(1);
    expect(parts[0].link?.href).toBe("https://forms.gle/AbC123");
    const html = renderToStaticMarkup(createElement(NoteBody, { runs: linkRuns(runs), aligns: ["left"] }));
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(html).toContain('<a href="https://forms.gle/AbC123" target="_blank" rel="noopener noreferrer"');
  });
  it("그림 · 표 자리에서 주소가 끊기고, 표에는 칸 글자 링크 표시가 붙는다", () => {
    const table = tableToNote({ rows: [[{ text: "PDF" }, { text: "https://a.com/pdf 에서 받기" }]] });
    const { runs } = parseDoc(`https://a.com/x[img=images/a.webp w=50]y\n${table}`);
    const linked = linkRuns(runs);
    expect(linked.filter((r) => r.link).map((r) => r.text)).toEqual(["https://a.com/x"]);
    expect(linked.find((r) => r.style.table)?.linkCells).toBe(true);
    expect(linked.find((r) => r.style.img)?.text).toBe(OBJ);
    const html = renderToStaticMarkup(createElement(NoteBody, { runs: linked, aligns: ["left", "left"] }));
    expect(html).toContain('<a href="https://a.com/pdf" target="_blank" rel="noopener noreferrer"');
    // 링크 표시가 없으면 칸 글자는 예전처럼 글자뿐이다
    expect(renderToStaticMarkup(createElement(NoteBody, { runs, aligns: ["left", "left"] }))).not.toContain("<a ");
  });
  it("표 칸 글자도 같은 규칙 — 칸의 서식 조각째 (2026-10-19 칸 글자 서식)", () => {
    const parts = (runs: NoteRun[]) => linkRuns(runs).map((r) => (r.link ? { text: r.text, href: r.link.href } : { text: r.text }));
    expect(parts([{ text: "PDF https://a.com/p.pdf, 카톡 www.kakao.com", style: {} }])).toEqual([
      { text: "PDF " },
      { text: "https://a.com/p.pdf", href: "https://a.com/p.pdf" },
      { text: ", 카톡 " },
      { text: "www.kakao.com", href: "https://www.kakao.com/" },
    ]);
    expect(parts([{ text: "주소 없음", style: {} }])).toEqual([{ text: "주소 없음" }]);
  });
  it("칸 글자 서식이 학생 화면에 그대로 — 굵은 정답 · 칸 안 줄바꿈 · 서식이 갈라도 링크 하나", () => {
    const q = "80. What is the company trying to do?\n(A) Implement a recycling program\n(B) Reduce electricity use";
    const at = q.indexOf("(B)");
    const table: NoteTable = {
      rows: [
        [cellWithRuns({ text: "" }, [{ text: q.slice(0, at), style: {} }, { text: q.slice(at), style: { bold: true } }])],
        [cellWithRuns({ text: "" }, [{ text: "자료 https://a.com/", style: {} }, { text: "pdf", style: { bold: true } }, { text: " 받기", style: {} }])],
      ],
    };
    const html = renderToStaticMarkup(createElement(NoteTableView, { table, linkify: true }));
    expect(html).toContain('<span class="font-bold">(B) Reduce electricity use</span>');
    expect(html).toContain("(A) Implement a recycling program\n");
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(html).toContain('<a href="https://a.com/pdf" target="_blank" rel="noopener noreferrer"');
    // linkify 가 아니면 링크 없이 서식만
    const plain = renderToStaticMarkup(createElement(NoteTableView, { table }));
    expect(plain).not.toContain("<a ");
    expect(plain).toContain('<span class="font-bold">pdf</span>');
    // 저장했다 다시 읽어도 같은 그림
    const back = parseDoc(tableToNote(table)).runs[0].style.table;
    expect(back).toEqual(table);
    expect(renderToStaticMarkup(createElement(NoteTableView, { table: back!, linkify: true }))).toBe(html);
  });
  it("줄 자르기 · 앞부분 자르기가 링크 표시를 지킨다", () => {
    const linked = linkRuns(parseDoc("첫 줄\nhttps://a.com/x 둘째 줄").runs);
    const lines = splitLines(linked);
    expect(lines[1][0]).toMatchObject({ text: "https://a.com/x", link: { href: "https://a.com/x" } });
    const cut = sliceRuns(linked, Array.from("첫 줄\nhttps://a.c").length);
    expect(cut.at(-1)).toMatchObject({ text: "https://a.c", link: { href: "https://a.com/x" } });
  });
  it("편집기 · 다른 화면이 쓰는 조각(링크 표시 없음)은 자르기 결과가 예전과 같다", () => {
    const runs: NoteRun[] = [
      { text: "가나\n다", style: { bold: true } },
      { text: "라", style: {} },
    ];
    expect(splitLines(runs)).toEqual([[{ text: "가나", style: { bold: true } }], [{ text: "다", style: { bold: true } }, { text: "라", style: {} }]]);
    expect(sliceRuns(runs, 2)).toEqual([{ text: "가나", style: { bold: true } }]);
  });
});

describe("특강 안내 (`MaterialNote linkify`) — 짧은 안내 · 접힌 안내", () => {
  const html = (note: string, linkify = true) => renderToStaticMarkup(createElement(MaterialNote, { note, linkify }));

  it("짧은 안내의 주소가 새 창 링크로 선다", () => {
    const out = html("시험지 PDF 는 https://forms.gle/AbC123 에서 신청하세요.");
    expect(out).toContain('<a href="https://forms.gle/AbC123" target="_blank" rel="noopener noreferrer"');
    expect(out).toContain(">https://forms.gle/AbC123</a> 에서 신청하세요.");
  });
  it("linkify 를 안 주면 예전 그대로 글자다 (수업자료실 안내 · 공지 · 비대면 안내)", () => {
    expect(html("https://forms.gle/AbC123", false)).not.toContain("<a ");
  });
  it("접힌 앞부분 끝에서 주소가 잘려도 링크는 온전한 주소로 간다", () => {
    const url = `https://forms.gle/${"Q".repeat(40)}`;
    const note = `${"가".repeat(180)} ${url} 뒤 글 ${"나".repeat(200)}`;
    const view = noteView(note);
    expect(view.folded).toBe(true);
    const visible = runsText(view.preview);
    expect(visible.endsWith(url)).toBe(false); // 앞부분에는 주소가 다 들어가지 않는다
    expect(runsLength(view.preview)).toBeLessThan(Array.from(note).length);
    const out = html(note);
    const preview = out.slice(out.indexOf("<summary"), out.indexOf("</summary>"));
    expect(preview).toContain(`<a href="${url}"`);
    // 펼친 글에도 같은 링크 한 번 더 (접힌 앞부분 · 펼친 글)
    expect(out.match(new RegExp(`href="${url}"`, "g"))).toHaveLength(2);
  });
  it("학생 특강 카드가 켠다 — 다른 화면은 켜지 않았다", () => {
    const page = readFileSync("src/app/my/lecture/page.tsx", "utf8");
    expect(page).toMatch(/<MaterialNote note=\{l\.notice\} linkify /);
    for (const file of ["src/components/my/ClassMaterialsView.tsx", "src/components/admin/class-materials/ClassMaterialRow.tsx"]) {
      expect(readFileSync(file, "utf8"), file).not.toContain("linkify");
    }
  });
});
