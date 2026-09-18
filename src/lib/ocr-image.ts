import sharp from "sharp";

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

  return out;
}
