import { describe, expect, it } from "vitest";
import { fuzzyIncludes, levenshtein, normalizeReceiptText, parseReceipt, receiptHasName } from "@/lib/receipt";

/** CLAUDE.md "수강증 표기 규칙" 표의 강좌명. 학원명·강사명은 실제 수강증 양식을 받기 전까지의 가정 */
const receipt = (course: string, extra = "") => `YBM어학원 서면센터\n역전토익 ${course}\n강사 이혜영\n수강생 김민수\n${extra}`;

describe("정규화", () => {
  it("전각 숫자·구분자를 반각으로", () => {
    const { compact } = normalizeReceiptText("１０：００～１２：１０");
    expect(compact).toBe("10:00~12:10");
  });
  it("시각의 . ; 구분자를 : 로, 범위의 - – 를 ~ 로 (시각 사이에서만)", () => {
    const { compact } = normalizeReceiptText("10.00 - 12.10 / 18;30–20;40 / 2026-09-16 / 010-1234-5678");
    expect(compact).toContain("10:00~12:10");
    expect(compact).toContain("18:30~20:40");
    expect(compact).toContain("2026-09-16"); // 날짜 하이픈은 그대로
    expect(compact).toContain("010-1234-5678"); // 전화번호도 그대로
  });
});

describe("편집거리", () => {
  it("한 음절 오인식은 거리 1", () => {
    expect(levenshtein("역전토익", "력전토익")).toBe(1);
    expect(levenshtein("역전토익", "역젼토익")).toBe(1);
    expect(fuzzyIncludes("YBM 력전토익 650", "역전토익")).toBe(true);
    expect(fuzzyIncludes("YBM 첫토익 650", "역전토익")).toBe(false);
  });
});

describe("표기 규칙 표 — 주3일 / 주5일 · 트랙 · 방식", () => {
  it("주5일 (월18회) → 두 트랙 · 현장", () => {
    const p = parseReceipt(receipt("650 주5일 (월18회) 10:00~12:10"));
    expect(p.weekly).toBe(5);
    expect(p.tracks).toEqual(["mwf", "ttf"]);
    expect(p.mode).toBe("onsite");
  });
  it("주5일 (월18회 라이브방송) → 두 트랙 · 불라방", () => {
    const p = parseReceipt(receipt("650 주5일 (월18회 라이브방송) 10:00~12:10"));
    expect(p.tracks).toEqual(["mwf", "ttf"]);
    expect(p.mode).toBe("live");
  });
  it("주5일 (월18회) 월수금(현강)+화목금(인강) → 주5일 · 현장 (인강은 불라방이 아니다)", () => {
    const p = parseReceipt(receipt("750 주5일 (월18회) 월수금(현강)+화목금(인강) 18:30~20:40"));
    expect(p.weekly).toBe(5);
    expect(p.tracks).toEqual(["mwf", "ttf"]);
    expect(p.mode).toBe("onsite");
  });
  it("주5일 표기 안의 월수금 글자 때문에 주3일로 오독하지 않는다", () => {
    const p = parseReceipt(receipt("650 주5일 (월18회) 월수금(현강)+화목금(인강)"));
    expect(p.weekly).not.toBe(3);
    expect(p.tracks).toHaveLength(2);
  });
  it("월수금 (월9회) → 주3일 · 월수금 · 현장", () => {
    const p = parseReceipt(receipt("650 월수금 (월9회) 10:00~11:00"));
    expect(p.weekly).toBe(3);
    expect(p.tracks).toEqual(["mwf"]);
    expect(p.mode).toBe("onsite");
  });
  it("화목금 (월9회 라이브방송) → 주3일 · 화목금 · 불라방", () => {
    const p = parseReceipt(receipt("750 화목금 (월9회 라이브방송) 18:30~20:40"));
    expect(p.weekly).toBe(3);
    expect(p.tracks).toEqual(["ttf"]);
    expect(p.mode).toBe("live");
  });
  it("라이브방송이 한 글자 틀려도 불라방으로 읽는다", () => {
    expect(parseReceipt(receipt("650 월수금 (월9회 라이브방숭)")).mode).toBe("live");
  });
  it("주5일이 한 글자 틀려도 주5일로 읽는다", () => {
    const p = parseReceipt(receipt("650 주5알 (월18회)"));
    expect(p.weekly).toBe(5);
  });
});

