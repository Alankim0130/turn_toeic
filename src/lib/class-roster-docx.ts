/**
 * 반별 명단 · 레벨별 명단 **Word(.docx)** (2026-10-15 Alan "학생명단 워드로도 다운받을 수 있게 부탁해").
 * PDF(`class-roster-pdf.ts`)와 **같은 쪽**을 Word 표로 만든다 — 쪽 나눔은 `class-roster-sheets.ts` 한곳이라 두 파일의 쪽 · 칸 · 줄이 늘 같다.
 *
 * - A4 세로 · 레벨마다 새 쪽 · 쪽마다 레벨 띠(레벨 색) · 범례 · 표(칸 머리 + 이름 줄). 이름 10pt · 줄 높이 고정(`ROW_H`) — PDF 와 같다.
 *   레벨별 명단은 칸 안에 이름을 두 단으로 (위에서 아래로 → 옆 단, PDF 와 같다).
 * - 제목 · 기간 · 출력 시각은 **머리글**, `역전토익 학생명단 · 반별` · 쪽 번호는 **바닥글** (Word 머리글 · 바닥글은 모든 쪽이 같다).
 *   그래서 학생이 없는 반은 그 레벨 마지막 쪽 **표 아래**에 적는다 (PDF 는 그 쪽 바닥 줄).
 * - **고칠 수 있는 Word 표다** — 이름 한 칸이 한 사람이라 지우거나 빈칸에 새로 적으면 된다 (그림이 아니다). 그래서 Word 로 달라고 했다.
 * - 글줄 간격은 **'정확히'**, 표 줄 높이는 그 높이 '이상'(`ROW_H`)으로 둔다 — Word · 한컴 · 맥이 글꼴을 서로 다르게 바꿔 보여 줘도 한 쪽에 같은 줄 수가 들고,
 *   고쳐 쓰다 이름이 길어지면 잘리지 않고 줄이 커진다. 한 쪽에 41줄이 들고도 12mm 쯤 남는다 (`sheetHeightMm` · `BODY_MM` — 테스트가 본다).
 *   이어지는 쪽은 쪽 나누기로 새 쪽에서 시작한다. 한글 · 영문 사이 자동 간격은 끈다 (Word 한국어 기본은 켜져 `2026 년` 처럼 벌어진다).
 * - 이름이 칸보다 길면 그 이름만 글자를 줄인다 — 글꼴 폭을 넉넉히 짐작해서 (`emWidth`). 한국 이름은 여섯 칸 레벨에서도 10pt 로 든다.
 * - 글꼴은 이름(`맑은 고딕`)만 적는다 — 파일에 싣지 않는다 (윈도 · 한컴은 다 있다. 맥 · 다른 앱은 비슷한 한글 글꼴로 바꿔 보여 준다).
 * - **라이브러리 없이 XML 을 직접 쓴다** (`zip.ts` 로 묶는다). 요소 순서는 OOXML 스키마 순서다 — **Word 는 순서가 틀리면 파일을 못 연다**
 *   (pPr: pageBreakBefore → tabs → spacing → jc → rPr · rPr: b → color → sz → shd · tcPr: tcW → gridSpan → shd → tcMar → vAlign).
 *   손댈 때는 docx 스킬의 `validate.py`(XSD)로 다시 확인한다 — CLAUDE.md "학생명단 반별 명단".
 * - 학생 이름이 든 파일이다 — 라우트가 `private, no-store` 로 내려 준다 (`/admin/students/roster-docx`).
 */
import { columnDetail, columnHeading, marksText, rosterMarks, toneOf, type ClassRoster } from "./class-roster";
import { HEAD_H, MX, NAME_PT, nameSlots, PAGE_H, planRosterSheets, rosterBrand, ROW_H, shownColumns, SUB_COLUMNS, type RosterSheet } from "./class-roster-sheets";
import { zipFiles } from "./zip";

