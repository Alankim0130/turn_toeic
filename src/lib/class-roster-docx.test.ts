import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { buildClassRoster, rosterDisposition, rosterFileName } from "./class-roster";
import { BODY_MM, buildClassRosterDocx, emWidth, sheetHeightMm, xmlText } from "./class-roster-docx";
import { buildClassRosterPdf } from "./class-roster-pdf";
import { HEAD_H, NAME_PT, planRosterSheets, ROW_H, ROWS_PER_PAGE, unplacedNote } from "./class-roster-sheets";
import { NAMES, rosterOf, sec, trackRosterOf } from "./__fixtures__/class-roster-fixtures";
import { unzip } from "./__fixtures__/unzip";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * 학생명단 Word 받기 (2026-10-15 Alan "학생명단 워드로도 다운받을 수 있게 부탁해").
 * PDF 와 같은 쪽 · 같은 칸을 고쳐 쓸 수 있는 Word 표로 준다. Word 는 XML 요소 순서가 틀리면 파일을 못 열어서,
 * 손댈 때는 docx 스킬의 validate.py(XSD)로 다시 확인한다 — 이 테스트는 구조 · 쪽 · 글자를 본다.
 */

const font = new Uint8Array(readFileSync(path.join(process.cwd(), "assets/roster-fonts/roster-bold.ttf")));
const META = { period: "10/6 개강 ~ 11/3 종강", printedAt: "2026-10-15 13:05", createdAt: new Date("2026-10-15T04:05:00Z") };
const docxOf = (roster: ReturnType<typeof rosterOf>, title = "2026년 10월 반별 명단") => buildClassRosterDocx({ roster, title, ...META });
const pdfOf = (roster: ReturnType<typeof rosterOf>, title = "2026년 10월 반별 명단") => buildClassRosterPdf({ roster, title, period: META.period, printedAt: META.printedAt, font });

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const xml = (s: string) => new JSDOM(s, { contentType: "application/xml" }).window.document;
/** .docx → 부품 이름 → 글 */
const partsOf = (bytes: Uint8Array) => new Map(unzip(bytes).map((f) => [f.name, f.data.toString("utf8")]));
const all = (el: Document | Element, tag: string) => [...el.getElementsByTagNameNS(W, tag)];
const attr = (el: Element, name: string) => el.getAttributeNS(W, name);
const textOf = (el: Element) => all(el, "t").map((t) => t.textContent ?? "").join("");
/** 본문 표 — 칸 머리 줄 + 이름 줄 */
const tablesOf = (doc: Document) => all(doc, "tbl");
const rowsOf = (tbl: Element) => [...tbl.children].filter((c) => c.localName === "tr");
const cellsOf = (tr: Element) => [...tr.children].filter((c) => c.localName === "tc");

