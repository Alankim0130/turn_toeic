import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { receiptVariants } from "./ocr-image";

/**
 * OCR 전처리 변형의 **순서** — 엔진 없이 sharp 만으로 본다 (읽은 결과는 `ocr.integration.test.ts`).
 * 2026-10-06 PC · 태블릿 수강증을 받으려고 카드를 잘라 키운 변형을 더했다 (`receipt-card.ts`). 휴대폰 화면 캡처는 예전 순서 그대로여야 한다.
 */
const fixture = (name: string) => fs.readFileSync(path.join(__dirname, "__fixtures__", name));
const PHONE = fixture("receipt-phone-screenshot.png");
/** PC 로 카드만 잘라 캡처한 실물 수강증 (524×554, 이름은 가렸다) */
const PC = fixture("receipt-pc-card.png");

const names = async (bytes: Buffer) => (await receiptVariants(bytes)).map((v) => v.name);

describe("변형 순서", () => {
  it("휴대폰 화면 캡처는 예전 순서 그대로 — 카드 변형을 만들지 않는다", async () => {
    expect(await names(PHONE)).toEqual(["gray_w700", "white_only", "gray"]);
  });

  it("PC 로 카드만 자른 캡처는 카드 변형(높이 800 · 배지 · 높이 1100)이 먼저, 예전 변형이 뒤에", async () => {
    expect(await names(PC)).toEqual(["card_h800", "card_badge", "card_h1100", "white_only", "gray"]);
  });

  it("PC 화면 전체 캡처(카드가 화면의 일부)도 카드부터 — 폭 700 변형에서는 글자가 뭉개진다", async () => {
    const screen = await sharp({ create: { width: 1920, height: 1080, channels: 3, background: "#f5f6f8" } })
      .composite([{ input: PC, left: 700, top: 260 }])
      .png()
      .toBuffer();
    expect(await names(screen)).toEqual(["card_h800", "card_badge", "card_h1100", "gray_w700", "white_only", "gray"]);
  });

  it("수강증 카드가 없는 그림은 예전 그대로", async () => {
    const blank = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#ffffff" } }).png().toBuffer();
    expect(await names(blank)).toEqual(["white_only", "gray"]);
  });
});

describe("카드 변형의 모양", () => {
  it("카드 위 `현재시간` 줄까지 잘라 카드 높이를 800 · 1100 으로 맞춘다 (카드 497px · 위 여백 포함 551px)", async () => {
    const variants = await receiptVariants(PC);
    const height = async (name: string) => (await sharp(variants.find((v) => v.name === name)!.bytes).metadata()).height;
    // 폭을 정하면 sharp 가 높이를 비율대로 반올림한다 — 1px 차이는 둔다
    expect(Math.abs((await height("card_h800")) - (551 * 800) / 497)).toBeLessThanOrEqual(1);
    expect(Math.abs((await height("card_h1100")) - (551 * 1100) / 497)).toBeLessThanOrEqual(1);
  });

  it("배지 변형은 배지의 검은 글자만 남아 거의 흰 그림이다", async () => {
    const badge = (await receiptVariants(PC)).find((v) => v.name === "card_badge")!;
    const { channels } = await sharp(badge.bytes).stats();
    expect(channels[0].mean).toBeGreaterThan(240);
    expect(channels[0].min).toBe(0);
  });
});

describe("SVG 는 읽지 않는다 (2026-10-09 보안 검토 — sharp.block)", () => {
  it("image/png 라고 올린 SVG 도 내용으로 알아내 막는다 — 전처리가 던져 image_unreadable 로 강사 검토에 간다", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#3e89e3"/></svg>');
    await expect(receiptVariants(svg)).rejects.toThrow(/unsupported image format/);
    // 막는 줄이 소스에 있어야 한다 — sharp 가 SVG 를 못 읽는 다른 까닭(빌드 옵션)으로 통과하면 안 된다
    expect(fs.readFileSync(path.join(__dirname, "ocr-image.ts"), "utf8")).toContain('sharp.block({ operation: ["VipsForeignLoadSvg"] });');
  });

  it("PNG 수강증은 그대로 읽는다", async () => {
    expect((await receiptVariants(PHONE)).length).toBeGreaterThan(0);
  });
});
