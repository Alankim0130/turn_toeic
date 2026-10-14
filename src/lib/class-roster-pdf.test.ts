import { readFileSync } from "node:fs";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { buildClassRoster, type RosterEnrollment, type RosterLevel, type RosterPerson, type RosterSection } from "./class-roster";
import { buildClassRosterPdf, MIN_ROW, rowLayout, splitPages } from "./class-roster-pdf";

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

const sec = (id: number, o: Partial<RosterSection> & Pick<RosterSection, "track" | "timeBlock">): RosterSection => ({
  id,
  subject: "lc",
  bookSet: "A",
  recorded: false,
  closesAt: "2026-11-03",
  courseId: 650,
  level: 650,
  program: "score",
  courseName: "650+ 왕기초반",
  ...o,
});

/** 지어낸 이름 n 개 (가나다 섞어) — 실명을 넣지 않는다 */
const NAMES = ["하늘", "가온", "나리", "다온", "라온", "마루", "바다", "사랑", "아라", "자람", "차오름", "카라", "타라", "파랑", "한별"];
function rosterOf(counts: number[], extra: { name: string; sectionIndex: number }[] = []) {
  const sections = counts.map((_, i) => sec(i + 1, { track: i % 2 ? "ttf" : "mwf", timeBlock: `1${i % 10}:00~1${i % 10}:50`, level: 650 + 100 * Math.floor(i / 2), courseId: 650 + 100 * Math.floor(i / 2) }));
  const enrollments: RosterEnrollment[] = [];
  const people = new Map<string, RosterPerson>();
  counts.forEach((n, i) => {
    for (let k = 0; k < n; k++) {
      const id = `s${i}-${k}`;
      people.set(id, { name: `${NAMES[k % NAMES.length]}${k >= NAMES.length ? k : ""}`, staff: false });
      enrollments.push({ studentId: id, sectionId: i + 1, mode: k % 3 === 0 ? "live" : "onsite" });
    }
  });
  extra.forEach((e, j) => {
    people.set(`x${j}`, { name: e.name, staff: false });
    enrollments.push({ studentId: `x${j}`, sectionId: e.sectionIndex + 1, mode: "onsite" });
  });
  return buildClassRoster({ sections, includes: new Map(), enrollments, people, subject: "lc", today: "2026-10-14" });
}

const build = (counts: number[], extra: { name: string; sectionIndex: number }[] = []) =>
  buildClassRosterPdf({ roster: rosterOf(counts, extra), title: "2026년 10월 반별 명단", period: "10/6 개강 ~ 11/3 종강", printedAt: "2026-10-14 21:05", font });

describe("반별 명단 PDF", () => {
  it("A4 가로 한 장 — 이름 · 칸 머리 · 범례가 다 찍히고 글꼴에 없는 글자가 없다", async () => {
    const pdf = await build([12, 9, 15, 4, 6, 3]);
    const doc = await PDFDocument.load(pdf.bytes);
    expect(doc.getPageCount()).toBe(1);
    const { width, height } = doc.getPage(0).getSize();
    expect([Math.round(width), Math.round(height)]).toEqual([842, 595]); // A4 가로 (pt)
    const text = pdf.drawn.join("\n");
    expect(text).toContain("2026년 10월 반별 명단 · LC 수업");
    expect(text).toContain("650A (월수금)");
    expect(text).toContain("(불)");
    expect(text).toContain("가온");
    const f = fontkit.create(Buffer.from(font));
    const missing = [...new Set([...text].filter((ch) => ch.trim() && !f.hasGlyphForCodePoint(ch.codePointAt(0)!)))];
    expect(missing).toEqual([]);
    expect(pdf.shrunk).toEqual([]);
    // 쓴 글자만 넣어 작다
    expect(pdf.bytes.length).toBeLessThan(120_000);
  });

  it("한 칸이 길면 줄을 줄여 한 장에 넣고, 4.0mm 로도 넘치면 다음 장에 이어 적는다", async () => {
    expect(rowLayout(20, 150).rowH).toBeCloseTo(6.6);
    expect(rowLayout(30, 150).rowH).toBeCloseTo(5);
    expect(rowLayout(60, 150)).toMatchObject({ rowH: MIN_ROW, perPage: 37, pages: 2 });
    const pdf = await build([70, 10]);
    expect(pdf.pages).toBe(2);
    expect(pdf.drawn.join("\n")).toContain("이어서");
  });

  it("칸이 많으면 레벨을 통째로 다음 장으로 넘긴다 — 한 장에 칸이 25mm 보다 좁아지지 않게", () => {
    const level = (label: string, n: number, tone: number): RosterLevel => ({
      key: label,
      level: Number(label),
      label,
      tone,
      count: n,
      columns: Array.from({ length: n }, (_, i) => ({ sectionId: tone * 10 + i, level: Number(label), title: label, track: "mwf", time: null, recorded: false, bothSubjects: false, students: [] })),
    });
    const pages = splitPages([level("650", 4, 0), level("750", 4, 1), level("850", 2, 2)]);
    expect(pages.map((p) => p.map((b) => `${b.level.label}×${b.columns.length}`))).toEqual([["650×4", "750×4", "850×2"]]);
    const many = splitPages([level("650", 5, 0), level("750", 5, 1), level("850", 4, 2)]);
    expect(many.map((p) => p.map((b) => `${b.level.label}×${b.columns.length}`))).toEqual([["650×5", "750×5"], ["850×4"]]);
  });

  it("이름이 칸보다 길면 그 칸만 글자를 줄인다", async () => {
    const pdf = await build([3, 3, 3, 3, 3, 3, 3, 3, 3, 3], [{ name: "아주아주아주아주긴이름입니다", sectionIndex: 0 }]);
    expect(pdf.shrunk.some((s) => s.startsWith("아주아주"))).toBe(true);
  });

  it("학생이 없으면 빈 명단 한 장", async () => {
    const pdf = await build([]);
    expect(pdf.pages).toBe(1);
    expect(pdf.drawn).toContain("이 명단에 선 학생이 없어요");
  });
});
