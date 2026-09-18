import "server-only";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createWorker, type Worker } from "tesseract.js";
import type { OcrEngine, OcrResult } from "./receipt";
import { receiptVariants } from "./ocr-image";

/**
 * 수강증 OCR 엔진 — tesseract.js (한국어, 무료 · 자체 실행).
 *
 * **왜 무료 엔진인가** (2026-09-16 Alan 확인, 샘플 수강증으로 실측): 수강증은 종이 사진이 아니라
 * YBM 앱·홈페이지 **화면 캡처**라 글자가 또렷하다. 예시 이미지에서 판정에 쓰는 줄
 * (수강생 · 수강센터 · 강사 · 수강요일 · 수강시간 · 수강료)이 1초 만에 그대로 읽혔다 (confidence 84).
 * 그래서 유료 엔진(네이버 클로바 등)을 쓰지 않는다 — 키·요금·외부 전송이 없고,
 * **수강증에 든 개인정보(실명)를 밖으로 내보내지 않는다**는 점이 더 중요하다.
 *
 * 읽은 뒤의 판독은 `parseReceipt`(src/lib/receipt.ts)가 한다. 이 파일은 "이미지 → 글자"만 맡는다.
 *
 * ## 서버에서만 돈다
 * 학생 브라우저에서 돌리면 언어 데이터(수 MB)를 학생 데이터로 받게 되고, 무엇보다
 * **클라이언트가 보낸 글자는 믿을 수 없다** (게이트를 우회해 남의 반에 배정될 수 있다).
 * 그래서 업로드된 파일을 서버가 Storage 에서 내려받아 여기서 읽는다.
 *
 * ## Vercel 에서 주의할 것
 * - 언어 데이터(`kor.traineddata`)는 처음 한 번 CDN 에서 받아 **쓰기가 되는 `/tmp` 에만** 캐시한다.
 *   기본값(현재 디렉터리)으로 두면 읽기 전용 파일 시스템이라 실패한다.
 * - 워커는 모듈 수준에서 한 번 만들어 재사용한다 (Fluid Compute 가 인스턴스를 재사용하므로 두 번째 요청부터 빠르다).
 * - `next.config.ts` 의 `serverExternalPackages` 에 넣어 번들되지 않게 한다 — 워커 스크립트를 파일 경로로 찾기 때문이다.
 */

const LANG = "kor";
/** 이미지 한 장에 이보다 오래 걸리면 포기하고 스태프 검토로 보낸다 */
const TIMEOUT_MS = 30_000;

let workerPromise: Promise<Worker> | null = null;

/**
 * 언어 데이터(`kor.traineddata`, 2.2MB)를 둘 곳.
 * **폴더가 없으면 tesseract.js 가 조용히 캐시를 건너뛰고 매번 새로 받는다** (실측 확인) — 그래서 먼저 만든다.
 * 기본값은 현재 디렉터리라 서버리스(읽기 전용)에서는 쓸 수 없다.
 */
function cacheDir(): string {
  const dir = path.join(os.tmpdir(), "tesseract-cache");
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    /* 못 만들면 캐시 없이 매번 받는다 — 느릴 뿐 동작은 한다 */
  }
  return dir;
}

/** 워커를 못 만들었으면 잠시 쉰다 — 실패한 워커 스레드는 손에 없어 못 끝내므로(아래) 요청마다 다시 만들면 스레드가 쌓인다 */
const RETRY_AFTER_MS = 5 * 60_000;
let failedAt = 0;

/**
 * 워커 준비. tesseract.js 의 `createWorker` 는 **언어 데이터·초기화가 실패해도 끝나지 않는다** — 안에서 오류를 삼키고
 * `errorHandler` 만 부른다 (2026-09-18 실측: 네트워크 실패에 errorHandler 는 바로 불리는데 promise 는 영영 대기).
 * 그대로 두면 실패할 때마다 30초 타임아웃을 다 기다린 뒤에야 "못 읽음" 이 되고 학생은 그동안 "읽는 중…" 만 본다.
 * 그래서 errorHandler 로 받은 **첫 오류로 여기서 바로 실패**시킨다. errorHandler 가 아예 없으면 tesseract.js 가
 * 메인 스레드에 그냥 던져(uncaught exception) 함수 전체가 죽는다.
 */
