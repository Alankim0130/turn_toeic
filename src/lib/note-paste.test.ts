import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { TABLE_MAX_COLS, TABLE_MAX_ROWS, docToNote, parseDoc, runsText, tableRun, type NoteRun, type NoteTable } from "./note-format";
import { pasteParts, pastedTextRuns } from "./note-paste";

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

  it("표 앞뒤에 함께 고른 글은 글자로 — 문단 · <br> 마다 한 줄, 굵게는 그대로", () => {
    const r = paste(`<p>아래 표를 <b>보세요</b></p><p><br></p><table><tr><td>a</td></tr></table><div>끝<br>둘째 줄</div>`);
    expect(r?.parts).toEqual([
      { kind: "text", text: "아래 표를 보세요", runs: [{ text: "아래 표를 ", style: {} }, { text: "보세요", style: { bold: true } }] },
      { kind: "table", table: { rows: [[{ text: "a" }]] } },
      { kind: "text", text: "끝\n둘째 줄" },
    ]);
    expect(r?.truncated).toBe(false);
  });

  it("우리 편집기에서 복사한 표(<br> 줄바꿈 · text-center 클래스)도 그대로 돌아온다", () => {
    const t = onlyTable(
      `<div data-table="x" contenteditable="false" class="my-1"><table class="w-full"><tbody><tr><td rowspan="2" class="border px-3 text-center">When<br>Who</td><td class="border text-right">x</td></tr><tr><th class="border bg-brand-50 font-bold">h</th></tr><tr><td class="border"><br></td><td class="border"><br></td></tr></tbody></table></div>`,
    );
    // 빈 셀은 한 줄 높이를 지키려고 <br> 하나를 품는다 — 붙여 넣으면 다시 빈 셀이다
    expect(t.rows).toEqual([[{ text: "When\nWho", rowspan: 2, align: "center" }, { text: "x", align: "right" }], [{ text: "h", head: true }], [{ text: "" }, { text: "" }]]);
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

  it("표도 서식도 없으면 null — 예전처럼 글자만 붙여 넣는다", () => {
    expect(paste("<p>글만</p>")).toBeNull();
    expect(paste("<p>앞</p><table></table>")).toBeNull();
    expect(paste("<table><tr></tr></table>")).toBeNull();
    // 크롬은 복사한 글마다 font-weight: 400 을 붙인다 — 굵은 글자가 없으면 그대로 글자만
    expect(paste(`<meta charset='utf-8'><span style="color: rgb(0, 0, 0); font-weight: 400; text-decoration-thickness: initial; text-decoration-style: initial;">보통 글</span>`)).toBeNull();
    // 빈칸에만 걸린 굵게 · 밑줄은 서식이 아니다
    expect(paste("<p>a<b> </b>b<u>&nbsp;</u></p>")).toBeNull();
  });

  it("칸 글자에 든 [ · \\ · 덩어리 글자(U+FFFC)도 저장 · 다시 읽기에 무너지지 않는다", () => {
    const t = onlyTable(`<table><tr><td>[4주-10/06] [/td] [/table] \\n 끝\uFFFC</td></tr></table>`);
    expect(t.rows[0][0].text).toBe("[4주-10/06] [/td] [/table] \\n 끝");
    const note = docToNote({ runs: [tableRun(t)], aligns: ["left"] });
    expect(parseDoc(note).runs[0].style.table).toEqual(t);
  });
});

/** 글 조각을 한 줄 글로 — `**굵게**` · `_기울임_` · `__밑줄__` (시험에서 읽기 쉽게) */
const marked = (runs: readonly NoteRun[]) =>
  runs
    .map((r) => {
      let t = r.text;
      if (r.style.underline) t = `__${t}__`;
      if (r.style.italic) t = `_${t}_`;
      if (r.style.bold) t = `**${t}**`;
      return t;
    })
    .join("");
const textRuns = (html: string): NoteRun[] => {
  const r = paste(html);
  const t = r?.parts.find((p) => p.kind === "text");
  if (!t || t.kind !== "text") throw new Error("글이 없다");
  return t.runs ?? [{ text: t.text, style: {} }];
};

/** 크롬이 복사한 글의 바깥 style — 고른 글을 감싼 요소의 서식을 풀어 적는다 (font-weight: 400 · white-space: normal …) */
const CHROME_WRAP =
  "color: rgb(0, 0, 0); font-family: se-nanumgothic, sans-serif; font-size: 15px; font-style: normal; font-variant-ligatures: normal; font-variant-caps: normal; font-weight: 400; letter-spacing: normal; orphans: 2; text-align: start; text-indent: 0px; text-transform: none; widows: 2; word-spacing: 0px; -webkit-text-stroke-width: 0px; white-space: normal; background-color: rgb(255, 255, 255); text-decoration-thickness: initial; text-decoration-style: initial; text-decoration-color: initial;";
