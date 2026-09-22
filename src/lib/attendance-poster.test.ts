import { readFileSync } from "node:fs";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, PDFName } from "pdf-lib";
import { beforeAll, describe, expect, it } from "vitest";
import { issuedLabel, posterDisposition, posterFileName, POSTER_TEXT } from "./attendance-poster";
import { loadPosterAssets } from "./attendance-poster-assets";
import { buildPosterPdf, type PosterPdf } from "./attendance-poster-pdf";
import { qrMatrix } from "./qr";
import { site } from "./site";

describe("인쇄용 출석 QR 포스터 PDF", () => {
  const qr = qrMatrix("https://winnertoeic.com/attend?t=ABCDEF0123456789ABCD", "H");
  let pdf: PosterPdf;
  let doc: PDFDocument;

  beforeAll(async () => {
    pdf = await buildPosterPdf({ qr, issuedAt: "2026-09-21T07:40:00Z", assets: await loadPosterAssets() });
    doc = await PDFDocument.load(pdf.bytes);
  }, 30_000);

  it("A4 가로 한 장", () => {
    expect(doc.getPageCount()).toBe(1);
    const { width, height } = doc.getPage(0).getSize();
    expect(width).toBeCloseTo((297 * 72) / 25.4, 1);
    expect(height).toBeCloseTo((210 * 72) / 25.4, 1);
  });

  it("포스터 두 장 — 강사마다 한 장, 발행 시각은 두 장 모두", () => {
    for (const i of site.instructors.slice(0, 2)) expect(pdf.drawn).toContain(`${i.part} · ${i.name}`);
    expect(pdf.drawn.filter((s) => s === "2026.09.21 16:40 발행")).toHaveLength(2);
    expect(pdf.drawn.filter((s) => s === POSTER_TEXT.hint)).toHaveLength(2);
  });

  it("글꼴에 빠진 글자가 없다 — 문구를 바꿨으면 scripts/poster-fonts.mjs 로 글꼴을 다시 만든다", () => {
    for (const w of ["black", "bold", "semibold"]) {
      const font = fontkit.create(readFileSync(`assets/poster-fonts/poster-${w}.ttf`));
      const missing = [...new Set(pdf.drawn.join(""))].filter((ch) => !font.hasGlyphForCodePoint(ch.codePointAt(0)!));
      expect(missing, `poster-${w}.ttf 에 없는 글자`).toEqual([]);
    }
  });

  it("넘쳐서 줄여 그린 줄이 없다", () => {
    expect(pdf.shrunk).toEqual([]);
  });

  it("인쇄 창이 실제 크기로 열린다 · 제목에 발행 시각", () => {
    const prefs = doc.catalog.lookup(PDFName.of("ViewerPreferences"));
    expect(String(prefs)).toContain("/PrintScaling /None");
    expect(doc.getTitle()).toBe("역전토익 출석 QR 포스터 (2026.09.21 16:40 발행)");
  });

  it("파일이 무겁지 않다 (카톡·메일로 보내도 된다)", () => {
    expect(pdf.bytes.length).toBeLessThan(3 * 1024 * 1024);
  });
});

describe("발행 시각 · 파일 이름", () => {
  it("한국 시간으로 적는다", () => {
    expect(issuedLabel("2026-09-20T15:05:00Z")).toBe("2026.09.21 00:05 발행");
    expect(posterFileName("2026-09-20T15:05:00Z")).toBe("역전토익_출석QR포스터_2026-09-21_0005.pdf");
  });

  it("못 읽으면 비운다", () => {
    expect(issuedLabel(null)).toBe("");
    expect(issuedLabel("not a date")).toBe("");
    expect(posterFileName(undefined)).toBe("역전토익_출석QR포스터.pdf");
  });

  it("내려받기 머리글 — 한글 이름과 영문 이름을 함께", () => {
    const d = posterDisposition("2026-09-21T09:23:00Z");
    expect(d).toMatch(/^attachment; filename="winnertoeic-attendance-qr_2026-09-21_1823\.pdf"; filename\*=UTF-8''/);
    expect(decodeURIComponent(d.split("UTF-8''")[1])).toBe("역전토익_출석QR포스터_2026-09-21_1823.pdf");
  });
});