function getWorker(): Promise<Worker> {
  if (!workerPromise && Date.now() - failedAt < RETRY_AFTER_MS) return Promise.reject(new Error("ocr_cooldown"));
  workerPromise ??= new Promise<Worker>((resolve, reject) => {
    let settled = false;
    const fail = (err: unknown) => {
      if (settled) return;
      settled = true;
      failedAt = Date.now();
      reject(err instanceof Error ? err : new Error(String(err)));
    };
    createWorker(LANG, 1, {
      cachePath: cacheDir(),
      logger: () => {},
      errorHandler: (err: unknown) => {
        console.error("[ocr] worker error:", err);
        fail(err);
      },
    }).then((worker) => {
      if (settled) return void worker.terminate();
      settled = true;
      resolve(worker);
    }, fail);
  });
  return workerPromise;
}

/** 실패한 워커를 붙들고 있으면 다음 요청도 같이 죽는다 — 버리고 다음에 새로 만든다 */
async function resetWorker() {
  const pending = workerPromise;
  workerPromise = null;
  try {
    const worker = await pending;
    await worker?.terminate();
  } catch {
    /* 이미 망가진 워커다 */
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("ocr_timeout")), ms);
    p.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

/** tesseract.js 가 읽을 수 있는 형식인가. PDF 는 못 읽는다 (이미지로 펼쳐야 한다) */
export function ocrSupports(mimeType: string | null | undefined, filePath?: string): boolean {
  const type = (mimeType ?? "").toLowerCase();
  if (type.startsWith("image/")) return true;
  if (type) return false;
  return /\.(jpe?g|png|webp|bmp)$/i.test(filePath ?? "");
}

export const tesseractOcr: OcrEngine = {
  name: `tesseract.js/${LANG}`,
  /**
   * 흑백 변형 여러 장을 읽어 원문을 이어 붙인다 (`receiptVariants` 참고 — 컬러 원본은 파란 카드를 통째로 놓친다).
   * 전처리가 실패하면(깨진 파일 등) 원본 한 장으로 돈다.
   */
  async recognize({ bytes }): Promise<OcrResult> {
    const worker = await getWorker();
    let variants: { name: string; bytes: Buffer }[];
    try {
      variants = await receiptVariants(bytes);
    } catch {
      variants = [{ name: "original", bytes: Buffer.from(bytes) }];
    }
    const texts: string[] = [];
    let confidence = 0;
    for (const v of variants) {
      const { data } = await worker.recognize(v.bytes);
      texts.push(data.text);
      confidence = Math.max(confidence, data.confidence);
    }
    return { text: texts.join("\n"), engine: `tesseract.js/${LANG}`, raw: { confidence, variants: variants.map((v) => v.name) } };
  },
};

export type OcrOutcome = { ok: true; result: OcrResult } | { ok: false; reason: string };

/**
 * 이미지 바이트 → 원문. **실패해도 던지지 않는다** — 사유(`reason`)를 돌려주고 로그에 남긴다.
 * 등업신청은 OCR 이 안 돼도 접수돼야 한다 (읽은 게 없으면 스태프 검토로 간다, `decideVerification`).
 * 사유는 `enrollment_verifications.ocr_raw.error` 에 남아 승인 화면에서 보인다 — 2026-09-18 첫 운영 테스트에서
 * 조용히 null 만 돌려줘서 왜 안 읽혔는지(Vercel 에 wasm 이 없었다) 알 길이 없었다.
 */
export async function readReceiptText(input: { bytes: Uint8Array; mimeType?: string | null; filePath?: string }): Promise<OcrOutcome> {
  if (!ocrSupports(input.mimeType, input.filePath)) return { ok: false, reason: "not_image" };
  const started = Date.now();
  try {
    const result = await withTimeout(tesseractOcr.recognize({ bytes: input.bytes, mimeType: input.mimeType ?? "" }), TIMEOUT_MS);
    console.log(`[ocr] ${result.text.replace(/\s+/g, "").length}자 읽음, ${Date.now() - started}ms`);
    return { ok: true, result };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(`[ocr] 수강증을 읽지 못했어요 (${Date.now() - started}ms): ${reason}`);
    await resetWorker();
    return { ok: false, reason: reason.slice(0, 200) };
  }
}