/** 쪽 하나에 무엇을 적었나 — 테스트가 PDF 의 쪽과 같은지 본다 (`note` = 표 아래에 적은 학생이 없는 반 · 칸을 찾지 못한 학생 수) */
export type RosterDocxPage = { level: string | null; columns: string[]; part: number; note: string };
export type RosterDocx = {
  bytes: Uint8Array;
  pages: number;
  layout: RosterDocxPage[];
  /** 적은 글자 (본문 · 머리글 · 바닥글 순) */
  text: string[];
  /** 칸 폭보다 길어 글자를 줄여 적은 것 */
  shrunk: string[];
};

const MM_TW = 1440 / 25.4;
/** mm → twip (Word 길이 단위, 1/20 pt) */
const tw = (mm: number) => Math.round(mm * MM_TW);
const PT_MM = 25.4 / 72;

/** A4 세로 (twip — Word 의 A4 값 그대로) */
const PAGE_W_TW = 11906;
const PAGE_H_TW = 16838;
const MARGIN_X = tw(MX);
/** 본문 폭 — PDF 와 같은 190mm (칸 폭이 같다) */
const CONTENT_W = PAGE_W_TW - MARGIN_X * 2;
/** 본문 위 · 아래 (mm). 머리글(제목 줄 7mm)은 종이 위 6mm 에, 바닥글(쪽 번호 4mm)은 종이 아래 6mm 에 서서 본문과 겹치지 않는다 */
const TOP_MM = 14;
const BOTTOM_MM = 11;
const EDGE_MM = 6;
/** 본문이 쓸 수 있는 높이 (mm) */
export const BODY_MM = PAGE_H - TOP_MM - BOTTOM_MM;

/** 쪽 안의 높이 (mm) — 레벨 띠 · 범례(위 1 · 줄 5 · 아래 1.5) · 학생이 없는 반 한 줄(위 1.5 · 줄 3.6) */
const BAND_MM = 10;
const LEGEND = { before: 1, line: 5, after: 1.5 };
const NOTE = { before: 1.5, line: 3.6 };
/** 칸 머리 안 — 위 여백 1.2 · 칸 이름 줄 5.6 · 둘째 줄 4.4 (합 11.2 < 칸 머리 12.5) */
const HEAD_LINES = { top: 1.2, title: 5.6, detail: 4.4 };
/** 이름 칸 안의 글줄 (pt) — 10pt 이름이 잘리지 않는 높이. 줄은 `ROW_H` 로 정확히 */
const NAME_LINE_PT = 12.8;
/** 칸 안 좌우 여백 (mm) — PDF 와 같다 */
const PAD_MM = 1.6;

const ROW_TW = tw(ROW_H);
const HEAD_TW = tw(HEAD_H);

/**
 * 쪽 하나의 높이 (mm) — 레벨 띠 · 범례 · 칸 머리 · 이름 `rows` 줄 · 학생이 없는 반 `noteLines` 줄.
 * Word 는 줄 높이를 twip 으로 반올림하므로 그 값으로 센다. `BODY_MM` 보다 작아야 쪽이 넘치지 않는다 (`class-roster-docx.test.ts`).
 */
export function sheetHeightMm(rows: number, noteLines = 0): number {
  const legend = LEGEND.before + LEGEND.line + LEGEND.after;
  const note = noteLines > 0 ? NOTE.before + NOTE.line * noteLines : 0;
  return BAND_MM + legend + HEAD_TW / MM_TW + (rows * ROW_TW) / MM_TW + note;
}

