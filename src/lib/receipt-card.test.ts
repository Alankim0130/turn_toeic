import { describe, expect, it } from "vitest";
import { cardCrop, cardFirst, cardOf, cardScale, isCardBlue, largestBlueBlob, type BlueBlob } from "./receipt-card";

/**
 * 수강증 카드 찾기 (2026-10-06 Alan — "테블릿이나 pc로 올린학생들은 이런형태의 수강증이야. 이것들도 등업으로 인정해줘. 검토로 보내지말고").
 * 숫자는 그날 실측한 캡처들이다 — 휴대폰 실물 픽스처(1242×2688, 카드 1048×1486) · PC 카드만 자른 캡처(524×554, 카드 502×497) 와
 * 그것으로 만든 화면 전체 · 태블릿 · 배율 125/150% · 작게 줄인 휴대폰 캡처.
 */

const CARD = [62, 137, 227];
const WATERMARK = [83, 150, 230];
const WHITE = [255, 255, 255];
const BADGE = [255, 210, 31];
const PAGE = [245, 246, 248];

/** 작은 RGB 그림 — 바탕을 칠하고 사각형을 덧칠한다 */
function canvas(width: number, height: number, background: number[]) {
  const data = new Uint8Array(width * height * 3);
  const fill = (x0: number, y0: number, w: number, h: number, rgb: number[]) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) data.set(rgb, (y * width + x) * 3);
  };
  fill(0, 0, width, height, background);
  return { data, fill };
}

describe("카드 파랑", () => {
  it("카드 · YBM 무늬는 파랑, 흰 글자 · 노란 배지 · 회색 바탕 · 카톡 바탕 · 검은 글자는 아니다", () => {
    expect(isCardBlue(...(CARD as [number, number, number]))).toBe(true);
    expect(isCardBlue(...(WATERMARK as [number, number, number]))).toBe(true);
    expect(isCardBlue(255, 255, 255)).toBe(false);
    expect(isCardBlue(255, 210, 31)).toBe(false);
    expect(isCardBlue(245, 246, 248)).toBe(false);
    expect(isCardBlue(178, 199, 217)).toBe(false); // 카카오톡 대화 바탕
    expect(isCardBlue(23, 23, 23)).toBe(false);
  });

  it("아이폰 넓은 색 공간처럼 값이 조금 틀어져도 받는다 — 정확한 값을 보지 않는다", () => {
    expect(isCardBlue(80, 135, 218)).toBe(true);
    expect(isCardBlue(55, 140, 235)).toBe(true);
  });
});

describe("가장 큰 파란 덩어리", () => {
  it("글자 · 배지가 박힌 카드 한 장을 찾는다 — 옆의 작은 파란 단추는 아니다", () => {
    const { data, fill } = canvas(60, 40, PAGE);
    fill(10, 5, 40, 30, CARD); // 카드
    fill(14, 8, 8, 3, BADGE); // 배지
    fill(14, 14, 20, 2, WHITE); // 글자 줄
    fill(14, 20, 25, 2, WHITE);
    fill(40, 28, 6, 5, WATERMARK); // 아래 YBM 무늬
    fill(52, 2, 5, 4, CARD); // 다른 파란 것
    const blob = largestBlueBlob(data, 60, 40, 3);
    expect(blob?.box).toEqual({ left: 10, top: 5, width: 40, height: 30 });
    const holes = 8 * 3 + 20 * 2 + 25 * 2;
    expect(blob?.fill).toBeCloseTo((40 * 30 - holes) / (40 * 30), 5);
    expect(blob?.share).toBeCloseTo((40 * 30 - holes) / (60 * 40), 5);
    expect(blob?.gray).toBeGreaterThan(120);
    expect(blob?.gray).toBeLessThan(135);
  });

  it("4채널(투명 칸 있는 PNG)도 읽는다 · 파랑이 없으면 null", () => {
    const rgba = new Uint8Array(4 * 4 * 4).fill(255);
    expect(largestBlueBlob(rgba, 4, 4, 4)).toBeNull();
    rgba.set([...CARD, 255], (1 * 4 + 1) * 4);
    expect(largestBlueBlob(rgba, 4, 4, 4)?.box).toEqual({ left: 1, top: 1, width: 1, height: 1 });
  });

  it("빈 그림 · 모자란 버퍼는 null", () => {
    expect(largestBlueBlob(new Uint8Array(0), 0, 0, 3)).toBeNull();
    expect(largestBlueBlob(new Uint8Array(5), 4, 4, 3)).toBeNull();
  });
});