describe("Word 파일 꼴 (.docx = XML 부품을 묶은 ZIP)", () => {
  const out = docxOf(rosterOf([12, 9, 15, 0, 6, 3]));
  const files = unzip(out.bytes);
  const parts = partsOf(out.bytes);

  it("[Content_Types].xml 이 맨 앞 · 부품이 다 있고 XML 이 바르다", () => {
    expect(files[0].name).toBe("[Content_Types].xml");
    expect(files.map((f) => f.name).sort()).toEqual(
      ["[Content_Types].xml", "_rels/.rels", "docProps/app.xml", "docProps/core.xml", "word/_rels/document.xml.rels", "word/document.xml", "word/footer1.xml", "word/header1.xml", "word/settings.xml", "word/styles.xml"].sort(),
    );
    for (const [name, body] of parts) expect(() => xml(body), name).not.toThrow();
  });

  it("형식 목록 · 관계가 가리키는 부품이 모두 있다", () => {
    const types = xml(parts.get("[Content_Types].xml")!);
    for (const o of [...types.getElementsByTagName("Override")]) expect(parts.has(o.getAttribute("PartName")!.slice(1)), o.getAttribute("PartName")!).toBe(true);
    const root = xml(parts.get("_rels/.rels")!);
    for (const r of [...root.getElementsByTagName("Relationship")]) expect(parts.has(r.getAttribute("Target")!)).toBe(true);
    const rels = xml(parts.get("word/_rels/document.xml.rels")!);
    const ids = new Map([...rels.getElementsByTagName("Relationship")].map((r) => [r.getAttribute("Id")!, r.getAttribute("Target")!]));
    for (const target of ids.values()) expect(parts.has(`word/${target}`), target).toBe(true);
    // 본문의 머리글 · 바닥글이 관계 id 로 이어진다
    const doc = xml(parts.get("word/document.xml")!);
    const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
    expect(ids.get(all(doc, "headerReference")[0].getAttributeNS(R, "id")!)).toBe("header1.xml");
    expect(ids.get(all(doc, "footerReference")[0].getAttributeNS(R, "id")!)).toBe("footer1.xml");
  });

  it("A4 세로 · 좌우 여백 10mm (PDF 와 같은 190mm 본문) · 한글 · 영문 사이 자동 간격 끔", () => {
    const doc = xml(parts.get("word/document.xml")!);
    const pgSz = all(doc, "pgSz")[0];
    expect([attr(pgSz, "w"), attr(pgSz, "h"), attr(pgSz, "orient")]).toEqual(["11906", "16838", null]);
    const pgMar = all(doc, "pgMar")[0];
    expect([attr(pgMar, "left"), attr(pgMar, "right")]).toEqual(["567", "567"]);
    // 머리글(6mm + 제목 줄 7mm) · 바닥글(6mm + 4mm)이 본문 여백 안에 든다 — 넘치면 Word 가 본문을 밀어 쪽이 넘친다
    expect(Number(attr(pgMar, "header")) + 397).toBeLessThan(Number(attr(pgMar, "top")));
    expect(Number(attr(pgMar, "footer")) + 227).toBeLessThan(Number(attr(pgMar, "bottom")));
    for (const tbl of tablesOf(doc)) expect(Number(attr(all(tbl, "tblW")[0], "w"))).toBeLessThanOrEqual(11906 - 567 * 2);
    expect(parts.get("word/styles.xml")).toContain('<w:autoSpaceDE w:val="0"/><w:autoSpaceDN w:val="0"/>');
    expect(parts.get("word/styles.xml")).toContain('w:eastAsia="맑은 고딕"');
  });

  it("머리글 = 제목 · 기간 · 출력 시각, 바닥글 = 학생명단 · 쪽 번호(PAGE / NUMPAGES)", () => {
    const header = xml(parts.get("word/header1.xml")!);
    expect(textOf(header.documentElement)).toBe("2026년 10월 반별 명단10/6 개강 ~ 11/3 종강 · 2026-10-15 13:05 출력");
    const footer = parts.get("word/footer1.xml")!;
    expect(textOf(xml(footer).documentElement)).toContain("역전토익 학생명단 · 반별");
    expect(footer).toContain("> PAGE <");
    expect(footer).toContain("> NUMPAGES <");
    expect(parts.get("docProps/core.xml")).toContain("<dc:title>2026년 10월 반별 명단</dc:title>");
    expect(parts.get("docProps/core.xml")).toContain("2026-10-15T04:05:00Z");
  });
});

describe("PDF 와 같은 쪽 — 쪽 나눔은 class-roster-sheets.ts 한곳", () => {
  const cases: [string, ReturnType<typeof rosterOf>][] = [
    ["작은 명단 · 학생이 없는 반", rosterOf([12, 9, 15, 0, 6, 3])],
    ["큰 칸 (45명 → 23 + 22) · 이어지는 쪽", rosterOf([45, 20, 41, 30, 60, 60])],
    ["학생이 없는 레벨 → 마지막 쪽", rosterOf([5, 5, 0, 0, 4, 4])],
    ["칸이 많은 레벨 → 나눠 이어 그림", rosterOf([3, 3, 3, 3, 3, 3, 3], [], 7)],
    ["레벨별 명단 (두 단 · 83명 → 두 쪽)", trackRosterOf([[83, 10], [4, 0]])],
  ];

  it.each(cases)("%s — 쪽 수 · 레벨 · 칸 · 이어지는 쪽 · 학생이 없는 반이 같다", async (_, roster) => {
    const docx = docxOf(roster);
    const pdf = await pdfOf(roster);
    expect(docx.pages).toBe(pdf.pages);
    expect(docx.layout.map(({ level, columns, part }) => ({ level, columns, part }))).toEqual(pdf.layout.map(({ level, columns, part }) => ({ level, columns, part })));
    expect(docx.layout.map((p) => p.note)).toEqual(pdf.layout.map((p) => (p.footer.startsWith("학생이 없는") ? p.footer : "")));
  });

  it("레벨마다 새 쪽 — 쪽 나누기는 쪽 수보다 하나 적고 · NUMPAGES 에 쪽 수를 미리 적는다", () => {
    const docx = docxOf(rosterOf([45, 20, 41, 30, 60, 60]));
    const parts = partsOf(docx.bytes);
    const doc = xml(parts.get("word/document.xml")!);
    expect(all(doc, "pageBreakBefore")).toHaveLength(docx.pages - 1);
    expect(tablesOf(doc)).toHaveLength(docx.pages);
    expect(parts.get("word/footer1.xml")).toContain(`<w:t>${docx.pages}</w:t>`);
    expect(parts.get("docProps/app.xml")).toContain(`<Pages>${docx.pages}</Pages>`);
    // 본문은 글줄로 끝난다 (표로 끝나면 Word 가 빈 글줄을 덧붙이다 빈 쪽이 생길 수 있다)
    const body = all(doc, "body")[0];
    const last = [...body.children].filter((c) => c.localName !== "sectPr").pop()!;
    expect(last.localName).toBe("p");
  });
});

