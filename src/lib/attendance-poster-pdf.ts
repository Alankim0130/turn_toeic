/**
 * 출석 QR 포스터 PDF (2026-09-22 Alan — "새로 만들기 버튼을 누르면 인쇄까지 할 수 있도록 다운로드가 있으면 좋겠어").
 *
 * - **A4 가로 한 장 = A5 세로 포스터 두 장.** 가운데 점선을 자르면 강의실마다 한 장씩 붙인다. 두 장은 QR 이 같고
 *   강사만 다르다 (`site.instructors[].casual` 의 첫 컷 — 이혜영 가리키기 · 이영수 엄지척).
 * - **전부 벡터로 그린다** — QR 칸은 순검정 네모라 어떤 프린터에서도 또렷하고, 글자는 `assets/poster-fonts/` 의
 *   Pretendard(포스터 글자만 남긴 파일)를 넣는다. 그림(QR 을 찍는 휴대폰 · 출석 도장)은 힉스필드로 만든 `public/posters/` 다 —
 *   AI 가 그린 QR 은 안 찍히고 한글은 깨지므로 QR 과 글자는 코드로 그린다.
 * - QR 은 H(30% 복구) + 가운데 브랜드 심벌 (가리는 넓이는 5% 안쪽). 칸이 순검정인 이유: 컬러 레이저는 진회색을 여러 색으로 섞어 찍어 번진다.
 * - 중요한 것은 전부 종이 가장자리에서 7mm 안쪽이다 — 가정·사무실 프린터는 가장자리 4~5mm 를 못 찍는다.
 *   인쇄 배율은 "실제 크기" 로 열리게 해 둔다 (PrintScaling None — 아크로뱃은 따르고, 브라우저가 줄여도 7mm 안쪽이라 잘리지 않는다).
 * - 좌표는 전부 mm, 위에서 아래로 잰다 (2026-09-21 HTML 포스터를 그대로 옮긴 치수). 글자·그림 불러오기는
 *   `attendance-poster-assets.ts` 가 하고 이 파일은 받은 것으로 그리기만 한다 — 그래서 테스트가 파일 없이도 돈다.
 */
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, PrintScaling, rgb, setCharacterSpacing, type PDFFont, type PDFImage, type PDFPage, type RGB } from "pdf-lib";
import { POSTER_TEXT, issuedLabel } from "./attendance-poster";
import { qrPath, QR_QUIET, type QrMatrix } from "./qr-svg";

/** 그림 한 장. 사진은 jpg(흰 바탕으로 채움), 나머지는 투명 바탕 png */
export type ImageAsset = { data: Uint8Array; kind: "png" | "jpg"; width: number; height: number };

export type PosterAssets = {
  fonts: { black: Uint8Array; bold: Uint8Array; semibold: Uint8Array };
  logo: ImageAsset;
  symbol: ImageAsset;
  phone: ImageAsset;
  stamp: ImageAsset;
  /** 포스터 두 장의 강사 (왼쪽 · 오른쪽) */
  people: { name: string; part: string; photo: ImageAsset }[];
};

export type PosterPdf = {
  bytes: Uint8Array;
  /** 그린 글자 — 글꼴에 빠진 글자가 없는지 테스트가 본다 */
  drawn: string[];
  /** 칸보다 길어 글자를 줄여 그린 줄 — 비어 있어야 한다 (문구를 바꿨을 때 넘치는지 테스트가 본다) */
  shrunk: string[];
};

const MM = 72 / 25.4;
const PAGE_W = 297;
const PAGE_H = 210;
const HALF = PAGE_W / 2;

const hex = (h: string): RGB => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const C = {
  brand: hex("#FF2E88"),
  brandText: hex("#E61E75"),
  tint: hex("#FFE4EF"),
  ink: hex("#17121F"),
  sub: hex("#4A4453"),
  foot: hex("#5B5466"),
  mute: hex("#8E8799"),
  cut: hex("#BDB5C4"),
  white: rgb(1, 1, 1),
  black: rgb(0, 0, 0),
};

/** Pretendard 의 세로 치수 (unitsPerEm 2048 · ascent 1950 · descent -494) — CSS 의 line-height 계산과 같게 글자 기준선을 잡는다 */
const ASC = 1950 / 2048;
const CONTENT = (1950 + 494) / 2048;
/** CSS `line-height: normal` */
const LH_NORMAL = CONTENT;

const f2 = (n: number) => +n.toFixed(3);