const COLOR = { ink: "17121F", sub: "4A4453", mute: "8E8799", mark: "55505E", white: "FFFFFF" } as const;
const hex = (h: string) => h.replace(/^#/, "").toUpperCase();

/**
 * 글자 폭 짐작 (em) — 맑은 고딕 · 애플 SD 고딕 · 한컴 글꼴 어느 것이든 넘지 않게 넉넉히.
 * 한글 · 한자 1, 영문 대문자 0.7, 소문자 · 숫자 0.6, 빈칸 0.33, 문장부호 0.4.
 */
export function emWidth(text: string): number {
  let w = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    if (c === 0x20) w += 0.33;
    else if (c >= 0x30 && c <= 0x39) w += 0.6;
    else if (c >= 0x41 && c <= 0x5a) w += 0.7;
    else if (c >= 0x61 && c <= 0x7a) w += 0.6;
    else if (c < 0x80 || c === 0xb7) w += 0.4;
    else w += 1;
  }
  return w;
}

type Run = { t: string; pt: number; color: string; bold?: boolean; shade?: string; tab?: boolean };

const runsWidthMm = (runs: readonly Run[]) => runs.reduce((w, r) => w + emWidth(r.t) * r.pt * PT_MM, 0);

/** 폭(mm)에 안 들어가면 조각 크기를 같은 비율로 줄인다 — 반 pt 단위로 내림 (Word 글자 크기 단위). 줄였으면 shrunk 참 */
function fitRuns(runs: Run[], maxMm: number): { runs: Run[]; shrunk: boolean } {
  const total = runsWidthMm(runs);
  if (total <= maxMm) return { runs, shrunk: false };
  const k = maxMm / total;
  return { runs: runs.map((r) => ({ ...r, pt: Math.max(4, Math.floor(r.pt * k * 2) / 2) })), shrunk: true };
}

