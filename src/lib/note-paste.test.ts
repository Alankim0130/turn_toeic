import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { TABLE_MAX_COLS, TABLE_MAX_ROWS, docToNote, parseDoc, tableRun, type NoteTable } from "./note-format";
import { pasteParts } from "./note-paste";

/** 브라우저의 DOMParser 와 같은 HTML 파서(parse5) — 클립보드 HTML 을 그대로 넣어 본다 */
const parse = (html: string) => new JSDOM(html).window.document;
const paste = (html: string) => pasteParts(html, parse);
const onlyTable = (html: string): NoteTable => {
  const r = paste(html);
  const t = r?.parts.find((p) => p.kind === "table");
  if (!t || t.kind !== "table") throw new Error("표가 없다");
  return t.table;
};

/** 네이버 블로그(SmartEditor ONE) 표 — 2026-10-07 Alan 이 보여 준 표와 같은 꼴. 정렬이 칸이 아니라 문단 class 에 있고, 빈 문단에는 U+200B 가 든다 */
const naverP = (text: string) => `<p class="se-text-paragraph se-text-paragraph-align-center " style="" id="SE-p"><span style="" class="se-fs-fs15 se-ff-   " id="SE-s">${text}</span></p>`;
const naverCell = (inner: string, rowspan = 1) =>
  `<td class="se-cell" colspan="1" rowspan="${rowspan}" style="width: 25%; height: 43px;"><div class="se-module se-module-text">${inner}</div></td>`;
const NAVER = `<html><body><!--StartFragment--><div class="se-component se-table se-l-default" id="SE-1"><div class="se-component-content"><div class="se-section se-section-table se-l-default se-section-align-center"><div class="se-table-container"><table class="se-table-content" style="width: 100%;"><tbody>
<tr class="se-tr">${naverCell(naverP("의문사"))}${naverCell(naverP("be 동사"))}${naverCell(naverP("주어"))}${naverCell(naverP("동사ing"))}</tr>
<tr class="se-tr">${naverCell(["When", "Who", "Where", "What", "How/ Why"].map(naverP).join(""), 4)}${naverCell(naverP("am"))}${naverCell(naverP("I"))}${naverCell(naverP("running"), 4)}</tr>
<tr class="se-tr">${naverCell(naverP("are"))}${naverCell(naverP("you"))}</tr>
<tr class="se-tr">${naverCell(naverP("is"))}${naverCell(naverP("he/ she/ it") + naverP("\u200B"))}</tr>
<tr class="se-tr">${naverCell(naverP("are"))}${naverCell(naverP("we/ you and I/ you/ they"))}</tr>
</tbody></table></div></div></div></div><!--EndFragment--></body></html>`;