describe("칸을 찾지 못한 학생 — 종이에도 적는다 (2026-10-16 점검)", () => {
  it("맨 마지막 쪽(PDF 는 바닥 글, Word 는 표 아래)에 'N명은 이 명단에 없어요' — 화면처럼. 없으면 아무것도 붙이지 않는다", async () => {
    const roster = { ...rosterOf([3, 2, 4, 0]), unplaced: 2 };
    const sheets = planRosterSheets(roster);
    expect(sheets.length).toBeGreaterThan(1);
    // 학생이 없는 반 글보다 앞에 · 마지막 쪽에만
    expect(sheets.at(-1)!.note.startsWith(`${unplacedNote(2)} · 학생이 없는`)).toBe(true);
    expect(sheets.slice(0, -1).some((x) => x.note.includes("칸을 찾지 못한"))).toBe(false);
    const pdf = await pdfOf(roster);
    expect(pdf.layout.at(-1)!.footer).toContain(unplacedNote(2));
    const docx = docxOf(roster);
    expect(docx.layout.at(-1)!.note).toContain(unplacedNote(2));
    expect(docx.text.join("")).toContain(unplacedNote(2));
    // 칸을 못 찾은 학생이 없으면 예전 그대로
    expect(planRosterSheets(rosterOf([3, 2, 4, 0])).some((x) => x.note.includes("칸을 찾지 못한"))).toBe(false);
  });
});

describe("한 쪽에 41줄 · 이름은 늘 10pt (2026-10-14 Alan \"글자크기는 10으로 해줘\")", () => {
  it("한 쪽 높이 — 41줄 + 학생이 없는 반 두 줄이 들고도 남는다 (Word · 한컴이 표 선을 줄 높이에 더해도)", () => {
    expect(ROWS_PER_PAGE).toBe(41);
    expect(sheetHeightMm(ROWS_PER_PAGE)).toBeLessThanOrEqual(BODY_MM - 9);
    expect(sheetHeightMm(ROWS_PER_PAGE, 2)).toBeLessThanOrEqual(BODY_MM - 3);
  });

  it("줄 높이는 PDF 와 같다 (이름 줄 5.6mm · 칸 머리 12.5mm) — '최소' 높이라 고쳐 쓰다 길어지면 잘리지 않고 커진다", () => {
    const doc = xml(partsOf(docxOf(rosterOf([12, 9])).bytes).get("word/document.xml")!);
    const rows = rowsOf(tablesOf(doc)[0]);
    const heights = rows.map((tr) => all(tr, "trHeight")[0]);
    expect(heights.every((h) => attr(h, "hRule") === "atLeast")).toBe(true);
    expect(attr(heights[0], "val")).toBe(String(Math.round(HEAD_H * (1440 / 25.4))));
    expect(new Set(heights.slice(1).map((h) => attr(h, "val")))).toEqual(new Set([String(Math.round(ROW_H * (1440 / 25.4)))]));
    // 칸 머리 줄은 표가 다음 쪽으로 넘어가면 다시 선다
    expect(all(rows[0], "tblHeader")).toHaveLength(1);
    expect(rows.slice(1).every((tr) => all(tr, "tblHeader").length === 0)).toBe(true);
  });

  it("학생이 몇 명이든 쓰인 글자 크기가 같다 — 이름 10pt (예전 PDF 처럼 줄이지 않는다)", () => {
    // 글자 조각(w:r)의 크기만 — 문서 끝 아주 작은 글줄(1pt)의 글줄 표시는 글자가 아니다
    const sizes = (bytes: Uint8Array) =>
      [...new Set(all(xml(partsOf(bytes).get("word/document.xml")!), "r").flatMap((r) => all(r, "sz").map((s) => Number(attr(s, "val")) / 2)))].sort((a, b) => a - b);
    // 칸 둘째 줄 7 · 범례 7.5 · 시간 · 표시 8 · 학생 수 9.5 · 이름 · 칸 이름 10 · 레벨 18 (본문 기준. 제목 14 는 머리글)
    const fixed = [7, 7.5, 8, 9.5, 10, 18];
    const small = docxOf(rosterOf([8, 6, 5, 4]));
    const big = docxOf(rosterOf([45, 20, 38, 30, 60, 60]));
    expect(sizes(small.bytes)).toEqual(fixed);
    expect(sizes(big.bytes)).toEqual(fixed);
    expect(big.shrunk).toEqual([]);
    expect(NAME_PT).toBe(10);
  });

  it("이름이 칸보다 길면 그 이름만 줄인다 — 한국 이름은 여섯 칸 레벨에서도 10pt", () => {
    const six = docxOf(rosterOf([3, 3, 3, 3, 3, 3], [{ name: "아주아주아주아주긴이름입니다", sectionIndex: 0 }], 6));
    expect(six.shrunk).toHaveLength(1);
    expect(six.shrunk[0].startsWith("아주아주")).toBe(true);
    const doc = xml(partsOf(six.bytes).get("word/document.xml")!);
    const runs = all(doc, "r").filter((r) => all(r, "t").some((t) => /^[가-힣]+\d*$/.test(t.textContent ?? "")));
    const sizeOf = (r: Element) => Number(attr(all(r, "sz")[0], "val")) / 2;
    const long = runs.find((r) => textOf(r) === "아주아주아주아주긴이름입니다")!;
    expect(sizeOf(long)).toBeLessThan(10);
    expect(runs.filter((r) => r !== long).every((r) => sizeOf(r) === 10)).toBe(true);
  });

  it("글자 폭 짐작 — 한글 1 · 영문 · 숫자 0.6 ~ 0.7 · 빈칸 0.33", () => {
    expect(emWidth("가나다")).toBe(3);
    expect(emWidth("650A")).toBeCloseTo(2.5);
    expect(emWidth(" ")).toBeCloseTo(0.33);
    expect(emWidth("(불/RC)")).toBeCloseTo(0.4 * 3 + 1 + 0.7 * 2);
  });
});

