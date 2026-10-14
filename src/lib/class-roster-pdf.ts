/**
 * 반별 명단 PDF (2026-10-14 Alan — "다운로드해서 인쇄할 수 있으면 좋겠어"). 학생명단의 반별 명단(`class-roster.ts`)을 종이 명단 모양 그대로 그린다.
 *
 * - **A4 가로.** 칸 = 수업 한 반이고 레벨마다 색을 달리 칠한다 — 종이 명단과 같은 엑셀 기본 연한 색(650 살구 · 750 노랑 · 850 하늘, 그다음 연두 · 보라 · 회색).
 *   머리는 `650B (화목금)` + 시간 · 사람 수, 아래로 이름 가나다순 · 이름 뒤 표시 `(불/프)`. 맨 위에 범례.
 * - **한 장에 다 들어가게** 줄 높이를 4.0 ~ 6.6mm 사이에서 맞추고, 그래도 넘치면 다음 장에 머리를 다시 그리고 이어 적는다.
 *   칸이 많으면(폭 25mm 아래로 좁아지면) 레벨을 통째로 다음 장으로 넘긴다.
 * - 이름이 칸보다 길면 그 칸만 글자를 줄인다 (`shrunk` — 테스트가 지어낸 긴 이름으로 본다).
 * - 글꼴은 `assets/roster-fonts/roster-bold.ttf`(한글 11,172자 · 글리프 길이 짝수 — 까닭은 `scripts/roster-font.mjs`). 그리기만 하고 읽기는 라우트가 한다.
 * - 좌표는 mm, 위에서 아래로 잰다 (출석 포스터 PDF 와 같은 방식).
 */
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, PrintScaling, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import { columnDetail, columnHeading, marksText, ROSTER_MARKS, ROSTER_SUBJECT_LABEL, toneOf, type ClassRoster, type RosterColumn, type RosterLevel } from "./class-roster";

export type RosterPdf = {
  bytes: Uint8Array;
  pages: number;
  /** 그린 글자 — 글꼴에 빠진 글자가 없는지 테스트가 본다 */
  drawn: string[];
  /** 칸보다 길어 글자를 줄여 그린 이름 */
  shrunk: string[];
};

const MM = 72 / 25.4;
const PAGE_W = 297;
const PAGE_H = 210;
const MX = 10;
const TOP = 9;
const BOTTOM = 9;
const TITLE_H = 17;
const HEAD_H = 12.5;
const FOOT_H = 5;
const GAP = 2.5;
const MIN_COL = 25;
const MAX_COL = 48;
export const MIN_ROW = 4.0;
const MAX_ROW = 6.6;
const PAD = 1.6;

/** Pretendard 세로 치수 (unitsPerEm 2048 · ascent 1950 · descent -494) — 포스터 PDF 와 같다 */
const ASC = 1950 / 2048;
const CONTENT = (1950 + 494) / 2048;

const hex = (h: string): RGB => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);

const C = { ink: hex("#17121F"), sub: hex("#4A4453"), mute: hex("#8E8799"), mark: hex("#55505E"), white: rgb(1, 1, 1) };

class Canvas {
  readonly drawn: string[] = [];
  readonly shrunk: string[] = [];
  constructor(
    readonly page: PDFPage,
    readonly font: PDFFont,
  ) {}

  rect(x: number, y: number, w: number, h: number, color: RGB) {
    this.page.drawRectangle({ x: x * MM, y: (PAGE_H - y - h) * MM, width: w * MM, height: h * MM, color });
  }

  width(s: string, size: number) {
    return this.font.widthOfTextAtSize(s, size) / MM;
  }

  /** 한 줄 (조각마다 크기 · 색). top · lh 는 줄 상자 (mm), x 는 왼쪽 끝 또는 오른쪽 끝(right) */
  line(runs: { t: string; size: number; color: RGB }[], o: { top: number; lh: number; x: number; right?: boolean; maxW?: number }) {
    const parts = runs.filter((r) => r.t);
    if (parts.length === 0) return;
    let k = 1;
    const total = () => parts.reduce((w, r, i) => w + this.width(r.t, r.size * k) + (i > 0 ? 0.25 * r.size * k * (25.4 / 72) : 0), 0);
    if (o.maxW && total() > o.maxW) {
      this.shrunk.push(parts.map((r) => r.t).join(""));
      k = o.maxW / total();
    }
    let x = o.right ? o.x - total() : o.x;
    const big = Math.max(...parts.map((r) => r.size * k));
    // 줄 상자 가운데에 가장 큰 글자를 맞추고 작은 조각도 같은 바탕선에 둔다
    const base = o.top + (o.lh - (CONTENT * big) / MM) / 2 + (ASC * big) / MM;
    parts.forEach((r, i) => {
      if (i > 0) x += 0.25 * r.size * k * (25.4 / 72);
      this.drawn.push(r.t);
      this.page.drawText(r.t, { x: x * MM, y: (PAGE_H - base) * MM, size: r.size * k, font: this.font, color: r.color });
      x += this.width(r.t, r.size * k);
    });
  }
}

