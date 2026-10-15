/**
 * 반별 명단 PDF (2026-10-14 Alan — "다운로드해서 인쇄할 수 있으면 좋겠어" → 같은 날 "인쇄용은 레벨별이 다르면 새로운 페이지에서 다시 시작되면서
 * 깔끔하게 인쇄가 되면 좋겠는데"). 학생명단의 반별 명단(`class-roster.ts`)을 종이 명단 모양으로 그린다.
 *
 * - **A4 세로 · 레벨마다 새 쪽.** 한 쪽에 두 레벨을 섞지 않는다 — 650 쪽 · 750 쪽 · 850 쪽을 따로 뽑아 그 반에 들고 갈 수 있게.
 *   (처음 몇 시간은 A4 가로 한 장에 모든 레벨을 화면처럼 늘어놓고 자리가 모자랄 때만 넘겼다. 레벨 하나는 칸이 2 ~ 4개라 세로가 맞는다)
 * - 쪽 머리: 달 제목 · 기간, 레벨 색 띠에 레벨(`650`)과 그 레벨 학생 수, 범례. 칸 = 한 레벨의 수업 시간 한 칸(월수금 · 화목금을 합친다)이고
 *   머리는 `650B 10:00~11:00` + `월 RC · 화 LC · 사람 수`, 아래로 이름 가나다순 · 이름 뒤 표시 `(불/RC)`. LC · RC 를 나누지 않은 한 장이다
 *   (2026-10-14 저녁 Alan "lc, rc구분하지말고 합쳐서"). 색은 종이 명단과 같은 엑셀 연한 색(`ROSTER_TONES`).
 * - **칸은 쪽 폭을 고르게 나눈다** (칸 하나면 반 폭). 한 레벨의 칸이 30mm 보다 좁아지면(일곱 칸부터) 고르게 나눠 다음 쪽에 이어 그린다.
 * - **이름은 늘 10pt · 줄 높이도 고정이다** (같은 날 Alan "한 레벨을 한 페이지에 다 넣을려고 글자크기가 조절바뀌는데, 이게 아니라 글자크기는 10으로 해줘").
 *   그전에는 레벨을 한 쪽에 넣으려고 줄 높이(4.0 ~ 6.6mm)와 글자(7 ~ 10.5pt)를 학생 수에 맞춰 줄였다 — 레벨마다 글자 크기가 달랐다. **다시 줄여 한 쪽에 몰지 말 것.**
 *   한 쪽에 `ROWS_PER_PAGE` 줄이고, 넘치면 쪽마다 고르게 나눠(45명 → 23 + 22 — 앞 쪽을 꽉 채우고 뒤 쪽에 몇 줄만 남기지 않게) 다음 쪽에 머리를 다시 그리고 이어 적는다(`이어서`).
 *   이어지는 쪽에는 이름이 남은 칸만 그린다 (앞 쪽에서 다 적은 칸을 빈 칸으로 세우지 않는다).
 *   **바탕은 이름이 있는 줄까지만 칠한다** — 학생이 몇 안 되는 레벨이 쪽 바닥까지 색을 칠하지 않게 (잉크를 아낀다).
 * - 학생이 없는 반은 칸을 그리지 않고 그 레벨 마지막 쪽 바닥에 이름만 적는다. 학생이 하나도 없는 레벨은 쪽이 없고 그 반들은 맨 마지막 쪽 바닥에 적는다.
 * - 이름이 칸 폭보다 길면 그 이름 하나만 글자를 줄인다 (`shrunk` — 옆 칸을 덮지 않게. 한국 이름은 여섯 칸 레벨에서도 다 10pt 로 들어간다 — 테스트가 지어낸 긴 이름으로 본다).
 * - 글꼴은 `assets/roster-fonts/roster-bold.ttf`(한글 11,172자 · 글리프 길이 짝수 — 까닭은 `scripts/roster-font.mjs`). 그리기만 하고 읽기는 라우트가 한다.
 * - 좌표는 mm, 위에서 아래로 잰다 (출석 포스터 PDF 와 같은 방식).
 * - **쪽 나눔은 `class-roster-sheets.ts` 한곳이다** (2026-10-15 — Word 받기(`class-roster-docx.ts`)가 같은 쪽을 만들게 그리로 옮겼다). 이 파일은 그리기만 한다.
 * - **레벨별 명단**(`roster.by === "track"`, 2026-10-14 밤 Alan "시간대는 없애고 같은 레벨별로 … 월수금/ 화목금만 분리")도 같은 틀이다 —
 *   레벨마다 새 쪽 · 이름 10pt · 줄 높이 고정은 그대로고, 칸이 `650 월수금` · `650 화목금` 둘(각 반 폭)이라 **칸 안에 이름을 두 단으로** 적는다
 *   (`SUB_COLUMNS` — 신문처럼 위에서 아래로 채우고 옆 단으로, 칸마다 두 단 길이를 고르게). 한 칸이 한 쪽에 82명까지 들고 넘치면 위처럼 고르게 나눠 다음 쪽에 잇는다.
 *   범례에 `(월)` · `(화)` 가 없고(칸이 트랙이다) 바닥은 `학생이 없는 요일`.
 */
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, PrintScaling, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import { columnDetail, columnHeading, marksText, rosterMarks, toneOf, type ClassRoster } from "./class-roster";
import { BOTTOM, columnWidth, FOOT_H, GRID_TOP, HEAD_H, MX, NAME_PT, nameSlots, PAGE_H, PAGE_W, planRosterSheets, rosterBrand, ROW_H, shownColumns, SUB_COLUMNS, TOP, USABLE } from "./class-roster-sheets";

