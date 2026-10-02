import { describe, expect, it } from "vitest";
import { receiptFacts, receiptNameMismatch, receiptVerdict } from "./receipt-history";

describe("학생 관리의 올린 수강증 — 결과 이름", () => {
  const row = (x: Partial<Parameters<typeof receiptVerdict>[0]>) => ({ result: null, confidence: null, reject_reason: null, candidates: null, ...x });
  it("자동 승인은 confidence 100, 스태프 승인은 비어 있다", () => {
    expect(receiptVerdict(row({ result: "approved", confidence: 100 })).label).toBe("자동 승인");
    expect(receiptVerdict(row({ result: "approved", confidence: "100" })).label).toBe("자동 승인");
    expect(receiptVerdict(row({ result: "approved" })).label).toBe("승인");
  });
  it("자동 반려는 rule auto-reject · 사유를 함께", () => {
    expect(receiptVerdict(row({ result: "rejected", candidates: { rule: "auto-reject", code: "brand" }, reject_reason: "역전토익 수강증이 아니에요" }))).toEqual({
      label: "자동 반려",
      tone: "red",
      note: "역전토익 수강증이 아니에요",
    });
    expect(receiptVerdict(row({ result: "rejected", candidates: { rule: "key-match" }, reject_reason: "이름이 달라요" })).label).toBe("반려");
  });
  it("검토 대기 · 받아 둔 다음 달 수강증", () => {
    expect(receiptVerdict(row({})).label).toBe("검토 대기");
    expect(receiptVerdict(row({ candidates: { rule: "key-match", hold: 11 } })).label).toBe("11월 반 개설 대기");
  });
});

describe("학생 관리의 올린 수강증 — 읽은 값 한 줄", () => {
  it("수강월 · 레벨 · 주 · 트랙 · 시간 · 방식", () => {
    expect(
      receiptFacts({ courseMonth: 10, level: 650, program: "score", weekly: 5, tracks: ["mwf", "ttf"], time: { timeBlock: "10:00~12:10" }, mode: "live", modeEvidence: "online" }),
    ).toBe("10월 · 650 · 주5일(월수금+화목금) · 10:00~12:10 · 불라방");
    expect(receiptFacts({ startMonth: 10, level: 750, program: "sparta", weekly: 5, tracks: ["mwf", "ttf"], mode: "onsite", modeEvidence: "room" })).toBe("10월 · 750 프리미어 · 주5일(월수금+화목금) · 현장");
  });
  it("강의실을 못 읽어 기본값으로 둔 방식은 적지 않는다 · 못 읽은 칸은 뺀다", () => {
    expect(receiptFacts({ level: 650, mode: "onsite", modeEvidence: null })).toBe("650");
    expect(receiptFacts(null)).toBe("");
    expect(receiptFacts({})).toBe("");
  });
  it("이름 다름", () => {
    expect(receiptNameMismatch({ nameMatches: false })).toBe(true);
    expect(receiptNameMismatch({ nameMatches: null })).toBe(false);
  });
});
