import { describe, expect, it } from "vitest";
import { createSerialQueue, QueueBusyError } from "./serial-queue";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 수강증 OCR 워커를 나눠 쓰는 줄 (2026-09-22) — 동시에 올라온 수강증이 서로의 워커를 죽이지 않게 */
describe("createSerialQueue", () => {
  it("한 번에 하나씩, 온 순서대로 돌린다", async () => {
    const run = createSerialQueue();
    const log: string[] = [];
    let running = 0;
    const job = (name: string, ms: number) =>
      run(async () => {
        running += 1;
        expect(running).toBe(1); // 겹치지 않는다
        log.push(`${name}+`);
        await sleep(ms);
        log.push(`${name}-`);
        running -= 1;
        return name;
      }, 1000);
    const results = await Promise.all([job("A", 30), job("B", 10), job("C", 5)]);
    expect(results).toEqual(["A", "B", "C"]);
    expect(log).toEqual(["A+", "A-", "B+", "B-", "C+", "C-"]);
  });

  it("앞 작업이 실패해도 다음 작업은 돈다", async () => {
    const run = createSerialQueue();
    const a = run(async () => {
      throw new Error("boom");
    }, 1000);
    const b = run(async () => "B", 1000);
    await expect(a).rejects.toThrow("boom");
    await expect(b).resolves.toBe("B");
  });

  it("차례를 너무 오래 기다리면 포기한다 — 포기한 자리 때문에 줄이 멈추지 않는다", async () => {
    const run = createSerialQueue();
    const slow = run(async () => {
      await sleep(80);
      return "slow";
    }, 1000);
    const impatient = run(async () => "never", 20);
    const after = run(async () => "after", 1000);
    await expect(impatient).rejects.toBeInstanceOf(QueueBusyError);
    await expect(slow).resolves.toBe("slow");
    await expect(after).resolves.toBe("after");
  });

  it("포기한 작업은 돌지 않는다", async () => {
    const run = createSerialQueue();
    let ran = false;
    const slow = run(() => sleep(60), 1000);
    const impatient = run(async () => {
      ran = true;
    }, 10);
    await expect(impatient).rejects.toThrow("ocr_busy");
    await slow;
    await sleep(10);
    expect(ran).toBe(false);
  });
});
