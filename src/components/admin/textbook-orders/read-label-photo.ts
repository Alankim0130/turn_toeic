import { scanLabel, type LabelRead } from "@/lib/tracking-label";

/**
 * 접수증 사진 한 장 → 운송장번호 — **브라우저 안에서만** 읽는다 (사진을 서버로 보내지 않는다). 규칙은 `src/lib/tracking-label.ts`.
 *
 * 1. 브라우저의 `BarcodeDetector`(안드로이드 크롬 등)가 있으면 원본 사진으로 먼저 본다
 * 2. 없거나 못 찾으면(아이폰 사파리) `jsqr` 을 그때 불러와 사진을 여러 크기로 줄여 가며 읽는다 (`LABEL_SCAN_SIZES`)
 *
 * jsQR 은 화면을 붙잡고 도므로 크기마다 한 번씩 쉬어 '읽는 중' 이 그려지게 한다. 출석 카메라(`AttendanceCamera`)와 같은 판독기다.
 */

type Detector = { detect(src: CanvasImageSource): Promise<{ rawValue: string }[]> };
type BarcodeDetectorCtor = { new (opts: { formats: string[] }): Detector; getSupportedFormats?: () => Promise<string[]> };
type Photo = { source: CanvasImageSource; width: number; height: number; close: () => void };

async function loadPhoto(file: Blob): Promise<Photo> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file);
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch {
      // 못 여는 브라우저 · 형식이면 그림 요소로
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

/** 브라우저가 스스로 읽은 QR 글자 — 없거나 실패하면 빈 목록 (jsqr 로 간다) */
async function nativeTexts(source: CanvasImageSource): Promise<string[]> {
  const BD = (globalThis as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  if (!BD) return [];
  try {
    const formats = (await BD.getSupportedFormats?.()) ?? ["qr_code"];
    if (!formats.includes("qr_code")) return [];
    const found = await new BD({ formats: ["qr_code"] }).detect(source);
    return found.map((f) => f.rawValue).filter(Boolean);
  } catch {
    // 지원한다고 해 놓고 실패하는 브라우저가 있다
    return [];
  }
}

const breathe = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export async function readLabelPhoto(file: Blob): Promise<LabelRead> {
  let photo: Photo;
  try {
    photo = await loadPhoto(file);
  } catch {
    return { kind: "error" };
  }
  try {
    const first = await nativeTexts(photo.source);
    const early = await scanLabel(0, () => null, first);
    if (early.kind === "ok") return early;

    const { default: jsQR } = await import("jsqr");
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return first.length ? early : { kind: "error" };
    const long = Math.max(photo.width, photo.height);
    return await scanLabel(
      long,
      async (size) => {
        await breathe();
        const k = size / long;
        canvas.width = Math.max(1, Math.round(photo.width * k));
        canvas.height = Math.max(1, Math.round(photo.height * k));
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(photo.source, 0, 0, canvas.width, canvas.height);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        return jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" })?.data ?? null;
      },
      first,
    );
  } catch {
    return { kind: "error" };
  } finally {
    photo.close();
  }
}
