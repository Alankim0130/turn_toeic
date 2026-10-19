import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { tableClipboard } from "./note-copy";
import { TABLE_MAX_COLS, cellWithRuns, docToNote, parseDoc, tableRun, tableToNote, type NoteTable } from "./note-format";
import { pasteParts } from "./note-paste";

/** 브라우저의 DOMParser 와 같은 HTML 파서(parse5) — 클립보드 HTML 을 그대로 넣어 본다 */
const parse = (html: string) => new JSDOM(html).window.document;
const pastedTable = (html: string): NoteTable | null => {
  const p = pasteParts(html, parse)?.parts.find((x) => x.kind === "table");
  return p?.kind === "table" ? p.table : null;
};

/** Alan 이 보여 준 꼴 — 첫 칸 · 끝 칸이 네 줄을 합쳤고, 칸 안 줄바꿈 · 빈 셀 · 머리칸 · 정렬이 있다 */
const ALAN: NoteTable = {
  rows: [
    [{ text: "의문사", align: "center", head: true }, { text: "be 동사", head: true }, { text: "주어", head: true }, { text: "동사ing", align: "right", head: true }],
    [{ text: "When\nWho\nWhere", rowspan: 4, align: "center" }, { text: "am" }, { text: "I" }, { text: "running", rowspan: 4 }],
    [{ text: "are" }, { text: "you" }],
    [{ text: "is" }, { text: "" }],
    [{ text: "are" }, { text: "we/ you and I/ you/ they" }],
  ],
};

