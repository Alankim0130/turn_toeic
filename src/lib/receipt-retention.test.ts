import { describe, expect, it } from "vitest";
import { RECEIPT_RETENTION_DAYS, RETENTION_LABEL, purgeCutoff } from "./receipt-retention";

describe("수강증 보관 기간", () => {
  it("2개월 = 60일 (2026-09-20 Alan)", () => {
    expect(RECEIPT_RETENTION_DAYS).toBe(60);
  });

  it("학생에게 적는 말과 날수가 같은 뜻이다 — 어긋나면 고지한 것과 실제가 달라진다", () => {
    expect(RETENTION_LABEL).toBe("2개월");
    expect(RECEIPT_RETENTION_DAYS).toBe(60);
  });

  it("기준 시각에서 60일을 뺀다", () => {
    const now = new Date("2026-09-20T00:00:00.000Z");
    expect(purgeCutoff(now)).toBe("2026-07-22T00:00:00.000Z");
  });

  it("경계 — 딱 60일 된 것은 아직 남고, 하루 더 지난 것이 지워진다", () => {
    const now = new Date("2026-09-20T00:00:00.000Z");
    const cutoff = purgeCutoff(now);
    expect("2026-07-22T00:00:00.000Z" < cutoff).toBe(false); // 딱 60일 — 남는다
    expect("2026-07-21T23:59:59.000Z" < cutoff).toBe(true); // 60일 + 1초 — 지운다
  });

  it("인자를 안 주면 지금을 기준으로 한다", () => {
    const before = Date.now() - RECEIPT_RETENTION_DAYS * 86_400_000;
    const got = Date.parse(purgeCutoff());
    expect(Math.abs(got - before)).toBeLessThan(5_000);
  });
});
