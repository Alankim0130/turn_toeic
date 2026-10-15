import { readFileSync } from "node:fs";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { decodePDFRawStream, PDFArray, PDFDocument, PDFRawStream, PDFRef } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { buildClassRosterPdf } from "./class-roster-pdf";
import { columnWidth, NAME_PT, nameSlots, ROW_H, ROWS_AVAIL, ROWS_PER_PAGE, rowLayout, splitPages, SUB_COLUMNS } from "./class-roster-sheets";
import { levelWithColumns as level, rosterOf, trackRosterOf } from "./__fixtures__/class-roster-fixtures";

const FONT_PATH = path.join(process.cwd(), "assets/roster-fonts/roster-bold.ttf");
const font = new Uint8Array(readFileSync(FONT_PATH));

/** TTF 의 글리프 길이 — loca 표에서 바로 읽는다 */
function glyphLengths(buf: Uint8Array): number[] {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const tables = new Map<string, number>();
  for (let i = 0; i < dv.getUint16(4); i++) {
    const o = 12 + i * 16;
    tables.set(String.fromCharCode(...buf.subarray(o, o + 4)), dv.getUint32(o + 8));
  }
  const long = dv.getInt16(tables.get("head")! + 50) === 1;
  const n = dv.getUint16(tables.get("maxp")! + 4);
  const loca = tables.get("loca")!;
  const at = (i: number) => (long ? dv.getUint32(loca + i * 4) : dv.getUint16(loca + i * 2) * 2);
  return Array.from({ length: n }, (_, i) => at(i + 1) - at(i));
}

describe("반별 명단 글꼴 (assets/roster-fonts/roster-bold.ttf)", () => {
  it("글리프 길이가 모두 짝수 — 홀수가 섞이면 pdf-lib 이 잘라 넣을 때 모양이 밀려 이름이 빈칸으로 찍힌다 (2026-10-14 실측)", () => {
    expect(glyphLengths(font).filter((len) => len % 2 !== 0)).toEqual([]);
  });

  it("한글 완성형 11,172자 · 영문 · 숫자 · 기호가 다 있다 — 학생 이름은 어떤 글자든 온다", () => {
    const f = fontkit.create(Buffer.from(font));
    const missing: string[] = [];
    for (let c = 0xac00; c <= 0xd7a3; c++) if (!f.hasGlyphForCodePoint(c)) missing.push(String.fromCharCode(c));
    for (let c = 0x21; c <= 0x7e; c++) if (!f.hasGlyphForCodePoint(c)) missing.push(String.fromCharCode(c));
    for (const ch of "·~") if (!f.hasGlyphForCodePoint(ch.codePointAt(0)!)) missing.push(ch);
    expect(missing).toEqual([]);
  });
});

const build = (counts: number[], extra: { name: string; sectionIndex: number }[] = [], perLevel = 2) =>
  buildClassRosterPdf({ roster: rosterOf(counts, extra, perLevel), title: "2026년 10월 반별 명단", period: "10/6 개강 ~ 11/3 종강", printedAt: "2026-10-14 21:05", font });

/** PDF 에 실제로 쓰인 글자 크기 (pt) — 쪽마다 내용 스트림을 풀어 `Tf` 를 모은다 */
async function fontSizes(bytes: Uint8Array): Promise<number[]> {
  const doc = await PDFDocument.load(bytes);
  const sizes = new Set<number>();
  for (const page of doc.getPages()) {
    const contents = page.node.Contents();
    const items = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : [];
    for (const item of items) {
      const stream = item instanceof PDFRef ? doc.context.lookup(item) : item;
      if (!(stream instanceof PDFRawStream)) continue;
      const ops = Buffer.from(decodePDFRawStream(stream).decode()).toString("latin1");
      for (const m of ops.matchAll(/\/\S+\s+([\d.]+)\s+Tf/g)) sizes.add(Number(m[1]));
    }
  }
  return [...sizes].sort((a, b) => a - b);
}

