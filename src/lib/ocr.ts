import "server-only";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createWorker, type Worker } from "tesseract.js";
import type { OcrEngine, OcrResult } from "./receipt";
import { receiptVariants, type OcrVariant } from "./ocr-image";
import { createSerialQueue } from "./serial-queue";

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
 *
 * ## 동시에 여러 장이 오면 — 줄을 세운다 (2026-09-22)
 * 한 인스턴스가 요청 여러 개를 함께 돌리는데 워커는 한 번에 한 장만 읽는다. 예전에는 줄 선 시간까지 30초에 들어가
 * **교실에서 여럿이 한꺼번에 올리면 뒤 사람이 시간 초과**가 났고, 시간 초과가 난 요청이 공유 워커를 죽이면
 * **같이 기다리던 요청은 영영 끝나지 않았다**(tesseract.js 는 죽은 워커의 작업을 끝내 주지 않는다 — 실측) — 그 요청들이 30초 뒤
 * 저마다 또 워커를 죽여 **새로 만든 워커까지 연쇄로** 죽었다. 지금은 `ocrQueue` 로 한 장씩 읽고, 30초는 **자기 차례부터** 센다.
 * 워커를 죽이고 새로 만드는 것은 **차례를 쥔 작업 안에서만** 한다.
 */

const LANG = "kor";
/** 이미지 한 장을 읽는 데 이보다 오래 걸리면 포기하고 스태프 검토로 보낸다. **자기 차례가 온 뒤부터** 센다 */
const TIMEOUT_MS = 30_000;
/**
 * 앞 사람 수강증을 읽는 동안 이만큼까지 기다린다 (넘으면 `ocr_busy` 로 스태프 검토).
 * 기다림 20초 + 읽기 30초 = 50초 — 페이지 함수 제한 60초(`src/app/my/verify/page.tsx` 의 maxDuration) 안에 답을 돌려준다.
 */
const QUEUE_WAIT_MS = 20_000;

const ocrQueue = createSerialQueue();

/** 지금 쓰는 워커. `ready` = 준비(언어 데이터·초기화)까지 끝났나 — 준비 중에 버린 워커는 스레드가 남는다 */
let slot: { promise: Promise<Worker>; ready: boolean } | null = null;

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
  if (slot) return slot.promise;
  if (Date.now() - failedAt < RETRY_AFTER_MS) return Promise.reject(new Error("ocr_cooldown"));
  const current = { ready: false } as { promise: Promise<Worker>; ready: boolean };
  current.promise = new Promise<Worker>((resolve, reject) => {
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
      current.ready = true;
      resolve(worker);
    }, fail);
  });
  slot = current;
  return current.promise;
}

/**
 * 실패한 워커를 붙들고 있으면 다음 요청도 같이 죽는다 — 버리고 다음에 새로 만든다.
 * **`ocrQueue` 차례를 쥔 작업 안에서만 부른다** — 그래야 이 워커를 쓰는 다른 요청이 없다.
 * 워커가 끝나기를 **기다리지 않는다**: 만들다 멈춘 워커는 영영 끝나지 않을 수 있어서, 기다리면 줄 전체가 멈춘다.
 */
