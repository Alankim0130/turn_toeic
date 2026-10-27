import { describe, expect, it } from "vitest";
import QRCode from "qrcode";
import sharp, { type OverlayOptions } from "sharp";
import jsQR from "jsqr";
import {
  duplicateMessage,
  duplicateTracking,
  LABEL_SCAN_SIZES,
  labelReadMessage,
  labelScanSizes,
  scanLabel,
  trackingFromLabelQr,
  trackingKey,
  type UsedTracking,
} from "./tracking-label";

/**
 * 택배 접수증 사진 → 운송장번호 (2026-10-27 Alan — "사진찍었을때 우측하단에 있는 운송장번호를 읽어서 자동으로 기입").
 * GS 편의점 택배 접수증의 QR(`POSTBOX;1` + 운송장번호 12자리 + 접수일의 날 2자리 + 5자리 …)을 읽는다.
 * 숫자는 모두 지어낸 것이다 — 실물 접수증의 번호 · 받는 사람은 넣지 않는다 (저장소가 공개다).
 */

/** 실물과 같은 꼴의 QR 글자 — 운송장번호 · 날만 바꾼다 */
const labelQr = (tracking: string, day = "28") => `POSTBOX;1${tracking}${day}12345;21820033000000000007;30000000000000000097;`;

describe("접수증 QR → 운송장번호", () => {
  it("POSTBOX; 다음 1 + 12자리가 운송장번호 — 뒤의 접수일 날 · 다섯 자리는 버린다", () => {
    expect(trackingFromLabelQr(labelQr("123456789012"))).toBe("123456789012");
    expect(trackingFromLabelQr(labelQr("000011112222", "04"))).toBe("000011112222");
    expect(trackingFromLabelQr(`  ${labelQr("123456789012", "13")}\n`)).toBe("123456789012");
  });

  it("꼴이 다르면 짐작하지 않는다 — 다른 택배사 · 다른 QR · 자릿수 · 날이 틀림", () => {
    for (const text of [
      "https://winnertoeic.com/attend?t=abcdefghijklmnopqrst", // 출석 QR
      "123456789012", // 숫자만
      "postbox;11234567890122812345;", // 소문자
      "CJ;11234567890122812345;",
      "POSTBOX;212345678901228123;", // 첫 칸이 1 이 아님
      "POSTBOX;1123456789012281234;", // 한 자리 모자람
      "POSTBOX;112345678901228123456;", // 한 자리 넘침
      "POSTBOX;11234567890122812345", // 칸 끝(;)이 없음
      "POSTBOX;11234567890120012345;", // 날 00
      "POSTBOX;11234567890123212345;", // 날 32
      "POSTBOX;1123456789O122812345;", // 숫자 아닌 글자
      "",
    ]) {
      expect(trackingFromLabelQr(text), text).toBeNull();
    }
  });
});

describe("읽어 볼 크기", () => {
  it("작게 먼저(640) · 멀리서 찍은 것은 크게 — 늘리지는 않는다", () => {
    expect(LABEL_SCAN_SIZES[0]).toBe(640);
    expect(labelScanSizes(4032)).toEqual([640, 800, 960, 1280, 1600, 480, 560, 720, 1120, 2000]);
    // 2000px 이하 사진은 원본 크기도 마지막에 한 번
    expect(labelScanSizes(1512)).toEqual([640, 800, 960, 1280, 480, 560, 720, 1120, 1512]);
    expect(labelScanSizes(2000)).toEqual([640, 800, 960, 1280, 1600, 480, 560, 720, 1120, 2000]);
    expect(labelScanSizes(300)).toEqual([300]);
    expect(labelScanSizes(0)).toEqual([]);
    expect(labelScanSizes(Number.NaN)).toEqual([]);
  });
});

