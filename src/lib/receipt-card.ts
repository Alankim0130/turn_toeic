/**
 * 수강증 **카드(파란 티켓) 찾기** — PC · 태블릿으로 캡처한 수강증을 읽으려고 (2026-10-06 Alan — "테블릿이나 pc로 올린학생들은 이런형태의 수강증이야.
 * 이것들도 등업으로 인정해줘. 검토로 보내지말고").
 *
 * PC · 태블릿 화면의 수강증은 휴대폰 앱과 같은 파란 카드인데 **가로로 넓게 그려져 카드에 견준 글자가 작다** — 같은 줄 수가 휴대폰 카드는
 * 세로로 길게(높이 ≈ 폭의 1.4배), PC 카드는 정사각에 가깝게(≈ 1.0배) 들어간다. 카드만 잘라 올린 PC 캡처(524×554)는 원본 크기로 읽으면
 * 라벨 글자가 13px 남짓이라 엔진이 `수강시간` 을 `수강신관` 으로, `[4주-10/06]` 을 `나즈10101` 로 읽어 카드 칸 · 수강월을 못 읽고 검토로 갔다.
 * 화면 전체 캡처(1920×1080)에서는 카드가 화면의 일부라 기존 첫 변형(폭 700 으로 줄이기)에서 글자가 아예 뭉개진다.
 *
 * 그래서 **카드를 찾아 그 부분만 잘라, 카드 높이를 정해 둔 값으로 맞춘 뒤** 읽는다 (`ocr-image.ts` 의 카드 변형).
 * 높이로 맞추는 까닭: 두 화면 모두 카드에 든 줄 수가 같아 **글자 크기가 카드 높이에 비례한다** (실측 — 휴대폰 카드 1486px · PC 카드 497px 모두 높이의 약 2.6%).
 * 화면 · DB 가 없는 순수 함수라 테스트로 굳힌다 (`receipt-card.test.ts`). 그림을 줄이고 자르는 일은 `ocr-image.ts` 가 sharp 로 한다.
 */

export type CardBox = { left: number; top: number; width: number; height: number };

/**
 * 카드 파랑인가 — YBM 수강증 카드는 `#3e89e3` (62,137,227), 아래쪽 YBM 무늬는 (83,150,230) (2026-10-06 휴대폰 · PC 캡처 둘 다 실측).
 * 정확한 값을 보지 않고 **파랑 쪽이면** 받는다 — 화면 색으로 위조를 가리던 검사는 아이폰 넓은 색 공간 캡처가 값이 달라 그날 뺐다 (`verify-flags.ts`).
 * 여기서는 자리만 찾으므로 느슨해도 된다 (흰 글자 · 노란 배지 · 회색 바탕은 걸리지 않는다).
 */
export const isCardBlue = (r: number, g: number, b: number): boolean => b > 150 && b - r > 70 && b - g > 40;

/** 가장 큰 파란 덩어리 — 줄인 그림의 좌표. `fill` = 덩어리가 제 상자를 얼마나 채우나, `share` = 그림 전체에서 차지하는 몫, `gray` = 덩어리의 평균 밝기 */
export type BlueBlob = { box: CardBox; fill: number; share: number; gray: number };

/**
 * 줄인 그림(raw — 픽셀마다 R · G · B(· A) 바이트)에서 **상하좌우로 이어진 가장 큰 파란 덩어리**.
 * 카드는 흰 글자 · 노란 배지 · 점선이 박힌 한 장의 파란 판이라 하나로 이어진다 (점선과 YBM 무늬도 파랑 쪽이다). 파랑이 없으면 null
 */
export function largestBlueBlob(data: Uint8Array, width: number, height: number, channels: number): BlueBlob | null {
  const n = width * height;
  if (n <= 0 || channels < 3 || data.length < n * channels) return null;
  const blue = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * channels;
    if (isCardBlue(data[o], data[o + 1], data[o + 2])) blue[i] = 1;
  }
  const seen = new Uint8Array(n);
  const stack = new Int32Array(n);
  let top = 0;
  // 쌓을 때 표시한다 — 한 픽셀은 한 번만 쌓이므로 스택이 그림 크기를 넘지 않는다
  const push = (q: number) => {
    if (!blue[q] || seen[q]) return;
    seen[q] = 1;
    stack[top++] = q;
  };
  let best: BlueBlob | null = null;
  let bestCount = 0;
  for (let start = 0; start < n; start++) {
    if (!blue[start] || seen[start]) continue;
    push(start);
    let count = 0;
    let graySum = 0;
    let x0 = width;
    let y0 = height;
    let x1 = -1;
    let y1 = -1;
    while (top > 0) {
      const p = stack[--top];
      count++;
      const x = p % width;
      const y = (p - x) / width;
      const o = p * channels;
      graySum += 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      if (x > 0) push(p - 1);
      if (x < width - 1) push(p + 1);
      if (y > 0) push(p - width);
      if (y < height - 1) push(p + width);
    }
    if (count > bestCount) {
      bestCount = count;
      const box = { left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
      best = { box, fill: count / (box.width * box.height), share: count / n, gray: graySum / count };
    }
  }
  return best;
}

