import sharp from "sharp";
import { PALETTE_SAMPLE_WIDTH, PALETTE_TOLERANCE, paletteColors, type PaletteShares } from "./receipt-forensics";

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

/**
 * 수강증 화면의 **색 팔레트**를 잰다 (2026-09-19, 위조 신호 — `src/lib/receipt-forensics.ts`).
 *
 * 팔레트에 든 색마다 "화면에서 몇 %를 차지하나" 를 돌려준다. 판정은 하지 않는다 (`paletteVerdict` 가 한다).
 * **폭 480px 으로 줄여서 센다** — 비율이라 값이 안 변하고(실측 39.99% → 39.98%) 시간이 절반이 된다 (실측 72ms → 54ms).
 * 줄일 때 `kernel: "nearest"` 를 쓰는 것이 중요하다 — 기본값(보간)은 이웃 픽셀을 섞어 **평평한 색을 흐려 놓아**
 * 정확히 같은 값이 아니게 만든다. 그러면 진짜 화면도 색이 안 맞는 것으로 나온다.
 *
 * 못 재면 **null** 이다 (이미지가 아니거나 sharp 가 실패). 판정 쪽이 null 을 통과로 본다 — 근거 없이 막지 않는다.
 */
export async function measurePalette(input: Uint8Array): Promise<PaletteShares | null> {
  try {
    const { data, info } = await sharp(Buffer.from(input), { failOn: "none", limitInputPixels: MAX_PIXELS })
      .rotate()
      .removeAlpha()
      .resize({ width: PALETTE_SAMPLE_WIDTH, kernel: "nearest", fit: "inside", withoutEnlargement: true })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const total = info.width * info.height;
    if (!total) return null;

    const colors = paletteColors();
    const hits = new Array<number>(colors.length).fill(0);
    const tol2 = PALETTE_TOLERANCE * PALETTE_TOLERANCE;
    for (let i = 0; i < data.length; i += info.channels) {
      for (let k = 0; k < colors.length; k++) {
        const [r, g, b] = colors[k].rgb;
        const dr = data[i] - r, dg = data[i + 1] - g, db = data[i + 2] - b;
        if (dr * dr + dg * dg + db * db <= tol2) {
          hits[k]++;
          break; // 한 픽셀은 한 색에만 센다
        }
      }
    }
    const out: PaletteShares = {};
    colors.forEach((c, k) => { out[c.key] = (hits[k] / total) * 100; });
    return out;
  } catch (e) {
    console.error("[ocr] 팔레트를 재지 못했어요", e);
    return null;
  }
}