describe("scanLabel — 처음 읽히는 크기에서 멈춘다", () => {
  it("크기 순서대로 읽고, 접수증 QR 이 나오면 멈춘다", async () => {
    const tried: number[] = [];
    const r = await scanLabel(4032, (size) => {
      tried.push(size);
      return size === 960 ? labelQr("123456789012") : null;
    });
    expect(r).toEqual({ kind: "ok", tracking: "123456789012" });
    expect(tried).toEqual([640, 800, 960]);
  });

  it("브라우저가 먼저 읽은 글자(BarcodeDetector)에 있으면 jsQR 을 돌리지 않는다", async () => {
    const tried: number[] = [];
    const r = await scanLabel(
      4032,
      (size) => {
        tried.push(size);
        return null;
      },
      ["https://example.com", labelQr("123456789012")],
    );
    expect(r).toEqual({ kind: "ok", tracking: "123456789012" });
    expect(tried).toEqual([]);
  });

  it("QR 은 있는데 접수증이 아니면 other · 아무것도 없으면 none · 한 크기가 던져도 다음으로", async () => {
    expect(await scanLabel(1000, () => "https://winnertoeic.com")).toEqual({ kind: "other" });
    expect(await scanLabel(1000, () => null)).toEqual({ kind: "none" });
    expect(await scanLabel(1000, () => null, ["다른 QR"])).toEqual({ kind: "other" });
    const r = await scanLabel(4032, (size) => {
      if (size === 640) throw new Error("캔버스가 터짐");
      return size === 800 ? labelQr("123456789012") : null;
    });
    expect(r).toEqual({ kind: "ok", tracking: "123456789012" });
  });
});

// ── 실제 QR 판독기(jsQR)로 — 접수증 꼴의 그림을 지어내 사진처럼 흐리고 얼룩지게 한다 ──

/** 같은 그림이 늘 나오게 — 정해진 씨앗의 난수 */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/**
 * 접수증 사진 흉내 — 나무색 바탕 위 흰 종이, 왼쪽에 글자 줄(회색 막대), 오른쪽 위에 QR, 아래 칸 줄.
 * `far` 배만큼 멀리서 찍은 것(종이가 작다). 살짝 기울이고 흐리게 한 뒤 얼룩(잡음)을 얹는다.
 */
async function labelPhoto(qrText: string | null, far = 1): Promise<Buffer> {
  const W = 1500;
  const H = 2000;
  const paper = { w: 1300, h: 1500 };
  const parts: OverlayOptions[] = [];
  const rand = seeded(7);
  // 글자 줄 — 회색 막대
  for (let y = 180; y < 1100; y += 70) parts.push({ input: { create: { width: 560 + Math.round(rand() * 80), height: 26, channels: 3, background: "#333" } }, left: 60, top: y });
  // 아래 칸 줄
  for (let y = 1180; y < 1450; y += 70) parts.push({ input: { create: { width: 1180, height: 6, channels: 3, background: "#222" } }, left: 60, top: y });
  if (qrText) {
    const qr = await QRCode.toBuffer(qrText, { errorCorrectionLevel: "M", margin: 1, width: 470 });
    parts.push({ input: qr, left: 760, top: 300 });
  }
  const label = await sharp({ create: { width: paper.w, height: paper.h, channels: 3, background: "#f4f3ef" } }).composite(parts).png().toBuffer();
  const tilted = await sharp(label).rotate(2.5, { background: "#c9b48d" }).png().toBuffer();
  const tm = await sharp(tilted).metadata();
  const scale = 1 / far;
  const small = await sharp(tilted).resize({ width: Math.round((tm.width ?? paper.w) * scale) }).png().toBuffer();
  const sm = await sharp(small).metadata();
  const base = await sharp({ create: { width: W, height: H, channels: 3, background: "#c9b48d" } })
    .composite([{ input: small, left: Math.round((W - (sm.width ?? 0)) / 2), top: Math.round((H - (sm.height ?? 0)) / 3) }])
    .blur(1.2)
    .raw()
    .toBuffer({ resolveWithObject: true });
  // 얼룩 — 사진의 잡음
  const px = base.data;
  for (let i = 0; i < px.length; i++) px[i] = Math.max(0, Math.min(255, px[i] + Math.round((rand() - 0.5) * 36)));
  return sharp(px, { raw: base.info }).jpeg({ quality: 82 }).toBuffer();
}

