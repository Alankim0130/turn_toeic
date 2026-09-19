import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { measurePalette } from "./ocr-image";
import { colorKey, paletteVerdict } from "./receipt-forensics";

/**
 * **실제 이미지로 잰다** — `receipt-forensics.test.ts` 에 적어 둔 숫자가 진짜 그 값인지 여기서 확인한다.
 * 손으로 적은 값만 믿으면 코드가 바뀌어도 테스트는 계속 통과한다.
 * 엔진(tesseract)이 필요 없어 늘 돈다 — sharp 하나로 잰다.
 */
const FIXTURE = path.join(__dirname, "__fixtures__", "receipt-phone-screenshot.png");
const CARD = colorKey([0x3e, 0x89, 0xe3]);
const BADGE = colorKey([0xff, 0xd2, 0x1f]);

const read = () => new Uint8Array(fs.readFileSync(FIXTURE));

describe("실물 수강증 색 팔레트", () => {
  it("파란 카드가 화면의 40% 가까이를 정확히 같은 색으로 차지한다", async () => {
    const shares = await measurePalette(read());
    expect(shares).not.toBeNull();
    expect(shares![CARD]).toBeGreaterThan(38);
    expect(shares![CARD]).toBeLessThan(42);
    expect(shares![BADGE]).toBeGreaterThan(0.4);
    expect(paletteVerdict(shares).ok).toBe(true);
  });

  it("카톡으로 보내 JPEG 으로 깎여도 통과한다 (q70 · 폭 1080 축소)", async () => {
    const src = read();
    for (const bytes of [
      await sharp(Buffer.from(src)).jpeg({ quality: 70 }).toBuffer(),
      await sharp(Buffer.from(src)).resize({ width: 1080 }).jpeg({ quality: 85 }).toBuffer(),
    ]) {
      const v = paletteVerdict(await measurePalette(new Uint8Array(bytes)));
      expect(v.ok, v.note).toBe(true);
    }
  });

  it("색이 흔들리면 막는다 — 생성물·화면 재촬영이 여기 해당한다", async () => {
    const noisy = await sharp(Buffer.from(read()))
      .composite([{
        input: { create: { width: 1242, height: 2688, channels: 3, background: "#000000", noise: { type: "gaussian", mean: 0, sigma: 2.5 } } },
        blend: "overlay",
      }])
      .png()
      .toBuffer();
    const v = paletteVerdict(await measurePalette(new Uint8Array(noisy)));
    expect(v.ok).toBe(false);
    expect(v.note).toContain("카드 파랑");
  });

  it("수강증이 아닌 그림은 막는다", async () => {
    const photo = path.join(process.cwd(), "public", "instructors", "lee-hyeyoung.png");
    const v = paletteVerdict(await measurePalette(new Uint8Array(fs.readFileSync(photo))));
    expect(v.ok).toBe(false);
  });

  it("이미지가 아니면 null 이고, null 은 통과다 (근거 없이 막지 않는다)", async () => {
    expect(await measurePalette(new Uint8Array([1, 2, 3, 4]))).toBeNull();
    expect(paletteVerdict(null).ok).toBe(true);
  });
});
