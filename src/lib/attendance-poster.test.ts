import { describe, expect, it } from "vitest";
import { issuedLabel, posterSheetHtml } from "./attendance-poster";
import { qrMatrix } from "./qr";
import { qrPath } from "./qr-svg";
import { site } from "./site";

describe("인쇄용 출석 QR 포스터", () => {
  const qr = qrMatrix("https://winnertoeic.com/attend?t=ABCDEF0123456789ABCD", "H");
  const html = posterSheetHtml({ qr, issuedAt: "2026-09-21T07:40:00Z" });

  it("A4 가로 한 장에 A5 포스터 두 장", () => {
    expect(html).toContain("size: A4 landscape");
    expect(html.match(/<section class="poster"/g)).toHaveLength(2);
    expect(html).toContain("width: 148.5mm");
  });

  it("두 장이 같은 QR 을 담는다", () => {
    expect(html.split(`d="${qrPath(qr)}"`)).toHaveLength(3);
  });

  it("강사마다 한 장 — 이름과 사진", () => {
    for (const i of site.instructors.slice(0, 2)) {
      expect(html).toContain(`${i.part} · ${i.name}`);
      expect(html).toContain(i.casual[0].src);
    }
  });

  it("힉스필드 그림 · 로고 · 발행 시각(한국 시간)", () => {
    expect(html).toContain("/posters/attendance-phone.webp");
    expect(html).toContain("/posters/attendance-stamp.webp");
    expect(html).toContain("/brand/logo.png");
    expect(html).toContain("2026.09.21 16:40 발행");
  });

  it("인쇄 창에서 배경 그래픽을 안 켜도 색이 나온다", () => {
    expect(html).toContain("print-color-adjust: exact");
  });
});

describe("발행 시각", () => {
  it("한국 시간으로 적는다", () => {
    expect(issuedLabel("2026-09-20T15:05:00Z")).toBe("2026.09.21 00:05 발행");
  });

  it("못 읽으면 비운다", () => {
    expect(issuedLabel(null)).toBe("");
    expect(issuedLabel("not a date")).toBe("");
  });
});