describe("반별 명단 PDF", () => {
  it("A4 세로 · 레벨마다 새 쪽 — 한 쪽에 두 레벨이 섞이지 않는다 (2026-10-14 Alan \"레벨별이 다르면 새로운 페이지에서 다시 시작\")", async () => {
    const pdf = await build([12, 9, 15, 4, 6, 3]);
    const doc = await PDFDocument.load(pdf.bytes);
    expect(doc.getPageCount()).toBe(3);
    for (const page of doc.getPages()) {
      const { width, height } = page.getSize();
      expect([Math.round(width), Math.round(height)]).toEqual([595, 842]); // A4 세로 (pt)
    }
    expect(pdf.layout.map((p) => p.level)).toEqual(["650", "750", "850"]);
    expect(pdf.layout.map((p) => p.columns)).toEqual([
      ["650A 10:00~10:50", "650A 11:00~11:50"],
      ["750A 12:00~12:50", "750A 13:00~13:50"],
      ["850A 14:00~14:50", "850A 15:00~15:50"],
    ]);
    const text = pdf.drawn.join("\n");
    // LC · RC 를 합친 한 장 — 제목에 과목이 없다 (2026-10-14 저녁 Alan "lc, rc구분하지말고 합쳐서")
    expect(text).toContain("2026년 10월 반별 명단");
    expect(text).not.toContain("LC 수업");
    expect(text).toContain("월 LC"); // 칸 머리 둘째 줄 — 트랙마다 과목
    expect(text).toContain("(LC) LC단과"); // 범례
    expect(text).toContain("학생 21명"); // 650 레벨 띠 — 그 레벨 학생 수
    expect(text).toContain("(불)");
    expect(text).toContain("가온");
    const f = fontkit.create(Buffer.from(font));
    const missing = [...new Set([...text].filter((ch) => ch.trim() && !f.hasGlyphForCodePoint(ch.codePointAt(0)!)))];
    expect(missing).toEqual([]);
    expect(pdf.shrunk).toEqual([]);
    // 쓴 글자만 넣어 작다
    expect(pdf.bytes.length).toBeLessThan(120_000);
  });

  it("이름은 학생이 몇 명이든 늘 10pt — 레벨을 한 쪽에 넣으려고 글자를 줄이지 않는다 (2026-10-14 Alan \"글자크기는 10으로 해줘\")", async () => {
    expect(NAME_PT).toBe(10);
    // 실제 PDF 에 쓰인 글자 크기가 학생 수와 상관없이 같다 — 예전에는 45명 칸이면 이름이 8.3pt 로 줄었다
    const small = await build([8, 6, 5, 4]);
    const big = await build([45, 20, 38, 30, 60, 60]);
    const fixed = [7, 7.5, 8, 9.5, 10, 14, 18]; // 바닥 · 칸 둘째 줄 7, 기간 · 범례 7.5, 시간 · 표시 8, 학생 수 9.5, 이름 · 칸 이름 10, 제목 14, 레벨 18
    expect(await fontSizes(small.bytes)).toEqual(fixed);
    expect(await fontSizes(big.bytes)).toEqual(fixed);
    expect(big.shrunk).toEqual([]);
  });

  it("한 쪽에 41줄 — 넘치면 그 레벨 안에서 쪽마다 고르게 나눠 이어 쓰고, 이어지는 쪽에는 이름이 남은 칸만 그린다", async () => {
    // 줄 높이 고정 (5.6mm) — 한 쪽에 41줄. 한 반 40명 남짓은 한 쪽에 든다
    expect(ROW_H).toBe(5.6);
    expect(ROWS_PER_PAGE).toBe(Math.floor(ROWS_AVAIL / ROW_H));
    expect(ROWS_PER_PAGE).toBe(41);
    expect(rowLayout(20)).toEqual({ perPage: 20, pages: 1 });
    expect(rowLayout(41)).toEqual({ perPage: 41, pages: 1 });
    expect(rowLayout(42)).toEqual({ perPage: 21, pages: 2 }); // 41 + 1 이 아니라 21 + 21
    expect(rowLayout(45)).toEqual({ perPage: 23, pages: 2 }); // 23 + 22
    expect(rowLayout(60)).toEqual({ perPage: 30, pages: 2 });
    expect(rowLayout(90)).toEqual({ perPage: 30, pages: 3 });
    expect(rowLayout(0)).toEqual({ perPage: 1, pages: 1 });
    const pdf = await build([45, 20, 5, 5]);
    expect(pdf.layout.map((p) => `${p.level}:${p.part}`)).toEqual(["650:0", "650:1", "750:0"]);
    // 650 둘째 쪽 — 45명 칸만 이어서 (20명 칸은 첫 쪽에 다 적었다)
    expect(pdf.layout.map((p) => p.columns)).toEqual([["650A 10:00~10:50", "650A 11:00~11:50"], ["650A 10:00~10:50"], ["750A 12:00~12:50", "750A 13:00~13:50"]]);
    const text = pdf.drawn.join("\n");
    expect(text).toContain("학생 65명 · 이어서");
    expect(text).toContain("45명 · 이어서");
    expect(text).not.toContain("20명 · 이어서");
    // 두 칸 다 이어지면 둘 다 그린다
    const both = await build([60, 58]);
    expect(both.layout.map((p) => p.columns.length)).toEqual([2, 2]);
  });

  it("칸이 많은 레벨은 고르게 나눠 다음 쪽에 이어 그린다 — 칸이 30mm 보다 좁아지지 않게 (세로 A4 에 여섯 칸)", () => {
    const flat = (blocks: ReturnType<typeof splitPages>) => blocks.map((b) => `${b.level.label}×${b.columns.length}`);
    expect(flat(splitPages([level("650", 4, 0), level("750", 4, 1), level("850", 2, 2)]))).toEqual(["650×4", "750×4", "850×2"]);
    expect(flat(splitPages([level("650", 6, 0), level("750", 7, 1), level("850", 13, 2)]))).toEqual(["650×6", "750×4", "750×3", "850×5", "850×4", "850×4"]);
    // 칸 폭 — 쪽 폭(190mm)을 고르게 나누고, 칸 하나면 반 폭
    expect(columnWidth(1)).toBeCloseTo(95);
    expect(columnWidth(2)).toBeCloseTo(95);
    expect(columnWidth(4)).toBeCloseTo(47.5);
    expect(columnWidth(6)).toBeGreaterThanOrEqual(30);
  });

  it("학생이 없는 반은 그 레벨 쪽 바닥에 · 학생이 하나도 없는 레벨의 반은 맨 마지막 쪽 바닥에 적는다", async () => {
    const pdf = await build([5, 0, 4, 3]);
    expect(pdf.layout.map((p) => p.level)).toEqual(["650", "750"]);
    expect(pdf.layout[0].footer).toBe("학생이 없는 시간 1개: 650A 11:00~11:50 (화 LC)");
    expect(pdf.layout[1].footer).not.toContain("학생이 없는");
    const orphan = await build([5, 5, 0, 0, 4, 4]);
    expect(orphan.layout.map((p) => p.level)).toEqual(["650", "850"]);
    expect(orphan.layout[0].footer).not.toContain("학생이 없는");
    expect(orphan.layout[1].footer).toBe("학생이 없는 시간 2개: 750A 12:00~12:50 (월 LC), 750A 13:00~13:50 (화 LC)");
  });

  it("이름이 칸보다 길면 그 칸만 글자를 줄인다 (여섯 칸 레벨 — 칸 폭 약 31mm)", async () => {
    const pdf = await build([3, 3, 3, 3, 3, 3], [{ name: "아주아주아주아주긴이름입니다", sectionIndex: 0 }], 6);
    expect(pdf.layout).toHaveLength(1);
    expect(pdf.shrunk.length).toBeGreaterThan(0);
    expect(pdf.shrunk.every((s) => s.startsWith("아주아주"))).toBe(true);
  });

  it("학생이 없으면 빈 명단 한 쪽", async () => {
    const pdf = await build([]);
    expect(pdf.pages).toBe(1);
    expect(pdf.drawn).toContain("이 명단에 선 학생이 없어요");
  });
});