describe("레벨 · 과정", () => {
  it("650 · 750 · 850 을 숫자로 읽는다", () => {
    expect(parseReceipt(receipt("650 월수금 (월9회)")).level).toBe(650);
    expect(parseReceipt(receipt("750 월수금 (월9회)")).level).toBe(750);
    expect(parseReceipt(receipt("850 월수금 (월9회)")).level).toBe(850);
  });
  it("시각 16:50 이나 금액 1650원 의 650 은 레벨이 아니다", () => {
    const p = parseReceipt(receipt("750 월수금 (월9회) 15:30~16:50", "교재 1650원"));
    expect(p.levels).toEqual([750]);
  });
  it("프리미어반 = 스파르타", () => {
    const p = parseReceipt(receipt("650 주5일 (월18회) 프리미어반 10:00~13:40"));
    expect(p.program).toBe("sparta");
    expect(p.level).toBe(650);
    expect(p.tracks).toEqual(["mwf", "ttf"]);
  });
  it("프리미어반이 없으면 점수보장반", () => {
    expect(parseReceipt(receipt("650 주5일 (월18회)")).program).toBe("score");
  });
});

describe("수업 시간 — 그대로 돌려준다 (60/120분으로 가르지 않는다)", () => {
  it("time_block 형식으로 정리하고 분을 계산한다", () => {
    const p = parseReceipt(receipt("650 주5일 (월18회) 10:00~12:10"));
    expect(p.time).toEqual({ start: "10:00", end: "12:10", minutes: 130, timeBlock: "10:00~12:10" });
  });
  it("한 타임(60분)도 그대로", () => {
    expect(parseReceipt(receipt("650 월수금 (월9회) 10:00~11:00")).time?.timeBlock).toBe("10:00~11:00");
  });
  it("850 세 시간대 — 70분과 140분 반은 서로 다른 반이라 라벨을 그대로 둔다", () => {
    expect(parseReceipt(receipt("850 월수금 (월9회) 12:30~13:40")).time?.minutes).toBe(70);
    expect(parseReceipt(receipt("850 월수금 (월9회) 12:30~15:00")).time?.timeBlock).toBe("12:30~15:00");
  });
  it("한 자리 시각은 두 자리로 맞춘다 (반의 time_block 과 같은 형식)", () => {
    expect(parseReceipt(receipt("650 월수금 (월9회) 9:00~11:10")).time?.timeBlock).toBe("09:00~11:10");
  });
  it("시간이 없으면 warning 만 남기고 null", () => {
    const p = parseReceipt(receipt("650 월수금 (월9회)"));
    expect(p.time).toBeNull();
    expect(p.warnings.some((w) => w.includes("수업 시간"))).toBe(true);
  });
});

describe("게이트", () => {
  it("G1: YBM + 서면/부산", () => {
    expect(parseReceipt("YBM어학원 서면센터 역전토익 650").gates.academy).toBe(true);
    expect(parseReceipt("YBM어학원 강남센터 역전토익 650").gates.academy).toBe(false);
    expect(parseReceipt("해커스 부산 역전토익 650").gates.academy).toBe(false);
  });
  it("G2: 역전토익(오인식 1자 허용) 또는 강사명", () => {
    expect(parseReceipt("YBM 서면 력전토익 650").gates.brand).toBe(true);
    expect(parseReceipt("YBM 서면 토익 650 이영수").gates.brand).toBe(true);
    expect(parseReceipt("YBM 서면 첫토익 650").gates.brand).toBe(false);
  });
  it("G3: 가입 실명은 공백 무시 정확 일치 — 한 글자 다른 이름은 통과시키지 않는다", () => {
    const text = "수강생: 김 민 수";
    expect(receiptHasName(text, "김민수")).toBe(true);
    expect(receiptHasName(text, "김민주")).toBe(false);
    expect(receiptHasName(text, "")).toBe(false);
  });
});

describe("참고 필드", () => {
  it("영수증번호와 금액은 있으면 읽고 없으면 null", () => {
    const p = parseReceipt(receipt("650 월수금 (월9회)", "영수증번호: A2026-091601\n수강료 250,000원"));
    expect(p.receiptNo).toBe("A2026-091601");
    expect(p.tuition).toBe(250000);
    const q = parseReceipt(receipt("650 월수금 (월9회)"));
    expect(q.receiptNo).toBeNull();
    expect(q.tuition).toBeNull();
  });
});