function resetWorker() {
  const old = slot;
  slot = null;
  if (!old) return;
  // 준비도 못 끝낸 워커는 스레드를 손에 쥐지 못해 남는다 — 잠시 새로 만들지 않는다 (요청마다 스레드가 쌓이지 않게)
  if (!old.ready) failedAt = Date.now();
  old.promise.then((w) => w.terminate(), () => {}).catch(() => {});
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

/** 흑백 변형 여러 장을 읽어 원문을 이어 붙인다 (`receiptVariants` 참고 — 컬러 원본은 파란 카드를 통째로 놓친다) */
async function recognizeVariants(variants: OcrVariant[], enough?: (text: string) => boolean): Promise<OcrResult> {
  const worker = await getWorker();
  const texts: string[] = [];
  const used: string[] = [];
  let confidence = 0;
  for (const v of variants) {
    const { data } = await worker.recognize(v.bytes);
    texts.push(data.text);
    used.push(v.name);
    confidence = Math.max(confidence, data.confidence);
    // 판정 키가 다 나왔으면 남은(더 느린) 변형은 건너뛴다 — 변형 순서는 receiptVariants 가 싼 것부터 둔다
    if (enough?.(texts.join("\n"))) break;
  }
  return { text: texts.join("\n"), engine: `tesseract.js/${LANG}`, raw: { confidence, variants: used } };
}

export const tesseractOcr: OcrEngine = {
  name: `tesseract.js/${LANG}`,
  async recognize({ bytes, enough }): Promise<OcrResult> {
    // 전처리는 줄 밖에서 한다 (워커를 쓰지 않는다). **실패하면 원본을 그대로 읽지 않는다** (2026-09-22) —
    // 픽셀 상한(4,000만)을 넘는 그림도 여기서 실패하는데, 예전처럼 원본을 워커에 넘기면 상한이 무력해진다
    // (작은 파일이 거대한 픽셀로 풀리는 폭탄이 워커 메모리를 태운다). sharp 가 못 여는 그림은 tesseract 도 못 읽는다
    let variants: OcrVariant[];
    try {
      variants = await receiptVariants(bytes);
    } catch (err) {
      throw new Error(`image_unreadable: ${err instanceof Error ? err.message : String(err)}`);
    }
    return ocrQueue(async () => {
      try {
        return await withTimeout(recognizeVariants(variants, enough), TIMEOUT_MS);
      } catch (err) {
        resetWorker(); // 차례를 쥐고 있다 — 이 워커를 쓰는 다른 요청은 없다
        throw err;
      }
    }, QUEUE_WAIT_MS);
  },
};

export type OcrOutcome = { ok: true; result: OcrResult } | { ok: false; reason: string };

/**
 * 이미지 바이트 → 원문. **실패해도 던지지 않는다** — 사유(`reason`)를 돌려주고 로그에 남긴다.
 * 등업신청은 OCR 이 안 돼도 접수돼야 한다 (읽은 게 없으면 스태프 검토로 간다, `decideVerification`).
 * 사유는 `enrollment_verifications.ocr_raw.error` 에 남아 승인 화면에서 보인다 — 2026-09-18 첫 운영 테스트에서
 * 조용히 null 만 돌려줘서 왜 안 읽혔는지(Vercel 에 wasm 이 없었다) 알 길이 없었다.
 */
export async function readReceiptText(input: {
  bytes: Uint8Array;
  mimeType?: string | null;
  filePath?: string;
  /** 판정 키가 다 읽혔는지 — true 면 남은 변형을 건너뛴다 (`receiptComplete`) */
  enough?: (text: string) => boolean;
}): Promise<OcrOutcome> {
  if (!ocrSupports(input.mimeType, input.filePath)) return { ok: false, reason: "not_image" };
  const started = Date.now();
  try {
    const result = await tesseractOcr.recognize({ bytes: input.bytes, mimeType: input.mimeType ?? "", enough: input.enough });
    const used = (result.raw as { variants?: string[] } | undefined)?.variants?.join("+") ?? "?";
    console.log(`[ocr] ${result.text.replace(/\s+/g, "").length}자 읽음, ${Date.now() - started}ms (${used})`);
    return { ok: true, result };
  } catch (err) {
    // 워커는 여기서 버리지 않는다 — 버릴 워커는 차례를 쥔 작업이 이미 버렸다. `ocr_busy`(줄이 길다)·`image_unreadable` 은 워커 잘못이 아니다
    const reason = err instanceof Error ? err.message : String(err);
    console.error(`[ocr] 수강증을 읽지 못했어요 (${Date.now() - started}ms): ${reason}`);
    return { ok: false, reason: reason.slice(0, 200) };
  }
}

/**
 * 워커를 끝낸다 — 테스트가 끝날 때 쓴다 (워커 스레드가 남아 프로세스가 끝나지 않는 일을 막는다).
 * 줄을 거쳐 **도는 작업이 끝난 뒤에** 끝낸다.
 */
export async function closeOcrWorker(): Promise<void> {
  await ocrQueue(async () => {
    const old = slot;
    slot = null;
    if (old) await withTimeout(old.promise.then((w) => w.terminate()), 5_000).catch(() => {});
  }, 120_000).catch(() => {});
}
