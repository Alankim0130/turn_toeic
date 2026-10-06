import sharp, { type Sharp } from "sharp";
import { cardCrop, cardFirst, cardOf, cardScale, largestBlueBlob } from "./receipt-card";

/**
 * 수강증 이미지 전처리 — OCR 전에 **흑백으로** 바꾼 변형 여러 장을 만든다 (2026-09-18 실물 수강증으로 실측).
 *
 * 왜 필요한가: 학생은 카드만 잘라 올리지 않고 **휴대폰 화면 전체**를 캡처해 올린다. 그 화면에서 수강증 카드는
 * 파란 바탕에 흰 글자인데, tesseract 는 컬러 원본에서 그 카드를 통째로 건너뛰었다 (판정 키 18개 중 0개).
 * 같은 이미지를 흑백으로만 바꾸면 15개, 폭을 700px 로 줄이면 17개를 읽는다 — 큰 제목 글자(`역전토익 [종합반]`)는
 * 줄여야 읽히고, 작은 글자는 원본 크기가 낫다. 그래서 **변형을 여러 장 읽어 원문을 이어 붙인다** —
 * 판독기는 공백을 지운 원문에서 키워드를 찾으므로 중복은 해가 없고, 한 장이 놓친 단어를 다른 장이 채운다.
 *
 * 변형 (모두 흑백):
 *  1. 원본 크기 — 작은 라벨 줄(수강생·수강센터·수강시간·수강료)
 *  2. 폭 700px — 큰 제목·레벨 줄
 *  3. 흰 글자만 남김(밝은 픽셀만 검게) — 파란 카드 안 글자를 한 번 더 (라이브방송처럼 한 번 놓친 단어를 건짐)
 *
 * **PC · 태블릿 수강증은 카드만 잘라 키운 변형을 먼저 읽는다** (2026-10-06 Alan — "테블릿이나 pc로 올린학생들은 이런형태의 수강증이야 … 검토로 보내지말고").
 * 그 화면의 카드는 가로로 넓어 글자가 작고(카드만 자른 캡처의 라벨이 13px 남짓), 위 세 변형으로는 카드 칸 · 수강월을 못 읽었다 (`receipt-card.ts`).
 * 카드를 찾아 잘라 카드 높이 800 · 1100 으로 맞춘 흑백 두 장 + 배지(`10월 과정`)의 검은 글자만 남긴 한 장을 **앞에** 둔다.
 * 휴대폰 화면 캡처(세로로 긴 카드가 화면 폭을 채운다)는 이 변형을 만들지 않는다 — 예전 순서 그대로다 (`cardFirst`).
 *
 * sharp 는 next/image 가 쓰는 것과 같은 라이브러리라 Vercel 에서 그대로 돈다.
 */

export type OcrVariant = { name: string; bytes: Buffer };

const TITLE_WIDTH = 700;
const WHITE_THRESHOLD = 200;

/** 이보다 큰 그림은 읽지 않는다 — 작은 파일이 거대한 픽셀로 풀리는(디컴프레션 폭탄) 이미지로 CPU·메모리를 태우지 못하게. 휴대폰 캡처는 3~12MP 다 */
const MAX_PIXELS = 40_000_000;