/** 둥근 네모 (mm, 위에서 아래로) → SVG path */
function roundRect(x: number, y: number, w: number, h: number, r: number) {
  const k = r * 0.4477; // 원호를 베지어로: r × (1 − 0.5523)
  return [
    `M${f2(x + r)} ${f2(y)}`,
    `H${f2(x + w - r)}`,
    `C${f2(x + w - k)} ${f2(y)} ${f2(x + w)} ${f2(y + k)} ${f2(x + w)} ${f2(y + r)}`,
    `V${f2(y + h - r)}`,
    `C${f2(x + w)} ${f2(y + h - k)} ${f2(x + w - k)} ${f2(y + h)} ${f2(x + w - r)} ${f2(y + h)}`,
    `H${f2(x + r)}`,
    `C${f2(x + k)} ${f2(y + h)} ${f2(x)} ${f2(y + h - k)} ${f2(x)} ${f2(y + h - r)}`,
    `V${f2(y + r)}`,
    `C${f2(x)} ${f2(y + k)} ${f2(x + k)} ${f2(y)} ${f2(x + r)} ${f2(y)}`,
    "Z",
  ].join("");
}

type Fonts = { black: PDFFont; bold: PDFFont; semibold: PDFFont };
type TextOpts = {
  font: PDFFont;
  size: number; // pt
  color: RGB;
  /** 줄 상자 위쪽 (mm) */
  top: number;
  /** 줄 상자 높이 (mm) — 기본은 CSS line-height: normal */
  lh?: number;
  /** 글자 사이 (em) */
  ls?: number;
  align?: "left" | "center" | "right";
  /** align 기준점 (mm): left 면 왼쪽 끝, center 면 가운데, right 면 오른쪽 끝 */
  x: number;
  /** 넘으면 글자를 줄인다 (mm) */
  maxW?: number;
};

class Canvas {
  readonly drawn: string[] = [];
  readonly shrunk: string[] = [];
  constructor(
    readonly page: PDFPage,
    readonly fonts: Fonts,
  ) {}

  /** mm 좌표(위에서 아래로)의 SVG path 를 채우거나 긋는다 */
  path(d: string, o: { fill?: RGB; stroke?: RGB; width?: number; dash?: number[] }) {
    this.page.drawSvgPath(d, {
      x: 0,
      y: PAGE_H * MM,
      scale: MM,
      color: o.fill,
      borderColor: o.stroke,
      borderWidth: o.stroke ? o.width : undefined,
      borderDashArray: o.dash,
    });
  }

  image(img: PDFImage, x: number, y: number, w: number, h: number) {
    this.page.drawImage(img, { x: x * MM, y: (PAGE_H - y - h) * MM, width: w * MM, height: h * MM });
  }

  /** 글자 폭 (mm) — 글자 사이(ls)를 넣어 잰다 */
  width(s: string, font: PDFFont, size: number, ls = 0) {
    const n = [...s].length;
    return (font.widthOfTextAtSize(s, size) + ls * size * Math.max(0, n - 1)) / MM;
  }

  /** 한 줄. 조각마다 색·굵기가 다를 수 있다 (큰 제목의 분홍 "찰칵") */
  line(runs: { t: string; font?: PDFFont; color?: RGB }[], o: TextOpts) {
    let size = o.size;
    const ls = o.ls ?? 0;
    const total = () => runs.reduce((w, r) => w + this.width(r.t, r.font ?? o.font, size, ls), 0) + (runs.length - 1) * ((ls * size) / MM);
    if (o.maxW && total() > o.maxW) {
      this.shrunk.push(runs.map((r) => r.t).join(""));
      size = size * (o.maxW / total());
    }
    const w = total();
    let x = o.align === "center" ? o.x - w / 2 : o.align === "right" ? o.x - w : o.x;
    const lh = o.lh ?? (LH_NORMAL * size) / MM;
    const base = o.top + (lh - (CONTENT * size) / MM) / 2 + (ASC * size) / MM;
    if (ls) this.page.pushOperators(setCharacterSpacing(ls * size));
    for (const r of runs) {
      const font = r.font ?? o.font;
      this.drawn.push(r.t);
      this.page.drawText(r.t, { x: x * MM, y: (PAGE_H - base) * MM, size, font, color: r.color ?? o.color });
      x += this.width(r.t, font, size, ls) + (ls * size) / MM;
    }
    if (ls) this.page.pushOperators(setCharacterSpacing(0));
  }

  text(s: string, o: TextOpts) {
    this.line([{ t: s }], o);
  }

