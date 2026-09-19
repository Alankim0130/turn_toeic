import { describe, it, expect } from "vitest";
import { RECEIPT_SKINS, colorKey, paletteColors, paletteVerdict, PALETTE_TOLERANCE } from "./receipt-forensics";

const CARD = colorKey([0x3e, 0x89, 0xe3]);
const BADGE = colorKey([0xff, 0xd2, 0x1f]);

/**
 * 2026-09-19 실측값 그대로 (실물 수강증 `__fixtures__/receipt-phone-screenshot.png` 과 그 변형).
 * **이 숫자를 손으로 바꾸지 말 것** — 바꾸려면 실제 이미지를 다시 재야 한다.
 */
const REAL = { [CARD]: 39.99, [BADGE]: 0.62 };
const KAKAO_Q70 = { [CARD]: 37.78, [BADGE]: 0.46 }; // 가장 심하게 깎인 정상 경로
const RESIZED = { [CARD]: 38.20, [BADGE]: 0.50 };
const EDITED = { [CARD]: 39.61, [BADGE]: 0.62 };    // 진짜 그림에 글자만 얹은 것 — 팔레트로는 못 잡는다
const WOBBLY = { [CARD]: 0.05, [BADGE]: 0.0 };      // 색이 흔들린 것 (생성물·재촬영)
const PHOTO = { [CARD]: 0.0, [BADGE]: 0.0 };        // 강사 사진 · 후기 캡쳐

describe("paletteVerdict — 정상 경로는 전부 통과한다", () => {
  it("실물 수강증", () => {
    const v = paletteVerdict(REAL);
    expect(v.ok).toBe(true);
    expect(v.skin).toBe("app-blue-ticket");
    expect(v.missing).toEqual([]);
  });

  it("카톡으로 보내 JPEG 으로 깎인 것 · 1080px 로 줄인 것", () => {
    expect(paletteVerdict(KAKAO_Q70).ok).toBe(true);
    expect(paletteVerdict(RESIZED).ok).toBe(true);
  });

  it("**못 쟀으면 통과시킨다** — 근거 없이 막지 않는다", () => {
    expect(paletteVerdict(null).ok).toBe(true);
    expect(paletteVerdict(undefined).ok).toBe(true);
  });
});

describe("paletteVerdict — 우리 화면이 아닌 것은 막는다", () => {
  it("색이 흔들린 것 (AI 생성물·화면 재촬영)", () => {
    const v = paletteVerdict(WOBBLY);
    expect(v.ok).toBe(false);
    expect(v.missing.map((m) => m.label)).toEqual(["카드 파랑", "과정 배지 노랑"]);
    expect(v.note).toContain("YBM 수강증 화면의 색이 아니에요");
  });

  it("아예 다른 그림 (사진·후기 캡쳐)", () => {
    expect(paletteVerdict(PHOTO).ok).toBe(false);
  });

  it("색이 하나도 없으면 막는다", () => {
    expect(paletteVerdict({}).ok).toBe(false);
  });
});

describe("경계 — 진짜의 최저와 가짜의 최고 사이가 넓어야 한다", () => {
  it("정상 경로의 최저(카톡 q70)가 기준의 두 배는 넘는다", () => {
    const min = RECEIPT_SKINS[0].colors.find((c) => c.label === "카드 파랑")!.minShare;
    expect(KAKAO_Q70[CARD]).toBeGreaterThan(min * 2);
    const badge = RECEIPT_SKINS[0].colors.find((c) => c.label === "과정 배지 노랑")!.minShare;
    expect(KAKAO_Q70[BADGE]).toBeGreaterThan(badge * 2);
  });

  it("가짜의 최고가 기준의 절반도 못 된다", () => {
    const min = RECEIPT_SKINS[0].colors.find((c) => c.label === "카드 파랑")!.minShare;
    expect(WOBBLY[CARD]).toBeLessThan(min / 2);
  });
});

describe("팔레트로 **못 잡는 것** — 기대를 못박아 둔다", () => {
  it("진짜 그림에 글자만 얹은 위조는 통과한다 (capturedAt 중복·파일 해시가 맡는다)", () => {
    expect(paletteVerdict(EDITED).ok).toBe(true);
  });
});

describe("팔레트 정의", () => {
  it("색 목록은 중복 없이 나온다", () => {
    const keys = paletteColors().map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain(CARD);
    expect(keys).toContain(BADGE);
  });

  it("허용 거리는 JPEG 이 흔드는 폭(실측 ≤2.4)보다 넉넉하다", () => {
    expect(PALETTE_TOLERANCE).toBeGreaterThanOrEqual(8);
  });

  it("colorKey 는 6자리 소문자 16진수다", () => {
    expect(colorKey([0x3e, 0x89, 0xe3])).toBe("3e89e3");
    expect(colorKey([0, 0, 0])).toBe("000000");
  });
});