/** 쪽 하나에 무엇을 그렸나 — 테스트가 쪽마다 레벨이 하나인지 · 빈 반을 어느 쪽에 적었는지 본다 */
export type RosterPdfPage = { level: string | null; columns: string[]; part: number; footer: string };
export type RosterPdf = {
  bytes: Uint8Array;
  pages: number;
  layout: RosterPdfPage[];
  /** 그린 글자 — 글꼴에 빠진 글자가 없는지 테스트가 본다 */
  drawn: string[];
  /** 칸 폭보다 길어 그 이름만 글자를 줄여 그린 것 — 학생 수로는 줄이지 않는다 */
  shrunk: string[];
};

const MM = 72 / 25.4;
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

export async function buildClassRosterPdf({
  roster,
  title,
  period,
  printedAt,
  font,
}: {
  roster: ClassRoster;
  /** "2026년 10월 반별 명단" — 쪽 맨 위 제목 */
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
  const heading = title;
  const legend = rosterMarks(roster.by).map((m) => `(${m.mark}) ${m.label}`).join("   ");
  const subs = SUB_COLUMNS[roster.by];

  // 쪽 나눔 — Word 받기와 같은 결과다 (class-roster-sheets.ts)
  const sheets = planRosterSheets(roster);

  const layout: RosterPdfPage[] = [];
  const all = { drawn: [] as string[], shrunk: [] as string[] };
  sheets.forEach((sheet, index) => {
    const page = doc.addPage([PAGE_W * MM, PAGE_H * MM]);
    const cv = new Canvas(page, pdfFont);
    const block = sheet.block;

    // ─ 위: 제목 · 기간 ─
    cv.line([{ t: heading, size: 14, color: C.ink }], { top: TOP, lh: 7, x: MX, maxW: USABLE * 0.6 });
    cv.line([{ t: [period, `${printedAt} 출력`].filter(Boolean).join(" · "), size: 7.5, color: C.sub }], {
      top: TOP + 0.5,
      lh: 6,
      x: PAGE_W - MX,
      right: true,
      maxW: USABLE * 0.38,
    });

    // ─ 레벨 띠 — 쪽을 가르는 곳. 레벨 색 네모에 레벨, 옆에 그 레벨 학생 수 ─
    if (block) {
      const tone = toneOf(block.level.tone);
      const label = block.level.label;
      const bw = cv.width(label, 18) + 7;
      cv.rect(MX, TOP + 9, bw, 10, hex(tone.head));
      cv.line([{ t: label, size: 18, color: hex(tone.ink) }], { top: TOP + 9, lh: 10, x: MX + 3.5 });
      cv.line([{ t: `학생 ${block.level.count}명${sheet.levelStart ? "" : " · 이어서"}`, size: 9.5, color: C.sub }], { top: TOP + 9, lh: 10, x: MX + bw + 3 });
    }
    cv.line([{ t: `표시  ${legend}`, size: 7.5, color: C.sub }], { top: TOP + 21, lh: 5, x: MX, maxW: USABLE });

    if (!block) {
      cv.line([{ t: "이 명단에 선 학생이 없어요", size: 11, color: C.mute }], { top: GRID_TOP + 4, lh: 8, x: MX });
    } else {
      // ─ 칸 ─ 바탕은 이 쪽에 이름이 있는 줄까지만
      const tone = toneOf(block.level.tone);
      const colW = columnWidth(block.columns.length);
      const bodyH = Math.ceil((sheet.to - sheet.from) / subs) * ROW_H;
      // 이어지는 쪽에는 이름이 남은 칸만 — 앞 쪽에서 다 적은 칸을 빈 칸으로 세우면 '이어서' 인데 이름이 없어 빠진 것처럼 보인다.
      // 칸 자리는 첫 쪽과 같다 (쪽을 위아래로 이어 놓으면 칸이 맞는다)
      shownColumns(block, sheet.from).forEach(({ col, i }) => {
        const cx = MX + i * colW;
        const inner = colW - 0.3; // 칸 사이 흰 줄
        cv.rect(cx, GRID_TOP, inner, HEAD_H, hex(tone.head));
        cv.rect(cx, GRID_TOP + HEAD_H, inner, bodyH, hex(tone.body));
        cv.line(
          [
            { t: col.title, size: 10, color: hex(tone.ink) },
            { t: col.time ?? "", size: 8, color: hex(tone.ink) },
          ],
          { top: GRID_TOP + 1.2, lh: 5.6, x: cx + PAD, maxW: inner - PAD * 2 },
        );
        const more = sheet.part > 0 ? " · 이어서" : "";
        cv.line([{ t: [columnDetail(col), `${col.students.length}명${more}`].filter(Boolean).join(" · "), size: 7, color: C.sub }], {
          top: GRID_TOP + 6.8,
          lh: 4.4,
          x: cx + PAD,
          maxW: inner - PAD * 2,
        });
        // 이 쪽의 이름 — 칸 안에 `subs` 단으로 (위에서 아래로 채우고 옆 단으로 · 칸마다 단 길이를 고르게). 반별 명단은 한 단이다
        const names = col.students.slice(sheet.from, sheet.to);
        const slots = nameSlots(names.length, subs);
        const rows = Math.ceil(names.length / subs);
        const subW = inner / subs;
        // 단 사이 흰 세로줄 (두 단일 때 — 둘째 단에 이름이 있으면)
        for (let j = 1; j < subs && j * rows < names.length; j++) cv.rect(cx + j * subW - 0.15, GRID_TOP + HEAD_H, 0.3, rows * ROW_H, C.white);
        names.forEach((st, k) => {
          const { sub, row } = slots[k];
          const top = GRID_TOP + HEAD_H + row * ROW_H;
          // 줄 사이 흰 가로줄 — 칸 폭 전체, 첫 단의 이름을 적을 때 한 번
          if (row > 0 && sub === 0) cv.rect(cx, top - 0.1, inner, 0.2, C.white);
          cv.line(
            [
              { t: st.name || "이름 없음", size: NAME_PT, color: C.ink },
              { t: marksText(st.marks), size: NAME_PT * 0.8, color: C.mark },
            ],
            { top, lh: ROW_H, x: cx + sub * subW + PAD, maxW: subW - PAD * 2 },
          );
        });
      });
    }

    // ─ 바닥: 학생이 없는 반 · 쪽 번호 ─
    const footer = sheet.note || rosterBrand(roster.by);
    const footTop = PAGE_H - BOTTOM - FOOT_H + 1;
    cv.line([{ t: footer, size: 7, color: C.mute }], { top: footTop, lh: 4, x: MX, maxW: USABLE * 0.84 });
    cv.line([{ t: `${index + 1} / ${sheets.length}`, size: 7, color: C.mute }], { top: footTop, lh: 4, x: PAGE_W - MX, right: true });

    layout.push({ level: block?.level.label ?? null, columns: block ? shownColumns(block, sheet.from).map(({ col }) => columnHeading(col)) : [], part: sheet.part, footer });
    all.drawn.push(...cv.drawn);
    all.shrunk.push(...cv.shrunk);
  });

  doc.setTitle(heading);
  doc.setAuthor("역전토익");
  doc.setSubject(`${heading} — 레벨마다 한 쪽 · 이름 가나다순`);
  doc.setCreator("winnertoeic.com");
  doc.setLanguage("ko-KR");
  doc.catalog.getOrCreateViewerPreferences().setPrintScaling(PrintScaling.None);
  return { bytes: await doc.save(), pages: sheets.length, layout, drawn: all.drawn, shrunk: all.shrunk };
}