  /** 가운데에 글자를 둔 알약 (강의실 출석 QR · LC · 이혜영). 오른쪽 끝(right)에 맞춘다 */
  pill(s: string, o: { right: number; top: number; h: number; padX: number; size: number; font: PDFFont; fill: RGB; color: RGB; ls?: number }) {
    const w = this.width(s, o.font, o.size, o.ls) + o.padX * 2;
    this.path(roundRect(o.right - w, o.top, w, o.h, o.h / 2), { fill: o.fill });
    this.text(s, { font: o.font, size: o.size, color: o.color, ls: o.ls, top: o.top, lh: o.h, x: o.right - w / 2, align: "center" });
  }
}

type Images = { logo: PDFImage; symbol: PDFImage; phone: PDFImage; stamp: PDFImage };

/** QR (순검정 칸 + 가운데 흰 둥근 네모와 브랜드 심벌). (x, y) 는 조용한 여백까지 포함한 네모의 왼쪽 위, side 는 한 변 (mm) */
function drawQr(cv: Canvas, m: QrMatrix, symbol: PDFImage, x: number, y: number, side: number) {
  const cells = m.size + QR_QUIET * 2;
  const u = side / cells; // 한 칸 (mm)
  cv.page.drawSvgPath(qrPath(m), { x: x * MM, y: (PAGE_H - y) * MM, scale: u * MM, color: C.black });
  const box = m.size * 0.22; // 한 변의 22% = 넓이 약 5%. H 는 30% 까지 되살린다
  const at = (cells - box) / 2;
  const pad = box * 0.14;
  cv.path(roundRect(x + at * u, y + at * u, box * u, box * u, box * 0.24 * u), { fill: C.white });
  cv.image(symbol, x + (at + pad) * u, y + (at + pad) * u, (box - pad * 2) * u, (box - pad * 2) * u);
}

/** 포스터 한 장 (A5 세로, 왼쪽 끝 ox mm) */
function drawPoster(cv: Canvas, img: Images, who: { name: string; part: string; photo: PDFImage; ratio: number }, qr: QrMatrix, issued: string, ox: number) {
  const { black, bold, semibold } = cv.fonts;
  const T = POSTER_TEXT;

  // 분홍 테두리 — 두께 0.9 는 상자 안쪽으로 (CSS border 와 같게 선의 가운데를 0.45 안으로)
  cv.path(roundRect(ox + 7.45, 7.45, 133.6, 195.1, 6.55), { stroke: C.brand, width: 0.9 });

  const L = ox + 15.4; // 글 상자 왼쪽 (여백 7 + 테두리 0.9 + 안쪽 7.5)
  const R = ox + 133.1; // 오른쪽
  const W = R - L;

  // ─ 위: 로고 · 알약 ─
  cv.image(img.logo, L, 15.4, (10 * img.logo.width) / img.logo.height, 10);
  cv.pill(T.pill, { right: R, top: 16.7, h: 7.4, padX: 3.4, size: 9.5, font: bold, fill: C.brand, color: C.white, ls: -0.01 });

  // ─ 강사 사진 (제목·QR·안내 상자보다 먼저 — 그 아래에 깔린다. 사진은 흰 바탕 JPEG 라 먼저 그려야 흰 네모가 안 보인다) ─
  const photoH = 50 * who.ratio;
  cv.image(who.photo, R + 5 - 50, 151.58 - photoH, 50, photoH);
  cv.pill(`${who.part} · ${who.name}`, { right: R, top: 134, h: 6.2, padX: 2.8, size: 8, font: bold, fill: C.ink, color: C.white });

  // ─ 큰 제목 · 설명 ─
  T.title.forEach((runs, i) => {
    cv.line(
      runs.map((r) => ({ t: r.t, color: "em" in r && r.em ? C.brand : C.ink })),
      { font: black, size: 26, color: C.ink, ls: -0.03, top: 29.9 + i * 11.006, lh: 11.006, x: L, maxW: 72 },
    );
  });
  T.sub.forEach((s, i) => cv.text(s, { font: semibold, size: 10, color: C.sub, top: 53.9 + i * 5.115, lh: 5.115, x: L, maxW: 70 }));

  // ─ QR 카드 ─
  const qx = L;
  const qy = 72.13;
  cv.path(roundRect(qx + 0.4, qy + 0.4, 63.2, 63.2, 4.6), { fill: C.white, stroke: C.brand, width: 0.8 });
  drawQr(cv, qr, img.symbol, qx + 2.4, qy + 2.4, 59.2);
  cv.text(T.hint, { font: bold, size: 8.5, color: C.brandText, top: qy + 64 + 1.8, lh: 3.97, x: qx + 32, align: "center", maxW: 64 });

  // ─ 두 단계 안내 (연분홍 상자) ─
  const sy = 146.08;
  cv.path(roundRect(L, sy, W, 35.26, 5), { fill: C.tint });
  const colW = (W - 6 - 3) / 2;
  T.steps.forEach((st, i) => {
    const cx = L + 3 + i * (colW + 3) + colW / 2;
    const pic = i === 0 ? img.phone : img.stamp;
    // 휴대폰 그림은 여백이 넓어 같은 높이면 작아 보여 조금 크게, 조금 위로
    const ph = i === 0 ? 19.5 : 17;
    const pw = (ph * pic.width) / pic.height;
    cv.image(pic, cx - pw / 2, i === 0 ? sy + 0.7 : sy + 3.2, pw, ph);

    const ty = sy + 21.8;
    const th = 5.29;
    const tw = cv.width(st.title, black, 11, -0.02);
    const start = cx - (4.8 + 1.4 + tw) / 2;
    cv.path(roundRect(start, ty + (th - 4.8) / 2, 4.8, 4.8, 2.4), { fill: C.brand });
    cv.text(st.n, { font: black, size: 7.5, color: C.white, top: ty + (th - 4.8) / 2, lh: 4.8, x: start + 2.4, align: "center" });
    cv.text(st.title, { font: black, size: 11, color: C.ink, ls: -0.02, top: ty, lh: th, x: start + 6.2, maxW: colW - 6.2 });
    cv.text(st.body, { font: semibold, size: 8.3, color: C.sub, top: ty + th + 0.8, lh: 3.97, x: cx, align: "center", maxW: colW });
  });

  // ─ 바닥 글씨 ─
  const fy = 183.94;
  T.rules.forEach((s, i) => cv.text(s, { font: semibold, size: 7.6, color: C.foot, top: fy + i * 4.02, lh: 4.02, x: L, maxW: W }));
  cv.text(T.help, { font: bold, size: 7.6, color: C.ink, top: fy + 8.64, lh: 4.02, x: L, maxW: W * 0.62 });
  if (issued) cv.text(issued, { font: semibold, size: 7.6, color: C.mute, top: fy + 8.64, lh: 4.02, x: R, align: "right", maxW: W * 0.36 });
}