/** 브라우저의 캔버스 + jsQR 대신 sharp + jsQR — 긴 변을 size 로 줄여 읽는다 */
function decoderFor(photo: Buffer, long: number) {
  return async (size: number) => {
    const meta = await sharp(photo).metadata();
    const k = size / long;
    const { data, info } = await sharp(photo)
      .resize({ width: Math.max(1, Math.round((meta.width ?? 0) * k)) })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return jsQR(new Uint8ClampedArray(data), info.width, info.height, { inversionAttempts: "dontInvert" })?.data ?? null;
  };
}

describe("접수증 사진 흉내로 실제 판독 (sharp + jsQR)", () => {
  it("가까이 찍은 접수증 · 세 배 멀리서 찍은 접수증 — 운송장번호를 읽는다", async () => {
    for (const far of [1, 3]) {
      const photo = await labelPhoto(labelQr("987654321098", "15"), far);
      const r = await scanLabel(2000, decoderFor(photo, 2000));
      expect(r, `far=${far}`).toEqual({ kind: "ok", tracking: "987654321098" });
    }
  }, 30_000);

  it("다른 QR 이 찍힌 종이는 other, QR 이 없으면 none", async () => {
    const other = await labelPhoto("https://winnertoeic.com/attend?t=abcdefghijklmnopqrst");
    expect(await scanLabel(2000, decoderFor(other, 2000))).toEqual({ kind: "other" });
    const blank = await labelPhoto(null);
    expect(await scanLabel(2000, decoderFor(blank, 2000))).toEqual({ kind: "none" });
  }, 30_000);
});

describe("다른 주문에 이미 들어간 번호", () => {
  const used: UsedTracking[] = [
    { id: 11, key: "123456789012", name: "가나다" },
    { id: 12, key: "555566667777", name: "라마바" },
  ];

  it("숫자만 견준다 — 띄어 쓰거나 - 를 넣어도 같은 번호, 8자리 미만은 견주지 않는다", () => {
    expect(trackingKey("1234-5678-9012")).toBe("123456789012");
    expect(trackingKey(" 1234 5678 9012 ")).toBe("123456789012");
    expect(trackingKey("1234567")).toBeNull();
    expect(trackingKey(null)).toBeNull();
    expect(duplicateTracking("1234-5678-9012", 99, used)).toEqual(used[0]);
    expect(duplicateTracking("", 99, used)).toBeNull();
    expect(duplicateTracking("999999999999", 99, used)).toBeNull();
  });

  it("그 주문 자기 번호는 견주지 않는다 (상태 직접 바꾸기에서 다시 열 때)", () => {
    expect(duplicateTracking("123456789012", 11, used)).toBeNull();
    expect(duplicateTracking("555566667777", 11, used)).toEqual(used[1]);
  });

  it("알림 글", () => {
    expect(duplicateMessage(used[0])).toBe("이 번호는 주문 #11 (가나다) 에도 들어가 있어요. 같은 접수증을 두 번 찍지 않았는지 봐 주세요.");
    expect(labelReadMessage({ kind: "ok", tracking: "123456789012" }, "가나다")).toBe("운송장번호를 넣었어요. 접수증의 받는사람이 가나다 님인지 확인해 주세요.");
    expect(labelReadMessage({ kind: "none" }, "가나다")).toContain("다시 찍어 주세요");
    expect(labelReadMessage({ kind: "other" }, "가나다")).toContain("직접 적어 주세요");
    expect(labelReadMessage({ kind: "error" }, "가나다")).toContain("직접 적어 주세요");
  });
});