/**
 * 덩어리를 원본 좌표로 키우고 **수강증 카드다운지** 본다 — 아니면 null (카드 변형을 만들지 않는다).
 * 카드는 꽉 찬 판이고(`fill` — 실측 0.94, 글자 · 배지 자리만 빈다) 가로세로가 0.6~2.2 배 안이다 (PC 1.0 · 휴대폰 1.4).
 * 파란 단추 · 배너 · 글자 같은 작은 것과 화면 귀퉁이의 얇은 띠는 여기서 걸러진다.
 */
export function cardOf(blob: BlueBlob, scaleX: number, scaleY: number, imageWidth: number, imageHeight: number): CardBox | null {
  if (blob.fill < 0.7 || blob.share < 0.02) return null;
  const left = Math.max(0, Math.floor(blob.box.left * scaleX));
  const top = Math.max(0, Math.floor(blob.box.top * scaleY));
  const width = Math.min(imageWidth - left, Math.ceil(blob.box.width * scaleX));
  const height = Math.min(imageHeight - top, Math.ceil(blob.box.height * scaleY));
  if (width < 150 || height < 150) return null;
  const aspect = height / width;
  if (aspect < 0.6 || aspect > 2.2) return null;
  return { left, top, width, height };
}

/** 휴대폰 앱 카드는 높이가 폭의 약 1.4 배, PC · 태블릿 카드는 약 1.0 배다 (2026-10-06 실측). 그 사이의 이 값보다 납작하면 PC 모양 */
export const PC_CARD_ASPECT = 1.2;
/**
 * 기존 첫 변형에서 카드가 이보다 낮게 읽히면 글자가 작아 못 읽는다. 휴대폰 실물 캡처는 폭 700 변형에서 838px 로 읽힌다 —
 * 이 값보다 높아 **휴대폰 캡처는 예전 길 그대로** 간다. PC 카드만 자른 캡처는 497px 라 카드부터 읽는다
 */
export const MIN_CARD_HEIGHT = 640;

/**
 * 카드 변형을 **맨 앞에** 둘까 — PC 모양 카드이거나, 기존 변형(첫 변형의 배율 `firstScale`)에서 카드가 너무 작게 읽힐 때.
 * 휴대폰 화면 캡처(카드가 화면 폭을 거의 채우고 세로로 길다)는 false — 예전 변형 순서 그대로 읽는다 (그쪽은 이 변경 전에 이미 잘 읽혔다)
 */
export function cardFirst(card: CardBox, firstScale: number): boolean {
  return card.height / card.width < PC_CARD_ASPECT || card.height * firstScale < MIN_CARD_HEIGHT;
}

/**
 * 읽을 범위 — 카드에 **위쪽 `현재시간` 줄**을 더한다 (카드 바로 위에 있다 — 캡처 시각(초)은 같은 캡처를 잡는 신호다).
 * 위로 카드 높이의 12% (실측: 휴대폰은 카드 위 54px · 카드 1486px, PC 는 위 20px · 카드 497px), 옆 · 아래는 2% 여유. 그림 밖으로는 나가지 않는다
 */
export function cardCrop(card: CardBox, imageWidth: number, imageHeight: number): CardBox {
  const left = Math.max(0, card.left - Math.round(card.width * 0.02));
  const top = Math.max(0, card.top - Math.round(card.height * 0.12));
  const right = Math.min(imageWidth, card.left + card.width + Math.round(card.width * 0.02));
  const bottom = Math.min(imageHeight, card.top + card.height + Math.round(card.height * 0.02));
  return { left, top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
}

/** 카드 높이를 `targetHeight` 로 맞추는 배율 — 아주 작은 그림을 너무 크게 키우지 않게 0.5~4 배로 묶는다 */
export function cardScale(card: CardBox, targetHeight: number): number {
  return Math.min(4, Math.max(0.5, targetHeight / card.height));
}