describe("표 — 칸 · 이름 · 표시", () => {
  it("이름은 한 칸에 한 사람 · 가나다순 · 칸 머리 둘째 줄 · 표시 (불/LC)", () => {
    const roster = rosterOf([4, 3]);
    const doc = xml(partsOf(docxOf(roster).bytes).get("word/document.xml")!);
    const rows = rowsOf(tablesOf(doc)[0]);
    const head = cellsOf(rows[0]).map((tc) => all(tc, "p").map(textOf));
    expect(head).toEqual([
      ["650A 10:00~10:50", "월 LC · 4명"],
      ["650A 11:00~11:50", "화 LC · 3명"],
    ]);
    const body = rows.slice(1).map((tr) => cellsOf(tr).map(textOf));
    expect(body.map((r) => r[0])).toEqual(roster.levels[0].columns[0].students.map((st) => `${st.name}${st.marks.length ? ` (${st.marks.join("/")})` : ""}`));
    expect(body.map((r) => r[1])).toEqual([...roster.levels[0].columns[1].students.map((st) => `${st.name}${st.marks.length ? ` (${st.marks.join("/")})` : ""}`), ""]);
    // 가나다순
    const names = roster.levels[0].columns[0].students.map((s) => s.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "ko")));
  });

  it("이어지는 쪽에는 이름이 남은 칸만 — 다 적은 칸은 색 · 글 없이 자리만 (PDF 와 같다)", () => {
    const docx = docxOf(rosterOf([45, 20, 5, 5]));
    const doc = xml(partsOf(docx.bytes).get("word/document.xml")!);
    const second = tablesOf(doc)[1];
    const [head, ...body] = rowsOf(second);
    const fills = (tc: Element) => all(tc, "shd").map((s) => attr(s, "fill"));
    expect(textOf(cellsOf(head)[0])).toContain("45명 · 이어서");
    expect(textOf(cellsOf(head)[1])).toBe("");
    expect(fills(cellsOf(head)[1])).toEqual([]);
    expect(body.every((tr) => textOf(cellsOf(tr)[1]) === "" && fills(cellsOf(tr)[1]).length === 0)).toBe(true);
    // 띠에 이어서
    expect(docx.text).toContain("   학생 65명 · 이어서");
  });

  it("레벨별 명단 — 칸 안에 이름 두 단 (위에서 아래로 → 옆 단, 단 길이를 고르게)", () => {
    const roster = trackRosterOf([[5, 3]]);
    const doc = xml(partsOf(docxOf(roster, "2026년 10월 레벨별 명단").bytes).get("word/document.xml")!);
    const tbl = tablesOf(doc)[0];
    expect(all(tbl, "gridCol")).toHaveLength(4); // 월수금 두 단 + 화목금 두 단
    const [head, ...body] = rowsOf(tbl);
    expect(cellsOf(head).map((tc) => attr(all(tc, "gridSpan")[0], "val"))).toEqual(["2", "2"]);
    expect(cellsOf(head).map((tc) => all(tc, "p").map(textOf)[0])).toEqual(["650 월수금", "650 화목금"]);
    const mwf = roster.levels[0].columns[0].students.map((s) => s.name);
    const grid = body.map((tr) => cellsOf(tr).map((tc) => textOf(tc).replace(/ \(.*\)$/, "")));
    // 5명 → 3 + 2 : 첫 단 0·1·2, 둘째 단 3·4
    expect(grid.map((r) => r[0])).toEqual(mwf.slice(0, 3));
    expect(grid.map((r) => r[1])).toEqual([...mwf.slice(3), ""]);
    // 범례에 (월) (화) 가 없다
    expect(textOf(all(doc, "p").find((p) => textOf(p).startsWith("표시"))!)).not.toContain("(월)");
  });

  it("학생이 없는 반은 그 레벨 마지막 쪽 표 아래에 적는다", () => {
    const docx = docxOf(rosterOf([5, 0, 4, 3]));
    expect(docx.layout.map((p) => p.note)).toEqual(["학생이 없는 시간 1개: 650A 11:00~11:50 (화 LC)", ""]);
    const doc = xml(partsOf(docx.bytes).get("word/document.xml")!);
    const body = [...all(doc, "body")[0].children];
    const firstTable = body.findIndex((c) => c.localName === "tbl");
    expect(textOf(body[firstTable + 1])).toBe("학생이 없는 시간 1개: 650A 11:00~11:50 (화 LC)");
  });

  it("학생이 없으면 빈 명단 한 쪽", () => {
    const docx = docxOf(rosterOf([]));
    expect(docx.pages).toBe(1);
    expect(docx.text).toContain("이 명단에 선 학생이 없어요");
  });
});

