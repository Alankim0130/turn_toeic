import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createWorker } from "tesseract.js";
import { receiptVariants } from "./ocr-image";
import { parseReceipt } from "./receipt";
import { matchSections } from "./match-sections";
import type { EnrollSection } from "./enroll-options";

/**
 * 실제 엔진으로 실물 수강증을 읽는다 (2026-09-18 역전토익 8월 수강증 — **휴대폰 화면 전체 캡처**, 이름은 가렸다).
 * 첫 실행은 언어 데이터(2.2MB)를 받아 몇 초 걸린다. 저장소가 아니라 임시 폴더에 캐시한다.
 *
 * src/lib/ocr.ts 의 `tesseractOcr` 은 "server-only" 라 여기서 직접 못 부르므로 같은 순서(변형 → 인식 → 이어 붙임)를 그대로 돈다.
 */
const FIXTURE = path.join(__dirname, "__fixtures__", "receipt-phone-screenshot.png");

describe("실물 수강증 OCR (휴대폰 전체 캡처)", () => {
  it("흑백 변형을 이어 읽으면 판정 키가 전부 나오고 반 대조까지 된다", async () => {
    const cachePath = path.join(os.tmpdir(), "tesseract-cache");
    fs.mkdirSync(cachePath, { recursive: true });
    const worker = await createWorker("kor", 1, { cachePath, logger: () => {} });
    const variants = await receiptVariants(fs.readFileSync(FIXTURE));
    const texts: string[] = [];
    for (const v of variants) texts.push((await worker.recognize(v.bytes)).data.text);
    await worker.terminate();

    const p = parseReceipt(texts.join("\n"));
    expect(variants.map((v) => v.name)).toEqual(["gray", "gray_w700", "white_only"]);
    expect(p.gates).toEqual({ academy: true, brand: true });
    expect(p.level).toBe(650);
    expect(p.program).toBe("score");
    expect(p.weekly).toBe(5);
    expect(p.mode).toBe("live"); // `라이브방송` 이 두 줄로 갈려 있다
    expect(p.time?.timeBlock).toBe("10:00~12:10");
    expect(p.courseMonth).toBe(8);

    // 8월 반이 열려 있었다면 월수금·화목금 120분 반 한 쌍에 붙는다
    const c650 = { id: 1, name: "650", program: "score", target_score: 650 };
    const aug = { year: 2026, month: 8 };
    const sections: EnrollSection[] = [
      { id: 11, track: "mwf", time_block: "10:00~12:10", term: aug, course: c650 },
      { id: 12, track: "ttf", time_block: "10:00~12:10", term: aug, course: c650 },
      { id: 13, track: "mwf", time_block: "10:00~11:00", term: aug, course: c650 },
      { id: 14, track: "ttf", time_block: "10:00~11:00", term: aug, course: c650 },
    ];
    expect(matchSections(p, sections).result).toEqual({ kind: "match", sectionIds: [11, 12], term: "2026-08" });
  }, 60_000);
});