const embed = (doc: PDFDocument, a: ImageAsset) => (a.kind === "jpg" ? doc.embedJpg(a.data) : doc.embedPng(a.data));

/** A4 가로 한 장(A5 포스터 둘) PDF. 강사가 둘보다 적으면 있는 사람으로 채운다 */
export async function buildPosterPdf({ qr, issuedAt, assets }: { qr: QrMatrix; issuedAt: string | null | undefined; assets: PosterAssets }): Promise<PosterPdf> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  // subset 을 켜야 한다 — 끄면 pdf-lib 가 글자 폭 표를 cmap 에 있는 글자로만 만들어, Pretendard 가 숫자 사이에서 바꿔 끼우는
  // 콜론(colon.case) 같은 대체 글자의 폭이 빠진다 (폭 1000 으로 찍혀 "18:  23" 처럼 벌어졌다 — 2026-09-22 실측)
  const fonts: Fonts = {
    black: await doc.embedFont(assets.fonts.black, { subset: true }),
    bold: await doc.embedFont(assets.fonts.bold, { subset: true }),
    semibold: await doc.embedFont(assets.fonts.semibold, { subset: true }),
  };
  const img: Images = {
    logo: await embed(doc, assets.logo),
    symbol: await embed(doc, assets.symbol),
    phone: await embed(doc, assets.phone),
    stamp: await embed(doc, assets.stamp),
  };
  const people = await Promise.all(
    [0, 1].map(async (k) => {
      const p = assets.people[k % assets.people.length];
      return { name: p.name, part: p.part, photo: await embed(doc, p.photo), ratio: p.photo.height / p.photo.width };
    }),
  );

  const page = doc.addPage([PAGE_W * MM, PAGE_H * MM]);
  const cv = new Canvas(page, fonts);
  const issued = issuedLabel(issuedAt);
  people.forEach((who, k) => drawPoster(cv, img, who, qr, issued, k * HALF));
  // 가운데 자르는 선
  cv.path(`M${HALF} 0V${PAGE_H}`, { stroke: C.cut, width: 0.25, dash: [2, 1.6] });

  doc.setTitle(`역전토익 출석 QR 포스터${issued ? ` (${issued})` : ""}`);
  doc.setAuthor("역전토익");
  doc.setSubject("A4 가로 한 장에 A5 포스터 두 장 — 가운데 점선을 잘라 강의실마다 붙여요");
  doc.setCreator("winnertoeic.com");
  doc.setLanguage("ko-KR");
  doc.catalog.getOrCreateViewerPreferences().setPrintScaling(PrintScaling.None);

  return { bytes: await doc.save(), drawn: cv.drawn, shrunk: cv.shrunk };
}