describe("카드다운가 — 원본 좌표", () => {
  const blob = (box: BlueBlob["box"], fill = 0.94, share = 0.3): BlueBlob => ({ box, fill, share, gray: 125 });

  it("PC 카드만 자른 캡처 — 320 폭으로 줄여 찾은 덩어리를 원본 좌표로 키운다", () => {
    // 524×554 → 320×338 (실측 덩어리 12,27 ~ 317,329)
    const card = cardOf(blob({ left: 12, top: 27, width: 306, height: 303 }), 524 / 320, 554 / 338, 524, 554);
    expect(card).toEqual({ left: 19, top: 44, width: 502, height: 497 });
  });

  it("그림 밖으로 나가지 않는다", () => {
    const card = cardOf(blob({ left: 200, top: 100, width: 120, height: 150 }), 2, 2, 600, 500);
    expect(card).toEqual({ left: 400, top: 200, width: 200, height: 300 });
  });

  it("작은 것 · 성긴 것 · 얇은 띠 · 아주 작은 몫은 카드가 아니다", () => {
    expect(cardOf(blob({ left: 0, top: 0, width: 50, height: 50 }), 2, 2, 1000, 1000)).toBeNull(); // 100×100
    expect(cardOf(blob({ left: 0, top: 0, width: 200, height: 200 }, 0.5), 1, 1, 1000, 1000)).toBeNull();
    expect(cardOf(blob({ left: 0, top: 0, width: 600, height: 200 }), 1, 1, 1000, 1000)).toBeNull(); // 배너
    expect(cardOf(blob({ left: 0, top: 0, width: 200, height: 500 }), 1, 1, 1000, 1000)).toBeNull(); // 세로 띠
    expect(cardOf(blob({ left: 0, top: 0, width: 200, height: 200 }, 0.94, 0.01), 1, 1, 1000, 1000)).toBeNull();
  });
});

describe("카드 변형을 먼저 읽을까 — PC · 태블릿 · 작은 그림만, 휴대폰 화면은 예전 길 그대로", () => {
  it("휴대폰 실물 캡처(카드가 세로로 길고 폭 700 변형에서도 838px)는 아니다", () => {
    expect(cardFirst({ left: 97, top: 616, width: 1048, height: 1486 }, 700 / 1242)).toBe(false);
    expect(cardFirst({ left: 52, top: 357, width: 608, height: 863 }, 1)).toBe(false); // 720 폭으로 줄인 휴대폰 캡처
  });

  it("PC 모양 카드(높이 ≈ 폭)는 크기와 상관없이 먼저 — 카드만 · 화면 전체 · 배율 150% · 태블릿", () => {
    expect(cardFirst({ left: 19, top: 44, width: 502, height: 497 }, 1)).toBe(true);
    expect(cardFirst({ left: 719, top: 304, width: 498, height: 492 }, 700 / 1920)).toBe(true);
    expect(cardFirst({ left: 28, top: 66, width: 752, height: 743 }, 1)).toBe(true);
    expect(cardFirst({ left: 538, top: 302, width: 999, height: 992 }, 700 / 2048)).toBe(true);
  });

  it("작게 줄인 휴대폰 캡처(480 폭 — 카드 높이 575)는 카드를 키워 먼저 읽는다", () => {
    expect(cardFirst({ left: 37, top: 238, width: 405, height: 575 }, 1)).toBe(true);
  });
});

describe("읽을 범위와 배율", () => {
  it("카드 위 `현재시간` 줄까지 — 위로 카드 높이의 12%, 옆 · 아래 2%, 그림 안에서", () => {
    expect(cardCrop({ left: 97, top: 616, width: 1048, height: 1486 }, 1242, 2688)).toEqual({ left: 76, top: 438, width: 1090, height: 1694 });
    expect(cardCrop({ left: 19, top: 44, width: 502, height: 497 }, 524, 554)).toEqual({ left: 9, top: 0, width: 515, height: 551 });
  });

  it("카드 높이를 맞추는 배율은 0.5~4 배", () => {
    expect(cardScale({ left: 0, top: 0, width: 502, height: 497 }, 800)).toBeCloseTo(800 / 497, 5);
    expect(cardScale({ left: 0, top: 0, width: 150, height: 150 }, 800)).toBe(4);
    expect(cardScale({ left: 0, top: 0, width: 3000, height: 3000 }, 800)).toBe(0.5);
  });
});