describe("이름에 섞인 글자 — Word 가 못 여는 파일을 만들지 않는다", () => {
  it("XML 특수 글자는 그대로 보이고 제어 문자 · 짝 잃은 서로게이트는 지운다", () => {
    expect(xmlText(`<가&나>"`)).toBe("&lt;가&amp;나&gt;&quot;");
    expect(xmlText("가\u0001나\u0008\ud800다￾")).toBe("가나다");
    expect(xmlText("줄\n바꿈\t탭")).toBe("줄 바꿈 탭");
    expect(xmlText("😀")).toBe("😀");
  });

  it("그런 이름이 든 명단도 바른 XML 이고 이름이 보인다", () => {
    const roster = buildClassRoster({
      sections: [sec(1, { track: "mwf", timeBlock: "10:00~10:50" })],
      includes: new Map(),
      enrollments: [{ studentId: "a", sectionId: 1, mode: "onsite" }],
      people: new Map([["a", { name: '<김&"민">\u0007수', staff: false }]]),
      today: "2026-10-14",
    });
    const parts = partsOf(docxOf(roster).bytes);
    const doc = xml(parts.get("word/document.xml")!);
    expect(all(doc, "t").map((t) => t.textContent)).toContain('<김&"민">수');
  });
});

describe("파일 이름 — PDF 와 같고 확장자만 다르다", () => {
  it("역전토익_반별명단_2026-10.docx · 역전토익_레벨별명단_2026-10.docx", () => {
    expect(rosterFileName({ year: 2026, month: 10 }, "time", "docx")).toBe("역전토익_반별명단_2026-10.docx");
    expect(rosterFileName({ year: 2026, month: 10 }, "track", "docx")).toBe("역전토익_레벨별명단_2026-10.docx");
    expect(rosterFileName({ year: 2026, month: 10 })).toBe("역전토익_반별명단_2026-10.pdf");
    expect(rosterDisposition({ year: 2026, month: 10 }, "time", "docx")).toBe(
      `attachment; filename="winnertoeic-class-roster_2026-10.docx"; filename*=UTF-8''${encodeURIComponent("역전토익_반별명단_2026-10.docx")}`,
    );
  });

  it("지어낸 이름만 쓴다 (실명을 넣지 않는다)", () => {
    expect(NAMES.length).toBeGreaterThan(10);
  });
});