type Block = { level: RosterLevel; columns: RosterColumn[] };

/** 칸을 장마다 나눈다 — 레벨은 되도록 한 장에 통째로, 칸이 25mm 보다 좁아지면 다음 장으로 */
export function splitPages(levels: readonly RosterLevel[], usable = PAGE_W - MX * 2): Block[][] {
  const fits = (blocks: Block[], extra: number, extraBlocks: number) => {
    const n = blocks.reduce((s, b) => s + b.columns.length, 0) + extra;
    const gaps = (blocks.length + extraBlocks - 1) * GAP;
    return n * MIN_COL + gaps <= usable;
  };
  const maxCols = Math.max(1, Math.floor(usable / MIN_COL));
  const pages: Block[][] = [];
  let cur: Block[] = [];
  for (const level of levels) {
    for (let i = 0; i < level.columns.length; i += maxCols) {
      const cols = level.columns.slice(i, i + maxCols);
      if (cur.length > 0 && !fits(cur, cols.length, 1)) {
        pages.push(cur);
        cur = [];
      }
      cur.push({ level, columns: cols });
    }
  }
  if (cur.length > 0) pages.push(cur);
  return pages;
}

/** 줄 높이 — 한 장에 다 들어가게 4.0 ~ 6.6mm. 넘치면 4.0mm 로 이어 쓴다 */
export function rowLayout(maxRows: number, avail: number): { rowH: number; perPage: number; pages: number } {
  const rowH = Math.min(MAX_ROW, Math.max(MIN_ROW, maxRows > 0 ? avail / maxRows : MAX_ROW));
  const perPage = Math.max(1, Math.floor((avail + 1e-6) / rowH));
  return { rowH, perPage, pages: Math.max(1, Math.ceil(maxRows / perPage)) };
}

const nameSize = (rowH: number) => Math.min(10.5, Math.max(7, rowH * 1.62));

