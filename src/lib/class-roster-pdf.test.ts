import { readFileSync } from "node:fs";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { buildClassRoster, type RosterEnrollment, type RosterLevel, type RosterPerson, type RosterSection } from "./class-roster";
import { buildClassRosterPdf, columnWidth, MIN_ROW, ROWS_AVAIL, rowLayout, splitPages } from "./class-roster-pdf";

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
/** 칸(반)마다 학생 수 — `perLevel` 칸씩 한 레벨 (650 → 750 → 850 …) */
function rosterOf(counts: number[], extra: { name: string; sectionIndex: number }[] = [], perLevel = 2) {
  const levelOf = (i: number) => 650 + 100 * Math.floor(i / perLevel);
  const sections = counts.map((_, i) => sec(i + 1, { track: i % 2 ? "ttf" : "mwf", timeBlock: `1${i % 10}:00~1${i % 10}:50`, level: levelOf(i), courseId: levelOf(i) }));
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
  return buildClassRoster({ sections, includes: new Map(), enrollments, people, today: "2026-10-14" });
}

const build = (counts: number[], extra: { name: string; sectionIndex: number }[] = [], perLevel = 2) =>
  buildClassRosterPdf({ roster: rosterOf(counts, extra, perLevel), title: "2026년 10월 반별 명단", period: "10/6 개강 ~ 11/3 종강", printedAt: "2026-10-14 21:05", font });

const level = (label: string, n: number, tone: number): RosterLevel => ({
  key: label,
  level: Number(label),
  label,
  tone,
  count: n,
  columns: Array.from({ length: n }, (_, i) => ({ key: `${label}-${i}`, sectionIds: [tone * 100 + i], level: Number(label), title: label, time: null, tracks: [], students: [] })),
});

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

  it("한 레벨이 길면 그 레벨 안에서 고르게 나눠 이어 쓰고(4.0mm 로도 넘칠 때), 다음 레벨은 새 쪽에서 시작한다", async () => {
    expect(rowLayout(20, 150).rowH).toBeCloseTo(6.6);
    expect(rowLayout(30, 150).rowH).toBeCloseTo(5);
    expect(rowLayout(60, 150)).toMatchObject({ rowH: 5, perPage: 30, pages: 2 }); // 37줄 + 23줄이 아니라 30 + 30
    // 세로 A4 한 쪽 — 6.6mm 로 35줄까지, 줄을 줄여 57줄까지. 58줄부터는 두 쪽에 고르게 나눠 줄을 다시 키운다
    expect(rowLayout(35, ROWS_AVAIL)).toMatchObject({ rowH: 6.6, pages: 1 });
    expect(rowLayout(57, ROWS_AVAIL)).toMatchObject({ pages: 1 });
    expect(rowLayout(57, ROWS_AVAIL).rowH).toBeGreaterThanOrEqual(MIN_ROW);
    expect(rowLayout(58, ROWS_AVAIL)).toMatchObject({ rowH: 6.6, perPage: 29, pages: 2 });
    expect(rowLayout(70, ROWS_AVAIL)).toMatchObject({ rowH: 6.6, perPage: 35, pages: 2 });
    const pdf = await build([70, 10, 5, 5]);
    expect(pdf.layout.map((p) => `${p.level}:${p.part}`)).toEqual(["650:0", "650:1", "750:0"]);
    expect(pdf.drawn.join("\n")).toContain("이어서");
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