export async function receiptVariants(input: Uint8Array): Promise<OcrVariant[]> {
  const src = sharp(Buffer.from(input), { failOn: "none", limitInputPixels: MAX_PIXELS }).rotate();
  const meta = await src.metadata();
  const width = meta.width ?? 0;

  const gray = () => src.clone().grayscale();
  // 읽는 순서는 싼 것부터 (2026-09-18 실측, 전체 화면 캡쳐 1242×2688): 폭 700 = 0.7초에 판정 키 전부 · 흰 글자만 = 0.1초 ·
  // 원본 크기 = 1.4초. 엔진(`tesseractOcr.recognize`)은 앞에서 키가 다 읽히면(`receiptComplete`) 뒤를 건너뛴다 — 운영 CPU 는 여기보다 느리다
  const out: OcrVariant[] = [];
  if (width > TITLE_WIDTH * 1.2) {
    out.push({ name: `gray_w${TITLE_WIDTH}`, bytes: await gray().resize({ width: TITLE_WIDTH }).png().toBuffer() });
  }
  out.push({ name: "white_only", bytes: await gray().threshold(WHITE_THRESHOLD).negate().png().toBuffer() });
  out.push({ name: "gray", bytes: await gray().png().toBuffer() });

  // PC · 태블릿 모양의 카드면 카드 변형을 맨 앞에 — 찾다가 실패해도 예전 변형은 그대로 읽는다
  const firstScale = width > TITLE_WIDTH * 1.2 ? TITLE_WIDTH / width : 1;
  const card = await cardVariants(src, firstScale).catch((err: unknown) => {
    console.error(`[ocr] 수강증 카드를 찾다 실패했어요: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  });
  return [...card, ...out];
}

/** 카드를 찾을 때 줄이는 폭 — 덩어리만 보면 되므로 작게. 실측 1242×2688 휴대폰 캡처에서 50ms 안팎 */
const FIND_WIDTH = 320;
/**
 * 카드 변형의 카드 높이. 이 높이에서 라벨 글자가 20px 남짓이 된다 (2026-10-06 실측 — PC 카드 497px 를 700~1100 으로 키워 읽어 봤다:
 * 800 · 1000 · 1100 은 판정 키가 전부 나오고, 750 · 850 · 900 은 카드 칸이나 주5일을 한두 개씩 놓쳤다). 높이 둘을 함께 읽어 서로 메운다
 */
const CARD_HEIGHTS = [800, 1100] as const;
/**
 * 배지 `10월 과정` 만 남기는 문턱 — 노란 배지의 검은 글자만 검게, 카드 파랑(밝기 약 125) · 흰 글자 · 배지 노랑은 희게.
 * 흑백 변형에서는 작은 배지를 못 읽었다 (실측 — PC 카드에서 한 번도). 카드가 더 어두우면 카드보다 조금 어두운 것만 검게 한다
 */
const BADGE_DARK = 110;

/**
 * 카드만 잘라 키운 변형 — PC · 태블릿 모양이거나 기존 변형에서 카드가 너무 작게 읽힐 때만 (`cardFirst`). 아니면 빈 배열.
 * `firstScale` = 기존 첫 변형의 배율 (폭 700 으로 줄이면 700 / 폭, 아니면 1)
 */
async function cardVariants(src: Sharp, firstScale: number): Promise<OcrVariant[]> {
  const meta = await src.metadata();
  const imageWidth = meta.autoOrient?.width ?? meta.width ?? 0;
  const imageHeight = meta.autoOrient?.height ?? meta.height ?? 0;
  if (imageWidth <= 0 || imageHeight <= 0) return [];
  // 투명한 칸은 흰 바탕으로 — 그대로 두면 검게 읽혀 카드 둘레가 흐려진다
  const flat = () => src.clone().flatten({ background: "#ffffff" });
  const { data, info } = await flat().resize({ width: FIND_WIDTH, kernel: "nearest" }).raw().toBuffer({ resolveWithObject: true });
  const blob = largestBlueBlob(data, info.width, info.height, info.channels);
  if (!blob) return [];
  const card = cardOf(blob, imageWidth / info.width, imageHeight / info.height, imageWidth, imageHeight);
  if (!card || !cardFirst(card, firstScale)) return [];

  const crop = cardCrop(card, imageWidth, imageHeight);
  const at = (height: number) =>
    flat()
      .extract(crop)
      .grayscale()
      .resize({ width: Math.max(1, Math.round(crop.width * cardScale(card, height))) });
  const dark = Math.min(BADGE_DARK, Math.round(blob.gray) - 15);
  const [first, second] = CARD_HEIGHTS;
  return [
    { name: `card_h${first}`, bytes: await at(first).png().toBuffer() },
    { name: "card_badge", bytes: await at(first).threshold(dark).png().toBuffer() },
    { name: `card_h${second}`, bytes: await at(second).png().toBuffer() },
  ];
}