/** XML 1.0 에 못 넣는 글자(제어 문자 · 짝 잃은 서로게이트) — 이름에 섞여 오면 Word 가 파일을 못 연다 */
const INVALID_XML = /[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;
/** 글자 → XML 글 (줄바꿈 · 탭은 빈칸으로 — 한 칸 한 줄이다) */
export const xmlText = (s: string) =>
  s.replace(INVALID_XML, "").replace(/[\t\n\r]+/g, " ").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function runXml(r: Run): string {
  const size = Math.round(r.pt * 2);
  const props =
    (r.bold ? "<w:b/><w:bCs/>" : "") +
    `<w:color w:val="${r.color}"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/>` +
    (r.shade ? `<w:shd w:val="clear" w:color="auto" w:fill="${r.shade}"/>` : "");
  return `<w:r><w:rPr>${props}</w:rPr>${r.tab ? "<w:tab/>" : ""}<w:t xml:space="preserve">${xmlText(r.t)}</w:t></w:r>`;
}

/** 글줄 하나 — 줄 간격은 늘 '정확히'(twip) */
function paraXml(runs: readonly Run[], o: { line: number; before?: number; after?: number; pageBreak?: boolean; tabRight?: boolean }): string {
  const pPr =
    (o.pageBreak ? "<w:pageBreakBefore/>" : "") +
    (o.tabRight ? `<w:tabs><w:tab w:val="right" w:pos="${CONTENT_W}"/></w:tabs>` : "") +
    `<w:spacing w:before="${o.before ?? 0}" w:after="${o.after ?? 0}" w:line="${o.line}" w:lineRule="exact"/>`;
  return `<w:p><w:pPr>${pPr}</w:pPr>${runs.filter((r) => r.t || r.tab).map(runXml).join("")}</w:p>`;
}

const EMPTY_P = "<w:p/>";

function cellXml(o: { width: number; span?: number; fill?: string; vAlign: "top" | "center"; marTop?: number; body?: string }): string {
  const tcPr =
    `<w:tcW w:w="${o.width}" w:type="dxa"/>` +
    (o.span && o.span > 1 ? `<w:gridSpan w:val="${o.span}"/>` : "") +
    (o.fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${o.fill}"/>` : "") +
    (o.marTop ? `<w:tcMar><w:top w:w="${o.marTop}" w:type="dxa"/></w:tcMar>` : "") +
    `<w:vAlign w:val="${o.vAlign}"/>`;
  return `<w:tc><w:tcPr>${tcPr}</w:tcPr>${o.body || EMPTY_P}</w:tc>`;
}

/**
 * 표 한 줄 — 높이는 '최소'(atLeast)다: 평소에는 정확히 그 높이이고, 고쳐 쓰다 이름이 길어지면 잘리지 않고 줄이 커진다.
 * 칸 머리 줄은 표가 다음 쪽으로 넘어가면 그 쪽 위에 다시 선다(`tblHeader` — 고쳐 쓰다 줄을 많이 더했을 때)
 */
const rowXml = (height: number, cells: string, head = false) =>
  `<w:tr><w:trPr><w:cantSplit/><w:trHeight w:val="${height}" w:hRule="atLeast"/>${head ? "<w:tblHeader/>" : ""}</w:trPr>${cells}</w:tr>`;

/** 문서 끝 — Word 는 본문이 글줄로 끝나야 한다 (표로 끝나면 빈 글줄을 덧붙이다 새 쪽이 생길 수 있어 아주 작은 글줄을 둔다) */
const TAIL_P = `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/><w:rPr><w:sz w:val="2"/><w:szCs w:val="2"/></w:rPr></w:pPr></w:p>`;

const NS_W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const XML_HEAD = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n`;
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

export function buildClassRosterDocx({
  roster,
  title,
  period,
  printedAt,
  createdAt = new Date(),
}: {
  roster: ClassRoster;
  /** "2026년 10월 반별 명단" — 머리글 제목 */
  title: string;
  /** "10/6 개강 ~ 11/3 종강" */
  period: string;
  /** "2026-10-14 21:05" */
  printedAt: string;
  /** 파일 속성의 만든 시각 */
  createdAt?: Date;
}): RosterDocx {
  const subs = SUB_COLUMNS[roster.by];
  const legend = `표시  ${rosterMarks(roster.by)
    .map((m) => `(${m.mark}) ${m.label}`)
    .join("   ")}`;
  const sheets = planRosterSheets(roster);
  const text: string[] = [];
  const shrunk: string[] = [];
  const layout: RosterDocxPage[] = [];
  /** 적는 조각을 모아 둔다 (테스트용) */
  const note = (runs: readonly Run[]) => {
    for (const r of runs) if (r.t) text.push(r.t);
    return runs;
  };
  const fit = (runs: Run[], maxMm: number) => {
    const out = fitRuns(runs, maxMm);
    if (out.shrunk) shrunk.push(runs.map((r) => r.t).join(""));
    return note(out.runs);
  };

  const body: string[] = [];
  sheets.forEach((sheet, index) => {
    const block = sheet.block;
    const pageBreak = index > 0;
    if (block) {
      const tone = toneOf(block.level.tone);
      // ─ 레벨 띠 — 레벨 색 네모에 레벨(" 650 "), 옆에 그 레벨 학생 수 ─
      body.push(
        paraXml(
          note([
            { t: `  ${block.level.label}  `, pt: 18, color: hex(tone.ink), bold: true, shade: hex(tone.head) },
            { t: `   학생 ${block.level.count}명${sheet.levelStart ? "" : " · 이어서"}`, pt: 9.5, color: COLOR.sub },
          ]),
          { line: tw(BAND_MM), pageBreak },
        ),
      );
    }
    body.push(paraXml(fit([{ t: legend, pt: 7.5, color: COLOR.sub }], CONTENT_W / MM_TW), { line: tw(LEGEND.line), before: tw(LEGEND.before), after: tw(LEGEND.after), pageBreak: pageBreak && !block }));
    if (!block) {
      body.push(paraXml(note([{ t: "이 명단에 선 학생이 없어요", pt: 11, color: COLOR.mute }]), { line: tw(8), before: tw(4) }));
    } else {
      body.push(tableXml(sheet, subs, fit));
    }
    if (sheet.note) body.push(paraXml(note([{ t: sheet.note, pt: 7, color: COLOR.mute }]), { line: tw(NOTE.line), before: tw(NOTE.before) }));
    layout.push({
      level: block?.level.label ?? null,
      columns: block ? shownColumns(block, sheet.from).map(({ col }) => columnHeading(col)) : [],
      part: sheet.part,
      note: sheet.note,
    });
  });
  if (!body[body.length - 1]?.startsWith("<w:p>")) body.push(TAIL_P);

  // ─ 머리글: 제목 · (오른쪽) 기간 · 출력 시각 / 바닥글: 학생명단 · (오른쪽) 쪽 번호 ─
  const header = paraXml(
    note([
      { t: title, pt: 14, color: COLOR.ink, bold: true },
      { t: [period, `${printedAt} 출력`].filter(Boolean).join(" · "), pt: 7.5, color: COLOR.sub, tab: true },
    ]),
    { line: tw(7), tabRight: true },
  );
  const brand = note([{ t: rosterBrand(roster.by), pt: 7, color: COLOR.mute }])[0];
  const fieldRun = (code: string, cached: string) => {
    const rPr = `<w:rPr><w:color w:val="${COLOR.mute}"/><w:sz w:val="14"/><w:szCs w:val="14"/></w:rPr>`;
    return (
      `<w:r>${rPr}<w:fldChar w:fldCharType="begin"/></w:r>` +
      `<w:r>${rPr}<w:instrText xml:space="preserve"> ${code} </w:instrText></w:r>` +
      `<w:r>${rPr}<w:fldChar w:fldCharType="separate"/></w:r>` +
      `<w:r>${rPr}<w:t>${cached}</w:t></w:r>` +
      `<w:r>${rPr}<w:fldChar w:fldCharType="end"/></w:r>`
    );
  };
  const footer =
    `<w:p><w:pPr><w:tabs><w:tab w:val="right" w:pos="${CONTENT_W}"/></w:tabs><w:spacing w:before="0" w:after="0" w:line="${tw(4)}" w:lineRule="exact"/></w:pPr>` +
    runXml(brand) +
    `<w:r><w:rPr><w:color w:val="${COLOR.mute}"/><w:sz w:val="14"/><w:szCs w:val="14"/></w:rPr><w:tab/></w:r>` +
    fieldRun("PAGE", "1") +
    runXml({ t: " / ", pt: 7, color: COLOR.mute }) +
    fieldRun("NUMPAGES", String(sheets.length)) +
    `</w:p>`;

  const sectPr =
    `<w:sectPr><w:headerReference w:type="default" r:id="rId3"/><w:footerReference w:type="default" r:id="rId4"/>` +
    `<w:pgSz w:w="${PAGE_W_TW}" w:h="${PAGE_H_TW}"/>` +
    `<w:pgMar w:top="${tw(TOP_MM)}" w:right="${MARGIN_X}" w:bottom="${tw(BOTTOM_MM)}" w:left="${MARGIN_X}" w:header="${tw(EDGE_MM)}" w:footer="${tw(EDGE_MM)}" w:gutter="0"/>` +
    `<w:cols w:space="425"/></w:sectPr>`;

  const document = `${XML_HEAD}<w:document xmlns:w="${NS_W}" xmlns:r="${NS_R}"><w:body>${body.join("")}${sectPr}</w:body></w:document>`;
  const headerXml = `${XML_HEAD}<w:hdr xmlns:w="${NS_W}" xmlns:r="${NS_R}">${header}</w:hdr>`;
  const footerXml = `${XML_HEAD}<w:ftr xmlns:w="${NS_W}" xmlns:r="${NS_R}">${footer}</w:ftr>`;
  const font = "맑은 고딕";
  const styles =
    `${XML_HEAD}<w:styles xmlns:w="${NS_W}"><w:docDefaults>` +
    `<w:rPrDefault><w:rPr><w:rFonts w:ascii="${font}" w:eastAsia="${font}" w:hAnsi="${font}" w:cs="${font}"/><w:color w:val="${COLOR.ink}"/>` +
    `<w:sz w:val="${NAME_PT * 2}"/><w:szCs w:val="${NAME_PT * 2}"/><w:lang w:val="ko-KR" w:eastAsia="ko-KR" w:bidi="ar-SA"/></w:rPr></w:rPrDefault>` +
    `<w:pPrDefault><w:pPr><w:autoSpaceDE w:val="0"/><w:autoSpaceDN w:val="0"/><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>` +
    `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:pPr><w:autoSpaceDE w:val="0"/><w:autoSpaceDN w:val="0"/></w:pPr></w:style>` +
    `<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:uiPriority w:val="99"/><w:semiHidden/><w:unhideWhenUsed/>` +
    `<w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>` +
    `</w:styles>`;
  const settings =
    `${XML_HEAD}<w:settings xmlns:w="${NS_W}"><w:zoom w:percent="100"/><w:defaultTabStop w:val="800"/><w:characterSpacingControl w:val="doNotCompress"/>` +
    `<w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat>` +
    `<w:themeFontLang w:val="en-US" w:eastAsia="ko-KR"/></w:settings>`;
  const stamp = createdAt.toISOString().replace(/\.\d{3}Z$/, "Z");
  const core =
    `${XML_HEAD}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" ` +
    `xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
    `<dc:title>${xmlText(title)}</dc:title><dc:subject>${xmlText(`${title} — 레벨마다 한 쪽 · 이름 가나다순`)}</dc:subject><dc:creator>역전토익</dc:creator>` +
    `<cp:lastModifiedBy>역전토익</cp:lastModifiedBy><dc:language>ko-KR</dc:language>` +
    `<dcterms:created xsi:type="dcterms:W3CDTF">${stamp}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${stamp}</dcterms:modified></cp:coreProperties>`;
  const app =
    `${XML_HEAD}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">` +
    `<Application>winnertoeic.com</Application><Pages>${sheets.length}</Pages><Company>역전토익</Company></Properties>`;
  const contentTypes =
    `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
    `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` +
    `<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>` +
    `<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>` +
    `<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>` +
    `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>` +
    `<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;
  const rootRels =
    `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="${REL}/officeDocument" Target="word/document.xml"/>` +
    `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>` +
    `<Relationship Id="rId3" Type="${REL}/extended-properties" Target="docProps/app.xml"/></Relationships>`;
  const docRels =
    `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="${REL}/styles" Target="styles.xml"/><Relationship Id="rId2" Type="${REL}/settings" Target="settings.xml"/>` +
    `<Relationship Id="rId3" Type="${REL}/header" Target="header1.xml"/><Relationship Id="rId4" Type="${REL}/footer" Target="footer1.xml"/></Relationships>`;

  const bytes = zipFiles(
    [
      { name: "[Content_Types].xml", data: contentTypes },
      { name: "_rels/.rels", data: rootRels },
      { name: "word/document.xml", data: document },
      { name: "word/_rels/document.xml.rels", data: docRels },
      { name: "word/styles.xml", data: styles },
      { name: "word/settings.xml", data: settings },
      { name: "word/header1.xml", data: headerXml },
      { name: "word/footer1.xml", data: footerXml },
      { name: "docProps/core.xml", data: core },
      { name: "docProps/app.xml", data: app },
    ],
    createdAt,
  );
  return { bytes, pages: sheets.length, layout, text, shrunk };
}

/**
 * 쪽 하나의 표 — 칸 머리 한 줄 + 이름 줄. 칸 자리는 그 레벨 첫 쪽과 같고(이어지는 쪽에서 다 적은 칸은 빈 자리로 남긴다 — 색 · 글 없음),
 * 바탕은 이 쪽에 이름이 있는 줄까지만 칠한다 (PDF 와 같다). 칸 사이 · 줄 사이는 흰 선.
 */
function tableXml(sheet: RosterSheet, subs: number, fit: (runs: Run[], maxMm: number) => readonly Run[]): string {
  const block = sheet.block!;
  const tone = toneOf(block.level.tone);
  const n = block.columns.length;
  const subTw = Math.floor(Math.floor(CONTENT_W / Math.max(2, n)) / subs);
  const colTw = subTw * subs;
  const shown = new Set(shownColumns(block, sheet.from).map(({ i }) => i));
  const rows = Math.ceil((sheet.to - sheet.from) / subs);
  const innerMm = (w: number) => w / MM_TW - PAD_MM * 2;
  const more = sheet.part > 0 ? " · 이어서" : "";

  // ─ 칸 머리 ─
  const head = block.columns
    .map((col, i) => {
      if (!shown.has(i)) return cellXml({ width: colTw, span: subs, vAlign: "top" });
      const ink = hex(tone.ink);
      const titleRuns = fit(
        [
          { t: col.title, pt: 10, color: ink, bold: true },
          { t: col.time ? ` ${col.time}` : "", pt: 8, color: ink, bold: true },
        ],
        innerMm(colTw),
      );
      const detail = fit([{ t: [columnDetail(col), `${col.students.length}명${more}`].filter(Boolean).join(" · "), pt: 7, color: COLOR.sub }], innerMm(colTw));
      return cellXml({
        width: colTw,
        span: subs,
        fill: hex(tone.head),
        vAlign: "top",
        marTop: tw(HEAD_LINES.top),
        body: paraXml(titleRuns, { line: tw(HEAD_LINES.title) }) + paraXml(detail, { line: tw(HEAD_LINES.detail) }),
      });
    })
    .join("");

  // ─ 이름 줄 — 칸마다 이 쪽의 이름을 `subs` 단으로 (위에서 아래로 → 옆 단). 반별 명단은 한 단 ─
  const slots = block.columns.map((col) => {
    const names = col.students.slice(sheet.from, sheet.to);
    const grid = new Map<string, (typeof names)[number]>();
    nameSlots(names.length, subs).forEach(({ sub, row }, k) => grid.set(`${row}:${sub}`, names[k]));
    return grid;
  });
  const bodyRows: string[] = [];
  for (let r = 0; r < rows; r++) {
    const cells = block.columns
      .map((_, i) =>
        Array.from({ length: subs }, (_, s) => {
          if (!shown.has(i)) return cellXml({ width: subTw, vAlign: "center" });
          const st = slots[i].get(`${r}:${s}`);
          const runs = st
            ? fit(
                [
                  { t: st.name || "이름 없음", pt: NAME_PT, color: COLOR.ink, bold: true },
                  { t: st.marks.length > 0 ? ` ${marksText(st.marks)}` : "", pt: NAME_PT * 0.8, color: COLOR.mark, bold: true },
                ],
                innerMm(subTw),
              )
            : [];
          return cellXml({ width: subTw, fill: hex(tone.body), vAlign: "center", body: runs.length > 0 ? paraXml(runs, { line: Math.round(NAME_LINE_PT * 20) }) : undefined });
        }).join(""),
      )
      .join("");
    bodyRows.push(rowXml(ROW_TW, cells));
  }

  const grid = Array.from({ length: n * subs }, () => `<w:gridCol w:w="${subTw}"/>`).join("");
  const white = `w:val="single" w:sz="4" w:space="0" w:color="${COLOR.white}"`;
  const tblPr =
    `<w:tblW w:w="${colTw * n}" w:type="dxa"/>` +
    `<w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH ${white}/><w:insideV w:val="single" w:sz="6" w:space="0" w:color="${COLOR.white}"/></w:tblBorders>` +
    `<w:tblLayout w:type="fixed"/>` +
    `<w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="${tw(PAD_MM)}" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="${tw(PAD_MM)}" w:type="dxa"/></w:tblCellMar>`;
  return `<w:tbl><w:tblPr>${tblPr}</w:tblPr><w:tblGrid>${grid}</w:tblGrid>${rowXml(HEAD_TW, head, true)}${bodyRows.join("")}</w:tbl>`;
}
