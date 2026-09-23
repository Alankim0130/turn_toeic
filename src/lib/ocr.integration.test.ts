import { afterAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { closeOcrWorker, readReceiptText } from "./ocr";
import { parseReceipt, readEnoughFor } from "./receipt";
import { matchSections } from "./match-sections";
import type { EnrollSection } from "./enroll-options";

/**
 * 실제 엔진으로 실물 수강증을 읽는다 (2026-09-18 역전토익 8월 수강증 — **휴대폰 화면 전체 캡처**, 이름은 가렸다).
 * 첫 실행은 언어 데이터(2.2MB)를 받아 몇 초 걸린다. 저장소가 아니라 임시 폴더(`os.tmpdir()/tesseract-cache`)에 캐시한다.
 *
 * **운영과 같은 길로 읽는다** (2026-09-22) — `readReceiptText` 에 운영의 멈춤 기준(`readEnoughFor`)을 그대로 준다.
 * 예전 이 테스트는 변형 셋을 다 읽어 이어 붙였는데, 운영은 첫 변형에서 판정 키가 다 나오면 멈춘다. 그래서 첫 변형이
 * 캡처 시각을 못 읽는 것(`현재산`)을 이 테스트가 못 잡았고, 운영에서는 "같은 초 캡처" 위조 신호가 늘 꺼져 있었다.
 * (`server-only` 는 vitest.config.ts 가 빈 모듈로 바꿔 준다.)
 */
const FIXTURE = path.join(__dirname, "__fixtures__", "receipt-phone-screenshot.png");

/** 헤더만 2만×2만(4억 픽셀)이라고 적은 74바이트 PNG — 작은 파일이 거대한 그림으로 풀리는 폭탄 */
function pixelBomb(): Buffer {
  const crc32 = (buf: Buffer) => {
    let crc = 0xffffffff;
    for (const byte of buf) {
      crc ^= byte;
      for (let k = 0; k < 8; k++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
    return (crc ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type), data])));
    return Buffer.concat([len, Buffer.from(type), data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(20000, 0);
  ihdr.writeUInt32BE(20000, 4);
  ihdr[8] = 8; // 8비트 흑백
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(Buffer.alloc(1000))), chunk("IEND", Buffer.alloc(0))]);
}

afterAll(() => closeOcrWorker());

describe("실물 수강증 OCR (휴대폰 전체 캡처)", () => {
  it("운영과 같은 길로 읽어도 판정 키가 전부 나오고 반 대조까지 된다 — 캡처 시각(초)까지", async () => {
    const out = await readReceiptText({ bytes: fs.readFileSync(FIXTURE), mimeType: "image/png", enough: readEnoughFor(null) });
    expect(out.ok).toBe(true);
    if (!out.ok) return;

    const p = parseReceipt(out.result.text);
    expect(p.gates).toEqual({ academy: true, brand: true });
    expect(p.level).toBe(650);
    expect(p.program).toBe("score");
    expect(p.weekly).toBe(5);
    expect(p.mode).toBe("live"); // 강의실 `온라인 강의`
    expect(p.modeEvidence).toBe("online");
    // 자동 승인 조건 (2026-09-22, firsttoeic 사고 2·3) — 실물 캡처가 첫 변형에서 전부 통과해야 한다
    expect(p.brandExact).toBe(true);
    expect(p.card).toBe(true);
    expect(p.time?.timeBlock).toBe("10:00~12:10");
    expect(p.courseMonth).toBe(8);
    // 캡처 시각은 **초까지** 읽혀야 한다 (2026-09-19) — 이 값으로 다른 계정의 복사본을 잡는다.
    // 첫 변형에서 멈춰도 읽혀야 한다 (2026-09-22 — 예전에는 여기서 비었다)
    expect(p.capturedOn).toBe("2026-08-07");
    expect(p.capturedAt).toBe("2026-08-07T16:19:02");
    // 캡처 시각은 수강 날짜가 아니다
    expect(p.months).toEqual([]);

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

  it("여러 장이 한꺼번에 와도 한 장씩 읽어 모두 끝난다 (교실에서 여럿이 동시에 올리는 경우)", async () => {
    const bytes = fs.readFileSync(FIXTURE);
    const outs = await Promise.all([1, 2, 3].map(() => readReceiptText({ bytes, mimeType: "image/png", enough: readEnoughFor(null) })));
    expect(outs.map((o) => o.ok)).toEqual([true, true, true]);
  }, 90_000);

  it("픽셀 폭탄은 워커에 넘기지 않고 '못 읽음' 으로 돌려준다 — 그 뒤에도 엔진은 멀쩡하다", async () => {
    const bomb = await readReceiptText({ bytes: pixelBomb(), mimeType: "image/png" });
    expect(bomb.ok).toBe(false);
    expect(bomb.ok ? "" : bomb.reason).toMatch(/^image_unreadable/);

    const after = await readReceiptText({ bytes: fs.readFileSync(FIXTURE), mimeType: "image/png", enough: readEnoughFor(null) });
    expect(after.ok).toBe(true);
  }, 60_000);
});