export async function buildClassRosterPdf({
  roster,
  title,
  period,
  printedAt,
  font,
}: {
  roster: ClassRoster;
  /** "2026년 10월 반별 명단" */
  title: string;
  /** "10/6 개강 ~ 11/3 종강" */
  period: string;
  /** "2026-10-14 21:05" */
  printedAt: string;
  font: Uint8Array;
}): Promise<RosterPdf> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  // subset 을 켠다 — 쓴 글자만 넣어 파일이 작다 (글꼴은 글리프 길이를 짝수로 맞춘 파일이라 잘라 넣어도 모양이 밀리지 않는다)
  const pdfFont = await doc.embedFont(font, { subset: true });
  const subject = ROSTER_SUBJECT_LABEL[roster.subject];
  const heading = `${title} · ${subject} 수업`;
  const legend = ROSTER_MARKS.map((m) => `(${m.mark}) ${m.label}`).join("   ");
  const elsewhere = roster.elsewhere > 0 ? `${subject} 수업이 없는 학생 ${roster.elsewhere}명은 ${subject === "LC" ? "RC" : "LC"} 명단에 있어요` : "";
  const usable = PAGE_W - MX * 2;
  const gridTop = TOP + TITLE_H;
  const avail = PAGE_H - gridTop - HEAD_H - BOTTOM - FOOT_H;

  type Sheet = { blocks: Block[]; from: number; to: number; rowH: number; part: number; parts: number };
  const sheets: Sheet[] = [];
  for (const blocks of splitPages(roster.levels, usable)) {
    const maxRows = Math.max(0, ...blocks.flatMap((b) => b.columns.map((c) => c.students.length)));
    const { rowH, perPage, pages } = rowLayout(maxRows, avail);
    for (let p = 0; p < pages; p++) sheets.push({ blocks, from: p * perPage, to: (p + 1) * perPage, rowH, part: p, parts: pages });
  }
  if (sheets.length === 0) sheets.push({ blocks: [], from: 0, to: 0, rowH: MAX_ROW, part: 0, parts: 1 });

  const all = { drawn: [] as string[], shrunk: [] as string[] };
  sheets.forEach((sheet, index) => {
    const page = doc.addPage([PAGE_W * MM, PAGE_H * MM]);
    const cv = new Canvas(page, pdfFont);

    // ─ 위: 제목 · 기간 · 범례 ─
    cv.line([{ t: heading, size: 15, color: C.ink }], { top: TOP, lh: 8, x: MX, maxW: usable * 0.62 });
    cv.line([{ t: `${period} · 학생 ${roster.total}명 · ${printedAt} 출력`, size: 8, color: C.sub }], { top: TOP + 1, lh: 7, x: PAGE_W - MX, right: true, maxW: usable * 0.36 });
    cv.line([{ t: `표시  ${legend}`, size: 7.5, color: C.sub }], { top: TOP + 9, lh: 5, x: MX, maxW: usable * (elsewhere ? 0.66 : 1) });
    if (elsewhere) cv.line([{ t: elsewhere, size: 7.5, color: C.sub }], { top: TOP + 9, lh: 5, x: PAGE_W - MX, right: true, maxW: usable * 0.33 });

    if (sheet.blocks.length === 0) {
      cv.line([{ t: "이 명단에 선 학생이 없어요", size: 11, color: C.mute }], { top: gridTop + 10, lh: 8, x: MX });
    }

    // ─ 칸 ─
    const n = sheet.blocks.reduce((s, b) => s + b.columns.length, 0);
    const colW = n > 0 ? Math.min(MAX_COL, (usable - (sheet.blocks.length - 1) * GAP) / n) : 0;
    const rows = sheet.to - sheet.from;
    const bodyH = rows * sheet.rowH;
    let x = MX;
    for (const b of sheet.blocks) {
      const tone = toneOf(b.level.tone);
      b.columns.forEach((col, i) => {
        const cx = x + i * colW;
        const inner = colW - 0.3; // 칸 사이 흰 줄
        cv.rect(cx, gridTop, inner, HEAD_H, hex(tone.head));
        cv.rect(cx, gridTop + HEAD_H, inner, bodyH, hex(tone.body));
        cv.line([{ t: columnHeading(col), size: 10, color: hex(tone.ink) }], { top: gridTop + 1.2, lh: 5.6, x: cx + PAD, maxW: inner - PAD * 2 });
        const more = sheet.part > 0 ? " · 이어서" : "";
        cv.line([{ t: [columnDetail(col), `${col.students.length}명${more}`].filter(Boolean).join(" · "), size: 7, color: C.sub }], {
          top: gridTop + 6.8,
          lh: 4.4,
          x: cx + PAD,
          maxW: inner - PAD * 2,
        });
        const size = nameSize(sheet.rowH);
        col.students.slice(sheet.from, sheet.to).forEach((st, r) => {
          const top = gridTop + HEAD_H + r * sheet.rowH;
          if (r > 0) cv.rect(cx, top - 0.1, inner, 0.2, C.white);
          const marks = marksText(st.marks);
          cv.line(
            [
              { t: st.name || "이름 없음", size, color: C.ink },
              { t: marks, size: size * 0.8, color: C.mark },
            ],
            { top, lh: sheet.rowH, x: cx + PAD, maxW: inner - PAD * 2 },
          );
        });
      });
      x += b.columns.length * colW + GAP;
    }

    // ─ 바닥: 학생이 없는 반 · 쪽 번호 ─
    const footTop = PAGE_H - BOTTOM - FOOT_H + 1;
    const emptyNote =
      index === sheets.length - 1 && roster.empty.length > 0
        ? `학생이 없는 반 ${roster.empty.length}개: ${roster.empty.map((c) => [columnHeading(c), columnDetail(c)].filter(Boolean).join(" ")).join(", ")}`
        : `역전토익 학생명단 · ${subject} 수업 반별`;
    cv.line([{ t: emptyNote, size: 7, color: C.mute }], { top: footTop, lh: 4, x: MX, maxW: usable * 0.85 });
    cv.line([{ t: `${index + 1} / ${sheets.length}`, size: 7, color: C.mute }], { top: footTop, lh: 4, x: PAGE_W - MX, right: true });

    all.drawn.push(...cv.drawn);
    all.shrunk.push(...cv.shrunk);
  });

  doc.setTitle(heading);
  doc.setAuthor("역전토익");
  doc.setSubject(`${heading} — 이름 가나다순`);
  doc.setCreator("winnertoeic.com");
  doc.setLanguage("ko-KR");
  doc.catalog.getOrCreateViewerPreferences().setPrintScaling(PrintScaling.None);
  return { bytes: await doc.save(), pages: sheets.length, drawn: all.drawn, shrunk: all.shrunk };
}