describe("붙여 넣은 표 → 안내 글의 표 (2026-10-07 Alan — 다른 블로그의 표를 그대로)", () => {
  it("네이버 블로그 표 — 합친 칸 · 문단 정렬 · 칸 안 줄바꿈 · 빈 문단(U+200B)", () => {
    const c = (text: string, extra: object = {}) => ({ text, align: "center", ...extra });
    expect(onlyTable(NAVER)).toEqual({
      rows: [
        [c("의문사"), c("be 동사"), c("주어"), c("동사ing")],
        [c("When\nWho\nWhere\nWhat\nHow/ Why", { rowspan: 4 }), c("am"), c("I"), c("running", { rowspan: 4 })],
        [c("are"), c("you")],
        [c("is"), c("he/ she/ it")],
        [c("are"), c("we/ you and I/ you/ they")],
      ],
    });
  });

  it("붙여 넣은 표는 저장했다가 다시 읽어도 같다", () => {
    const table = onlyTable(NAVER);
    const doc = parseDoc(docToNote({ runs: [tableRun(table)], aligns: ["left"] }));
    expect(doc.runs[0].style.table).toEqual(table);
  });

  it("크롬이 붙인 계산된 정렬 — 칸이 start 여도 문단의 center 가 가깝다", () => {
    const t = onlyTable(`<table><tr><td style="text-align: start; color: rgb(0, 0, 0);"><p style="margin: 0px; text-align: center;"><span style="font-size: 15px;">가운데</span></p></td>
      <td style="text-align: right;"><span style="text-align: left">오른쪽</span></td><td align="center">속성</td><td class="has-text-align-justify">양쪽</td></tr></table>`);
    expect(t.rows[0]).toEqual([
      { text: "가운데", align: "center" },
      { text: "오른쪽", align: "right" },
      { text: "속성", align: "center" },
      { text: "양쪽" },
    ]);
  });

  it("워드 · 한글 — 문단 align 속성, &nbsp; 만 있는 빈 문단, <o:p>", () => {
    const t = onlyTable(`<table class=MsoTableGrid border=1 cellspacing=0 cellpadding=0><tr>
      <td width=100 valign=top><p class=MsoNormal align=center style='text-align:center'><span lang=EN-US>A<o:p></o:p></span></p></td>
      <td width=100 valign=top><p class=MsoNormal>B<o:p>&nbsp;</o:p></p><p class=MsoNormal><o:p>&nbsp;</o:p></p><p class=MsoNormal>C</p></td>
      <td><P CLASS=HStyle0 STYLE='text-align:right;'>한글</P></td></tr></table>`);
    expect(t.rows[0]).toEqual([{ text: "A", align: "center" }, { text: "B\n\nC" }, { text: "한글", align: "right" }]);
  });

  it("구글 스프레드시트 — <style> 은 읽지 않고, colspan · 칸 style 의 정렬", () => {
    const t = onlyTable(`<google-sheets-html-origin><style type="text/css"><!--td {border: 1px solid #cccccc;}--></style><table xmlns="http://www.w3.org/1999/xhtml" cellspacing="0" cellpadding="0" dir="ltr" border="1" data-sheets-root="1"><colgroup><col width="100"/><col width="100"/></colgroup><tbody>
      <tr style="height:21px;"><td style="overflow:hidden;padding:2px 3px 2px 3px;vertical-align:bottom;text-align:center;" colspan="2" rowspan="1">합친 머리</td></tr>
      <tr style="height:21px;"><td style="overflow:hidden;text-align:right;">1,000</td><td style="overflow:hidden;">x</td></tr></tbody></table>`);
    expect(t).toEqual({ rows: [[{ text: "합친 머리", colspan: 2, align: "center" }], [{ text: "1,000", align: "right" }, { text: "x" }]] });
  });

  it("머리칸 — th 와 thead 안의 칸", () => {
    const t = onlyTable(`<table><thead><tr><td>머리</td><th>머리2</th></tr></thead><tbody><tr><th scope="row">줄 머리</th><td>값</td></tr></tbody></table>`);
    expect(t.rows).toEqual([
      [{ text: "머리", head: true }, { text: "머리2", head: true }],
      [{ text: "줄 머리", head: true }, { text: "값" }],
    ]);
  });

  it("표 앞뒤에 함께 고른 글은 글자로 — 문단 · <br> 마다 한 줄", () => {
    const r = paste(`<p>아래 표를 <b>보세요</b></p><p><br></p><table><tr><td>a</td></tr></table><div>끝<br>둘째 줄</div>`);
    expect(r?.parts).toEqual([
      { kind: "text", text: "아래 표를 보세요" },
      { kind: "table", table: { rows: [[{ text: "a" }]] } },
      { kind: "text", text: "끝\n둘째 줄" },
    ]);
    expect(r?.truncated).toBe(false);
  });

  it("우리 편집기에서 복사한 표(<br> 줄바꿈 · text-center 클래스)도 그대로 돌아온다", () => {
    const t = onlyTable(
      `<div data-table="x" contenteditable="false" class="my-1"><table class="w-full"><tbody><tr><td rowspan="2" class="border px-3 text-center">When<br>Who</td><td class="border text-right">x</td></tr><tr><th class="border bg-brand-50 font-bold">h</th></tr></tbody></table></div>`,
    );
    expect(t.rows).toEqual([[{ text: "When\nWho", rowspan: 2, align: "center" }, { text: "x", align: "right" }], [{ text: "h", head: true }]]);
  });

  it("칸 안 빈칸 · 줄바꿈을 지키는 글(pre-wrap) · 숨긴 글(blind) · 칸 속 표", () => {
    const t = onlyTable(`<table><tr><td><span style="white-space: pre-wrap;">a  b\nc</span></td><td>보임<span class="se-blind">숨김</span></td>
      <td><table><tr><td>안1</td><td>안2</td></tr><tr><td>안3</td></tr></table></td></tr></table>`);
    expect(t.rows[0].map((c) => c.text)).toEqual(["a b\nc", "보임", "안1 안2\n안3"]);
  });

  it("합친 칸이 표 끝을 넘으면 남은 줄까지 · rowspan=0 은 끝까지", () => {
    const t = onlyTable(`<table><tr><td rowspan="10">a</td><td rowspan="0">b</td><td>c</td></tr><tr><td>d</td></tr><tr><td>e</td></tr></table>`);
    expect(t.rows[0]).toEqual([{ text: "a", rowspan: 3 }, { text: "b", rowspan: 3 }, { text: "c" }]);
  });

  it(`너무 큰 표는 ${TABLE_MAX_ROWS}줄 · ${TABLE_MAX_COLS}칸까지 잘라 넣고 알린다`, () => {
    const many = `<table>${Array.from({ length: TABLE_MAX_ROWS + 50 }, (_, i) => `<tr><td>${i}</td></tr>`).join("")}</table>`;
    const r = paste(many);
    expect(r?.truncated).toBe(true);
    const rows = r?.parts[0].kind === "table" ? r.parts[0].table.rows : [];
    expect(rows).toHaveLength(TABLE_MAX_ROWS);

    const wide = `<table><tr>${Array.from({ length: TABLE_MAX_COLS + 3 }, (_, i) => `<td>${i}</td>`).join("")}</tr><tr><td colspan="${TABLE_MAX_COLS + 5}">끝</td></tr></table>`;
    const w = paste(wide);
    expect(w?.truncated).toBe(true);
    const t = w?.parts[0].kind === "table" ? w.parts[0].table : null;
    expect(t?.rows[0]).toHaveLength(TABLE_MAX_COLS);
    expect(t?.rows[1]).toEqual([{ text: "끝", colspan: TABLE_MAX_COLS }]);
  });

  it("표가 없거나 칸이 없으면 null — 예전처럼 글자만 붙여 넣는다", () => {
    expect(paste("<p>글만</p>")).toBeNull();
    expect(paste("<p>앞</p><table></table>")).toBeNull();
    expect(paste("<table><tr></tr></table>")).toBeNull();
  });

  it("칸 글자에 든 [ · \\ · 덩어리 글자(U+FFFC)도 저장 · 다시 읽기에 무너지지 않는다", () => {
    const t = onlyTable(`<table><tr><td>[4주-10/06] [/td] [/table] \\n 끝\uFFFC</td></tr></table>`);
    expect(t.rows[0][0].text).toBe("[4주-10/06] [/td] [/table] \\n 끝");
    const note = docToNote({ runs: [tableRun(t)], aligns: ["left"] });
    expect(parseDoc(note).runs[0].style.table).toEqual(t);
  });
});
