import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * 파비콘 (2026-11-05 Alan — 네이버 검색광고 캡처와 함께 "로고가 표시가 안되어있는데, 저거 파비콘아냐?").
 * 사이트는 `src/app/icon.png`(512 · 앱 아이콘)만 있어 `/favicon.ico` 가 404 였다 — 네이버 검색로봇(Yeti)은 뿌리의 `favicon.ico` 를 본다.
 * `src/app/favicon.ico` 는 `icon.png` 의 분홍 표식을 잘라 16 · 32 · 48 세 장으로 만든 ICO 다 (만드는 법은 docs/rules/design-assets.md "파비콘").
 */
describe("favicon.ico — 네이버 · 구글 검색 결과의 사이트 아이콘", () => {
  const ico = readFileSync("src/app/favicon.ico");
  it("src/app/favicon.ico 가 있고 ICO 머리말(예약 0 · 종류 1)이다", () => {
    expect(ico.readUInt16LE(0)).toBe(0);
    expect(ico.readUInt16LE(2)).toBe(1);
  });
  it("16 · 32 · 48 세 장 — 작은 칸(네이버 16px · 구글 48px 배수)에 맞는다", () => {
    const n = ico.readUInt16LE(4);
    const sizes = Array.from({ length: n }, (_, i) => ico.readUInt8(6 + i * 16));
    expect(sizes).toEqual([16, 32, 48]);
    for (let i = 0; i < n; i++) {
      const size = ico.readUInt32LE(6 + i * 16 + 8);
      const offset = ico.readUInt32LE(6 + i * 16 + 12);
      // 프레임은 PNG 다 (서명 8바이트)
      expect(ico.subarray(offset, offset + 8).toString("hex")).toBe("89504e470d0a1a0a");
      expect(offset + size).toBeLessThanOrEqual(ico.length);
    }
  });
});