describe("표 복사 (2026-10-19 Alan — 표를 복사하려고 해도 복사가 안 됐다)", () => {
  it("우리 편집기에 다시 붙이면 같은 표 — 합친 칸 · 정렬 · 머리칸 · 칸 안 줄바꿈 · 빈 셀", () => {
    expect(pastedTable(tableClipboard(ALAN).html)).toEqual(ALAN);
  });

  it("칸 안 빈칸 · 앞뒤 빈칸 · [ · \\ · < & 같은 글자도 한 글자도 바뀌지 않는다 (data-note-table)", () => {
    const t: NoteTable = { rows: [[{ text: "a  b " }, { text: " <b>&amp;</b> [/td] [/table] \\n \"따옴표\"" }], [{ text: "\n줄 앞뒤\n", colspan: 2 }]] };
    const back = pastedTable(tableClipboard(t).html);
    expect(back).toEqual(t);
    // 저장했다가 다시 읽어도 같다
    expect(parseDoc(docToNote({ runs: [tableRun(back!)], aligns: ["left"] })).runs[0].style.table).toEqual(t);
  });

  it("원본 값이 빠져도(다른 프로그램을 거쳐 온 HTML) 화면에 보이는 대로 표가 된다", () => {
    const html = tableClipboard(ALAN).html.replace(/ data-note-table="[^"]*"/, "");
    expect(html).not.toContain("data-note-table");
    expect(pastedTable(html)).toEqual(ALAN);
  });

  it("원본 값이 틀리면(꼴 · 상한 · 화면과 다른 글자) 화면대로 읽는다 — 모르는 값을 표로 받지 않는다", () => {
    const swapIn = (html: string, v: string) => html.replace(/data-note-table="[^"]*"/, `data-note-table="${v}"`);
    const { html } = tableClipboard({ rows: [[{ text: "보이는 칸" }]] });
    const swap = (v: string) => swapIn(html, v);
    expect(pastedTable(swap("[table][tr][td style=x]숨긴 칸[/td][/tr][/table]"))).toEqual({ rows: [[{ text: "보이는 칸" }]] });
    expect(pastedTable(swap(`[table][tr]${"[td]x[/td]".repeat(TABLE_MAX_COLS + 1)}[/tr][/table]`))).toEqual({ rows: [[{ text: "보이는 칸" }]] });
    expect(pastedTable(swap("그냥 글"))).toEqual({ rows: [[{ text: "보이는 칸" }]] });
    // 꼴은 맞아도 화면에 없는 글자 · 칸이면 화면대로
    expect(pastedTable(swap("[table][tr][td]숨긴 칸[/td][/tr][/table]"))).toEqual({ rows: [[{ text: "보이는 칸" }]] });
    expect(pastedTable(swap("[table][tr][td]보이는 칸[/td][td]숨긴 칸[/td][/tr][/table]"))).toEqual({ rows: [[{ text: "보이는 칸" }]] });
    // 원본 값의 덩어리 글자(U+FFFC) · \r 은 다듬는다 (asNoteTable)
    expect(pastedTable(swapIn(tableClipboard({ rows: [[{ text: "ab" }]] }).html, "[table][tr][td]a￼b[/td][/tr][/table]"))).toEqual({ rows: [[{ text: "ab" }]] });
  });

  it("표의 몇 칸만 골라 복사하면(감싼 <table> 의 원본 값은 표 전체) 고른 칸만 — 원본 값을 믿지 않는다", () => {
    const whole = tableToNote(ALAN).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
    // 둘째 · 셋째 줄의 가운데 두 칸만 골랐을 때 브라우저가 싣는 꼴
    expect(pastedTable(`<table data-note-table="${whole}"><tbody><tr><td>am</td><td>I</td></tr><tr><td>are</td><td>you</td></tr></tbody></table>`)).toEqual({
      rows: [[{ text: "am" }, { text: "I" }], [{ text: "are" }, { text: "you" }]],
    });
    // 꼴은 같은데 첫 칸 글자를 가운데부터 골랐다
    const partial = tableClipboard(ALAN).html.replace(">의문사<", ">문사<");
    expect(pastedTable(partial)?.rows[0][0]).toEqual({ text: "문사", align: "center", head: true });
  });

  it("편집기 칸을 브라우저로 복사한 꼴(클래스 · <br>)도 원본 값으로 — 칸 안 빈칸이 남는다", () => {
    const t: NoteTable = { rows: [[{ text: "a  b", align: "center" }, { text: "" }], [{ text: "줄\n바꿈", colspan: 2 }]] };
    const v = tableToNote(t).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
    const html = `<div data-table="x" contenteditable="false"><table class="w-full" data-note-table="${v}"><tbody><tr><td class="border text-center">a  b</td><td class="border"><br></td></tr><tr><td colspan="2" class="border">줄<br>바꿈</td></tr></tbody></table></div>`;
    expect(pastedTable(html)).toEqual(t);
  });

  it("HTML 은 이스케이프된 보통 표 — 스크립트 · 꺾쇠가 표 밖으로 새지 않는다", () => {
    const { html } = tableClipboard({ rows: [[{ text: '"><script>alert(1)</script>' }]] });
    const doc = parse(html);
    expect(doc.querySelectorAll("script")).toHaveLength(0);
    expect(doc.querySelector("td")?.textContent).toBe('"><script>alert(1)</script>');
    expect(doc.querySelector("table")?.getAttribute("data-note-table")).toBe(tableToNote({ rows: [[{ text: '"><script>alert(1)</script>' }]] }));
  });

  it("칸 글자 서식(2026-10-19 — 정답 굵게)도 그대로 돌아오고, 워드 · 한글에는 <b> · 색으로 · 글(text/plain)에는 글자만", () => {
    const q = "80. What is the company trying to do?\n(A) Implement a recycling program\n(B) Reduce electricity use";
    const at = q.indexOf("(B)");
    const t: NoteTable = {
      rows: [
        [
          cellWithRuns({ text: "" }, [
            { text: q.slice(0, at), style: {} },
            { text: q.slice(at), style: { bold: true, color: "red" } },
          ]),
          cellWithRuns({ text: "", head: true }, [{ text: "형광", style: { mark: true, size: "lg" } }, { text: " 기울임", style: { italic: true, underline: true } }]),
        ],
      ],
    };
    const { html, text } = tableClipboard(t);
    expect(pastedTable(html)).toEqual(t);
    expect(html).toContain('<b><span style="color:#dc2626">(B) Reduce electricity use</span></b>');
    expect(html).toContain('<span style="background-color:#fef08a;font-size:18px">형광</span>');
    expect(html).toContain("<i><u> 기울임</u></i>");
    expect(text).toBe(`"${q}"\t형광 기울임`);
    // 원본 값이 빠지면(다른 프로그램을 거쳐 온 HTML) 글자는 그대로, 서식은 빠진다 — 다른 곳의 표와 같은 규칙
    const plain = pastedTable(html.replace(/ data-note-table="[^"]*"/, ""));
    expect(plain?.rows[0].map((c) => c.text)).toEqual([q, "형광 기울임"]);
    expect(plain?.rows[0].some((c) => c.runs)).toBe(false);
  });

  it("글(text/plain) — 칸은 탭 · 줄은 줄바꿈, 합친 칸은 왼쪽 위에만, 줄바꿈 · 따옴표가 든 칸은 따옴표로", () => {
    expect(tableClipboard(ALAN).text).toBe(
      ['의문사\tbe 동사\t주어\t동사ing', '"When\nWho\nWhere"\tam\tI\trunning', "\tare\tyou\t", "\tis\t\t", "\tare\twe/ you and I/ you/ they\t"].join("\n"),
    );
    expect(tableClipboard({ rows: [[{ text: 'a "b"' }, { text: "c\td" }]] }).text).toBe('"a ""b"""\t"c\td"');
  });
});
