import { liveCropRect, liveScanSize } from "@/lib/tracking-label";

/**
 * 카메라 영상 한 장 → 그 안의 QR 글자들 — **브라우저 안에서만** 읽는다 (영상은 어디로도 보내지 않는다). 규칙은 `src/lib/tracking-label.ts`.
 *
 * 화면에 보이는 정사각형의 가운데 80%(`liveCropRect` — 네모와 그 둘레)만 그림판에 옮겨 읽는다.
 * 1. 브라우저의 `BarcodeDetector`(안드로이드 크롬 등)가 있으면 그것으로 — 한 장에 QR 이 여럿이면 다 돌려준다
 * 2. 없으면(아이폰 사파리) `jsqr` 을 그때 불러와 장마다 크기를 바꿔 가며 읽는다 (`liveScanSize`)
 *
 * 출석 카메라(`AttendanceCamera`)와 같은 판독기다 — 출석 포스터 QR 은 커서 영상 전체를 줄여 읽고, 접수증 QR 은 작아서 가운데만 잘라 크게 읽는다.
 */

export type FrameReader = (video: HTMLVideoElement, tick: number) => Promise<string[]>;

type Detector = { detect(src: CanvasImageSource): Promise<{ rawValue: string }[]> };
type BarcodeDetectorCtor = { new (opts: { formats: string[] }): Detector; getSupportedFormats?: () => Promise<string[]> };

/** BarcodeDetector 에 넘길 때의 최대 크기 — 영상이 커도 이 이상은 줄여 넘긴다 */
const NATIVE_MAX = 1080;

async function nativeDetector(): Promise<Detector | null> {
  const BD = (globalThis as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  if (!BD) return null;
  try {
    const formats = (await BD.getSupportedFormats?.()) ?? ["qr_code"];
    return formats.includes("qr_code") ? new BD({ formats: ["qr_code"] }) : null;
  } catch {
    // 지원한다고 해 놓고 실패하는 브라우저가 있다 — jsqr 로 간다
    return null;
  }
}

export async function makeFrameReader(): Promise<FrameReader> {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("canvas_unavailable");

  /** 읽을 곳을 n × n 으로 옮기고 n 을 돌려준다 — 영상 크기를 아직 모르면 0 */
  const draw = (video: HTMLVideoElement, size: (crop: number) => number): number => {
    const rect = liveCropRect(video.videoWidth, video.videoHeight);
    if (!rect) return 0;
    const n = size(rect.size);
    if (!n) return 0;
    if (canvas.width !== n || canvas.height !== n) {
      canvas.width = n;
      canvas.height = n;
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(video, rect.sx, rect.sy, rect.size, rect.size, 0, 0, n, n);
    return n;
  };

  const detector = await nativeDetector();
  if (detector) {
    return async (video) => {
      if (!draw(video, (crop) => Math.min(crop, NATIVE_MAX))) return [];
      const found = await detector.detect(canvas);
      return found.map((f) => f.rawValue).filter(Boolean);
    };
  }

  const { default: jsQR } = await import("jsqr");
  return async (video, tick) => {
    const n = draw(video, (crop) => liveScanSize(crop, tick));
    if (!n) return [];
    const img = ctx.getImageData(0, 0, n, n);
    const text = jsQR(img.data, n, n, { inversionAttempts: "dontInvert" })?.data;
    return text ? [text] : [];
  };
}