/** 네이버 블로그(SmartEditor ONE) 글 한 문단 — 굵은 글은 문단 안의 <b> */
const seP = (inner: string) => `<p class="se-text-paragraph se-text-paragraph-align- " style="" id="SE-p"><span style="" class="se-fs- se-ff-   " id="SE-s">${inner}</span></p>`;
const NAVER_TEXT = `<meta charset='utf-8'><div class="se-module se-module-text" style="${CHROME_WRAP}">${[
  seP("3. Who most likely is Mr. Johnson?"),
  seP("(A) A new employee."),
  seP("(B) A potential client."),
  seP("<b>(C) One of your colleagues.</b>"),
  seP("(D) A supplier."),
  seP("\u200B"),
  seP("4. What does the speaker ask the listener to do?"),
  seP("(A) Send a document."),
  `<p class="se-text-paragraph" style=""><b><span class="se-fs- se-ff-" style="">(B) Call him back.</span></b></p>`,
].join("")}</div>`;
/** 같은 글의 text/plain — 크롬이 문단마다 한 줄, 빈 문단은 U+200B 한 줄로 준다 */
const NAVER_PLAIN = [
  "3. Who most likely is Mr. Johnson?",
  "(A) A new employee.",
  "(B) A potential client.",
  "(C) One of your colleagues.",
  "(D) A supplier.",
  "\u200B",
  "4. What does the speaker ask the listener to do?",
  "(A) Send a document.",
  "(B) Call him back.",
].join("\n");