const buildTrack = (perLevel: [number, number][]) =>
  buildClassRosterPdf({ roster: trackRosterOf(perLevel), title: "2026년 10월 레벨별 명단", period: "10/6 개강 ~ 11/3 종강", printedAt: "2026-10-14 21:05", font });

describe("레벨별 명단 PDF (2026-10-14 밤 Alan \"시간대는 없애고 … 월수금/ 화목금만 분리\")", () => {
  it("레벨마다 새 쪽 · 칸은 월수금 · 화목금 둘 · 시간이 없다 · 범례에 (월) (화) 가 없다 · 이름은 늘 10pt", async () => {
    const pdf = await buildTrack([
      [12, 9],
      [4, 0],
      [6, 3],
    ]);
    expect(pdf.layout.map((p) => p.level)).toEqual(["650", "750", "850"]);
    expect(pdf.layout.map((p) => p.columns)).toEqual([["650 월수금", "650 화목금"], ["750 월수금"], ["850 월수금", "850 화목금"]]);
    expect(pdf.layout[0].footer).toBe("역전토익 학생명단 · 레벨별");
    // 학생이 없는 트랙은 그 레벨 쪽 바닥에 — "요일"
    expect(pdf.layout[1].footer).toBe("학생이 없는 요일 1개: 750 화목금");
    const text = pdf.drawn.join("\n");
    expect(text).toContain("2026년 10월 레벨별 명단");
    expect(text).toContain("(불) 불라방");
    expect(text).not.toContain("월수금만");
    expect(text).not.toContain("10:00");
    expect(text).toContain("12명"); // 칸 머리 둘째 줄 — 사람 수뿐
    expect(await fontSizes(pdf.bytes)).toEqual([7, 7.5, 8, 9.5, 10, 14, 18]);
    expect(pdf.shrunk).toEqual([]);
    // 이름은 한 번씩 다 적힌다
    expect(pdf.drawn.filter((t) => /^[가-힣]+\d*$/.test(t))).toHaveLength(12 + 9 + 4 + 6 + 3);
  });

  it("칸 안에 이름을 두 단으로 — 위에서 아래로 채우고 옆 단으로, 단 길이를 고르게 (한 쪽에 한 칸 82명)", async () => {
    expect(SUB_COLUMNS).toEqual({ time: 1, track: 2 });
    const at = (n: number, subs: number) => nameSlots(n, subs).map((p) => `${p.sub}:${p.row}`);
    expect(at(5, 2)).toEqual(["0:0", "0:1", "0:2", "1:0", "1:1"]);
    expect(at(4, 2)).toEqual(["0:0", "0:1", "1:0", "1:1"]);
    expect(at(3, 1)).toEqual(["0:0", "0:1", "0:2"]); // 반별 명단 — 한 단
    expect(at(1, 2)).toEqual(["0:0"]);
    // 82명이면 41줄 — 한 쪽 이름 칸에 든다
    expect(Math.max(...nameSlots(82, 2).map((p) => p.row)) + 1).toBe(ROWS_PER_PAGE);
    expect(Math.ceil((ROWS_PER_PAGE * 2) / 2) * ROW_H).toBeLessThanOrEqual(ROWS_AVAIL);
    expect(rowLayout(82, ROWS_PER_PAGE * 2)).toEqual({ perPage: 82, pages: 1 });
    expect(rowLayout(83, ROWS_PER_PAGE * 2)).toEqual({ perPage: 42, pages: 2 }); // 42 + 41
    expect(rowLayout(165, ROWS_PER_PAGE * 2)).toEqual({ perPage: 55, pages: 3 });

    const one = await buildTrack([[82, 10]]);
    expect(one.pages).toBe(1);
    const two = await buildTrack([[83, 10]]);
    expect(two.layout.map((p) => `${p.level}:${p.part}`)).toEqual(["650:0", "650:1"]);
    // 둘째 쪽에는 이름이 남은 월수금 칸만
    expect(two.layout.map((p) => p.columns)).toEqual([["650 월수금", "650 화목금"], ["650 월수금"]]);
    expect(two.drawn.join("\n")).toContain("83명 · 이어서");
    expect(two.drawn.filter((t) => /^[가-힣]+\d*$/.test(t))).toHaveLength(93);
    expect(await fontSizes(two.bytes)).toEqual([7, 7.5, 8, 9.5, 10, 14, 18]);
  });
});