describe("붙여 넣은 글의 굵게 · 기울임 · 밑줄 (2026-10-20 Alan — 네이버 블로그의 굵은 정답이 사라졌다)", () => {
  it("네이버 블로그 — 굵은 정답은 굵게, 빈 문단은 빈 줄", () => {
    expect(marked(textRuns(NAVER_TEXT))).toBe(
      [
        "3. Who most likely is Mr. Johnson?",
        "(A) A new employee.",
        "(B) A potential client.",
        "**(C) One of your colleagues.**",
        "(D) A supplier.",
        "",
        "4. What does the speaker ask the listener to do?",
        "(A) Send a document.",
        "**(B) Call him back.**",
      ].join("\n"),
    );
  });

  it("구글 문서 — 전체를 감싼 <b style=font-weight:normal> 는 굵게가 아니다, 700 · italic · underline 은 그대로", () => {
    const span = (css: string, text: string) =>
      `<span style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;${css}font-variant:normal;vertical-align:baseline;white-space:pre;white-space:pre-wrap;">${text}</span>`;
    const html = `<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1a2b3c4d-7fff-1234-5678-9abcdef01234"><p dir="ltr" style="line-height:1.38;margin-top:0pt;margin-bottom:0pt;">${span(
      "font-weight:400;font-style:normal;text-decoration:none;",
      "정답은 ",
    )}${span("font-weight:700;font-style:normal;text-decoration:none;", "(C)")}${span("font-weight:400;font-style:italic;text-decoration:none;", "입니다")}</p><br><p dir="ltr" style="line-height:1.38;margin-top:0pt;margin-bottom:0pt;">${span(
      "font-weight:400;font-style:normal;text-decoration:underline;-webkit-text-decoration-skip:none;text-decoration-skip-ink:none;",
      "밑줄",
    )}</p></b><br class="Apple-interchange-newline">`;
    expect(marked(textRuns(html))).toBe("정답은 **(C)**_입니다_\n\n__밑줄__");
  });

  it("워드 — <b> 는 굵게, <b> 안의 font-weight:normal 은 보통 (mso-… 는 읽지 않는다)", () => {
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office"><head><style><!-- p.MsoNormal {margin:0cm; font-family:"맑은 고딕";} a:link, span.MsoHyperlink {color:#0563C1; text-decoration:underline;} --></style></head><body lang=KO style='word-wrap:break-word'><!--StartFragment-->
<p class=MsoNormal><span lang=EN-US>3. Who is it?<o:p></o:p></span></p>
<p class=MsoNormal><b><span lang=EN-US>(C) One of your colleagues.</span></b><span lang=EN-US><o:p></o:p></span></p>
<p class=MsoNormal><b><span lang=EN-US style='font-weight:normal;mso-bidi-font-weight:bold'>(D) 보통</span></b><i><span style='mso-bidi-font-style:normal'> 기울임</span></i></p>
<!--EndFragment--></body></html>`;
    expect(marked(textRuns(html))).toBe("3. Who is it?\n**(C) One of your colleagues.**\n(D) 보통_ 기울임_");
  });

  it("한글 — 따옴표로 감싼 값(font-weight:\"bold\")", () => {
    const html = `<P CLASS=HStyle0 STYLE='text-align:left;'><SPAN STYLE='font-family:"한컴바탕";font-weight:"bold"'>굵게</SPAN><SPAN STYLE='font-style:"italic"'>기울임</SPAN><SPAN STYLE='text-decoration:"underline"'>밑줄</SPAN></P>`;
    expect(marked(textRuns(html))).toBe("**굵게**_기울임___밑줄__");
  });

  it("우리 편집기에서 복사한 글 — data-note 로 색 · 크기 · 형광펜까지, 모르는 값 · 그림 · 표 · 깨진 값은 뺀다", () => {
    const note = (o: object) => JSON.stringify(o).replace(/"/g, "&quot;");
    const html = `<meta charset='utf-8'><div style="white-space: pre-wrap; font-weight: 400;"><div data-align="left" class="text-left">해설: <span class="font-bold text-red-600" data-note="${note({ bold: true, color: "red" })}" style="font-weight: 700; color: rgb(220, 38, 38);">(C)</span> <span data-note="${note({ mark: true, size: "lg", color: "purple", img: { path: "x", w: 50 } })}">형광</span><span data-note="{깨짐">그대로</span></div></div>`;
    expect(textRuns(html)).toEqual([
      { text: "해설: ", style: {} },
      { text: "(C)", style: { bold: true, color: "red" } },
      { text: " ", style: {} },
      { text: "형광", style: { mark: true, size: "lg" } },
      { text: "그대로", style: {} },
    ]);
  });

  it("제목(h1~h6)은 굵게 — 다만 style 의 굵기(500)가 이긴다", () => {
    expect(marked(textRuns(`<h3>제목</h3><h2 style="font-weight: 500">중간</h2><p>본문</p>`))).toBe("**제목**\n중간\n본문");
  });

  it("굵기 숫자 · bolder · lighter · !important · 대문자 · initial · inherit", () => {
    expect(
      marked(
        textRuns(
          `<p><span style="font-weight: 600">a</span><span style="font-weight: 500">b</span><strong style="font-weight: bolder">c</strong><b style="font-weight: lighter">d</b><span style="FONT-WEIGHT: BOLD !important">e</span><b><span style="font-weight: initial">f</span><span style="font-weight: inherit">g</span><span style="font-weight: unset">h</span></b></p>`,
        ),
      ),
    ).toBe("**a**b**c**d**e**f**gh**");
  });

  it("기울임 — em · i · oblique, font-style: normal 은 보통", () => {
    expect(marked(textRuns(`<p><em>a</em><span style="font-style: oblique 10deg">b</span><i style="font-style: normal">c</i><cite>d</cite></p>`))).toBe("_ab_c_d_");
  });

  it("font 줄임말 — 굵기 · 기울기를 적지 않으면 보통으로 되돌린다 (CSS 와 같다)", () => {
    expect(
      marked(textRuns(`<p><span style="font: italic bold 12px/30px Georgia, serif">x</span><b><span style="font: 12px serif">y</span><span style="font: inherit">z</span></b></p>`)),
    ).toBe("**_x_**y**z**");
  });

  it("밑줄 — 자식이 지우지 못하고(CSS 와 같다), 링크 자신의 밑줄은 빼고, 밑줄 안의 링크는 밑줄", () => {
    expect(
      marked(
        textRuns(
          `<p><u>a<span style="text-decoration: none">b</span></u> <a href="https://x.test" style="text-decoration: underline; font-weight: 700">링크</a> <u>밑<a href="#">줄</a></u> <span style="text-decoration-line: underline line-through">c</span><ins>d</ins></p>`,
        ),
      ),
    ).toBe("__ab__ **링크** __밑줄__ __cd__");
  });

  it("서식이 갈리는 자리의 빈칸도 하나로 — 앞 빈칸의 서식이 남는다", () => {
    expect(textRuns(`<p>정답: <b> (C) </b> 입니다</p>`)).toEqual([
      { text: "정답: ", style: {} },
      { text: "(C) ", style: { bold: true } },
      { text: "입니다", style: {} },
    ]);
  });

  it("표 칸 — 표 · 줄 · 칸의 서식을 물려받고, 머리칸은 굵게를 뺀다(머리칸이 이미 굵다)", () => {
    const t = onlyTable(`<table style="font-weight: bold"><tr><td>a</td><td style="font-weight: normal">b <b>c</b></td><th>머리 <i>기울임</i></th></tr><tr><td><u>밑줄</u></td></tr></table>`);
    expect(t.rows).toEqual([
      [
        { text: "a", runs: [{ text: "a", style: { bold: true } }] },
        { text: "b c", runs: [{ text: "b ", style: {} }, { text: "c", style: { bold: true } }] },
        { text: "머리 기울임", runs: [{ text: "머리 ", style: {} }, { text: "기울임", style: { italic: true } }], head: true },
      ],
      [{ text: "밑줄", runs: [{ text: "밑줄", style: { bold: true, underline: true } }] }],
    ]);
    // 저장했다가 다시 읽어도 같다
    expect(parseDoc(docToNote({ runs: [tableRun(t)], aligns: ["left"] })).runs[0].style.table).toEqual(t);
  });

  it("네이버 표 칸의 굵은 정답", () => {
    const t = onlyTable(`<table class="se-table-content"><tbody><tr class="se-tr"><td class="se-cell"><div class="se-module se-module-text">${seP("80. What is the company trying to do?")}${seP("(A) Implement a recycling program")}${seP("<b>(B) Reduce electricity use</b>")}</div></td></tr></tbody></table>`);
    expect(marked(t.rows[0][0].runs ?? [])).toBe("80. What is the company trying to do?\n(A) Implement a recycling program\n**(B) Reduce electricity use**");
  });
});

describe("표가 없는 붙여 넣기 — 글자 · 줄은 text/plain 그대로, 서식만 얹는다 (pastedTextRuns)", () => {
  const runs = (html: string, plain: string) => {
    const r = paste(html);
    if (!r) throw new Error("서식이 없다");
    return pastedTextRuns(r, plain);
  };

  it("네이버 블로그 — text/plain 의 줄 그대로, 굵은 정답의 낱말 사이 빈칸까지 굵게, 빈 문단의 U+200B 는 뺀다", () => {
    const out = runs(NAVER_TEXT, NAVER_PLAIN);
    expect(runsText(out)).toBe(NAVER_PLAIN.replace("\u200B", ""));
    expect(out).toContainEqual({ text: "(C) One of your colleagues.", style: { bold: true } });
    expect(out).toContainEqual({ text: "(B) Call him back.", style: { bold: true } });
    expect(out.filter((r) => r.style.bold).map((r) => r.text)).toEqual(["(C) One of your colleagues.", "(B) Call him back."]);
  });

  it("문단 사이 빈 줄 · 두 칸 빈칸 · 줄 앞 빈칸은 text/plain 이 준 그대로 (예전 붙여 넣기와 같다)", () => {
    expect(runs(`<p style="margin: 0 0 1em">정답 <b>(C)</b></p><p>해설</p>`, "정답 (C)\n\n해설")).toEqual([
      { text: "정답 ", style: {} },
      { text: "(C)", style: { bold: true } },
      { text: "\n\n해설", style: {} },
    ]);
    expect(runs(`<div style="white-space: pre-wrap"><div>  a  <b>b c</b>  d</div></div>`, "  a  b c  d")).toEqual([
      { text: "  a  ", style: {} },
      { text: "b c", style: { bold: true } },
      { text: "  d", style: {} },
    ]);
  });

  it("빈칸은 앞뒤 글자가 같은 서식일 때만 그 서식 — 줄바꿈은 서식이 없다", () => {
    expect(runs(`<p><i>a b</i> c</p><p><i>d</i></p>`, "a b c\nd")).toEqual([
      { text: "a b", style: { italic: true } },
      { text: " c\n", style: {} },
      { text: "d", style: { italic: true } },
    ]);
  });

  it("\r\n 줄바꿈도 받는다 (윈도우)", () => {
    expect(runsText(runs(`<p><b>a</b></p><p>b</p>`, "a\r\nb"))).toBe("a\nb");
  });

  it("text/plain 과 글자가 어긋나면(목록 기호 · 숨긴 글) HTML 에서 읽은 줄 그대로 — 굵게는 남는다", () => {
    const html = `<ul><li><b>하나</b></li><li>둘</li></ul>`;
    expect(runs(html, "• 하나\n• 둘")).toEqual([
      { text: "하나", style: { bold: true } },
      { text: "\n둘", style: {} },
    ]);
    // text/plain 이 비었으면(HTML 만 실린 클립보드)
    expect(runs(html, "")).toEqual([
      { text: "하나", style: { bold: true } },
      { text: "\n둘", style: {} },
    ]);
  });

  it("이모지를 잇는 글자(U+200D)는 둔다", () => {
    const family = "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}";
    expect(runsText(runs(`<p><b>가족</b> ${family}</p>`, `가족 ${family}`))).toBe(`가족 ${family}`);
  });
});
