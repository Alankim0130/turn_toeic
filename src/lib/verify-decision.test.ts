import { describe, expect, it } from "vitest";
import { parseReceipt, parseReceiptMonths } from "./receipt";
import { decideVerification, isCaptureFresh } from "./verify-decision";

const SEP = [{ year: 2026, month: 9 }];
const SEP_OCT = [
  { year: 2026, month: 9 },
  { year: 2026, month: 10 },
];

/** 게이트를 통과하는 진짜 수강증 모양 (길이도 실제와 비슷하게) */
const REAL = `
YBM어학원 서면센터
역전토익 650+ 왕기초반
담당 이혜영
주5일 (월18회) 10:00~12:10
수강기간 2026-09-03 ~ 2026-10-03
결제일 2026-08-28
영수증번호 A1234567
수강료 250,000원
`;

describe("parseReceiptMonths — 수강증의 날짜", () => {
  it("여러 표기를 읽는다", () => {
    expect(parseReceiptMonths("2026-09-03 ~ 2026-10-03")).toEqual([
      { year: 2026, month: 9 },
      { year: 2026, month: 10 },
    ]);
    expect(parseReceiptMonths("2026.09.03")).toEqual([{ year: 2026, month: 9 }]);
    expect(parseReceiptMonths("2026년 9월 3일")).toEqual([{ year: 2026, month: 9 }]);
    expect(parseReceiptMonths("2026/09/03")).toEqual([{ year: 2026, month: 9 }]);
  });

  it("같은 달은 한 번만", () => {
    expect(parseReceiptMonths("2026-09-03 2026-09-30")).toEqual([{ year: 2026, month: 9 }]);
  });

  it("날짜가 아닌 숫자 뭉치는 읽지 않는다 — 금액·영수증번호를 날짜로 오독하면 엉뚱하게 거절된다", () => {
    expect(parseReceiptMonths("250,000원")).toEqual([]);
    expect(parseReceiptMonths("영수증번호 A1234567")).toEqual([]);
    expect(parseReceiptMonths("2026")).toEqual([]);
    expect(parseReceiptMonths("2026-13-01")).toEqual([]);
    expect(parseReceiptMonths("1999-09-01")).toEqual([]);
  });
});

describe("decideVerification — 바로 거절 / 검토 대기", () => {
  it("OCR 이 아직 없으면 검토 대기 — 읽은 게 없으니 거절할 근거도 없다", () => {
    expect(decideVerification(null, SEP)).toMatchObject({ kind: "review" });
  });

  it("글자를 거의 못 읽으면 거절하지 않는다", () => {
    const d = decideVerification(parseReceipt("흐릿"), SEP);
    expect(d.kind).toBe("review");
  });

  it("제대로 된 이번 달 수강증은 검토 대기 — 자동 승인은 하지 않는다 (미확정 3)", () => {
    expect(decideVerification(parseReceipt(REAL), SEP_OCT)).toEqual({ kind: "review" });
  });

  it("부산 서면센터 수강증이 아니면 바로 거절", () => {
    const other = REAL.replace("YBM어학원 서면센터", "다른어학원 강남센터").replace("역전토익", "다른토익").replace("이혜영", "김강사");
    const d = decideVerification(parseReceipt(other), SEP);
    expect(d).toMatchObject({ kind: "reject", code: "academy" });
    expect((d as { reason: string }).reason).toContain("서면센터");
  });

  it("YBM 이지만 역전토익 강좌가 아니면 바로 거절", () => {
    const other = REAL.replace("역전토익 650+ 왕기초반", "스타트토익 650반").replace("담당 이혜영", "담당 김강사");
    const d = decideVerification(parseReceipt(other), SEP);
    expect(d).toMatchObject({ kind: "reject", code: "brand" });
    expect((d as { reason: string }).reason).toContain("역전토익");
  });

  it("이름이 한 글자만 다른 강좌는 **거절하지 않고 스태프에게 넘긴다** — 게이트가 일부러 너그럽다", () => {
    // `실전토익` 은 `역전토익` 과 편집거리 1 이라 게이트를 통과한다. 오인식을 감싸려고 그렇게 만든 것이라
    // 그 부작용으로 비슷한 이름은 자동 거절되지 않는다. **덜 거절하는 쪽이 안전하다** — 스태프가 보면 된다.
    const near = REAL.replace("역전토익 650+ 왕기초반", "실전토익 650반").replace("담당 이혜영", "담당 김강사");
    expect(decideVerification(parseReceipt(near), SEP_OCT)).toEqual({ kind: "review" });
  });

  it("강사명만 있어도 역전토익으로 본다 (게이트 G2)", () => {
    const byName = REAL.replace("역전토익 650+ 왕기초반", "650+ 왕기초반");
    expect(decideVerification(parseReceipt(byName), SEP_OCT)).toEqual({ kind: "review" });
  });

  it("브랜드명 한 글자가 잘못 읽혀도 거절하지 않는다 (편집거리 ≤ 1)", () => {
    const typo = REAL.replace("역전토익", "력전토익").replace("담당 이혜영", "담당 김강사");
    expect(decideVerification(parseReceipt(typo), SEP_OCT)).toEqual({ kind: "review" });
  });

  it("수강월이 지금 받는 달과 다르면 바로 거절", () => {
    const july = REAL.replace("2026-09-03 ~ 2026-10-03", "2026-07-03 ~ 2026-08-03").replace("2026-08-28", "2026-06-28");
    const d = decideVerification(parseReceipt(july), SEP_OCT);
    expect(d).toMatchObject({ kind: "reject", code: "month" });
    expect((d as { reason: string }).reason).toContain("2026년 9월 · 2026년 10월");
  });

  it("결제일이 지난달이어도 수강월이 맞으면 통과 — 8월에 결제한 9월 강좌", () => {
    expect(decideVerification(parseReceipt(REAL), SEP)).toEqual({ kind: "review" });
  });

  it("날짜를 하나도 못 읽으면 달로 거절하지 않는다", () => {
    const noDate = REAL.replace("수강기간 2026-09-03 ~ 2026-10-03", "수강기간 별도 안내").replace("결제일 2026-08-28", "결제 완료");
    expect(decideVerification(parseReceipt(noDate), SEP)).toEqual({ kind: "review" });
  });

  it("열린 기수를 모르면 달로 거절하지 않는다", () => {
    const july = REAL.replace("2026-09-03 ~ 2026-10-03", "2026-07-03 ~ 2026-08-03").replace("2026-08-28", "2026-06-28");
    expect(decideVerification(parseReceipt(july), [])).toEqual({ kind: "review" });
  });

  it("우리 수강증이 아닌 것을 달보다 먼저 본다", () => {
    const other = REAL.replace("YBM어학원 서면센터", "다른어학원").replace("역전토익", "다른토익").replace("이혜영", "김강사")
      .replace("2026-09-03 ~ 2026-10-03", "2026-07-03 ~ 2026-08-03");
    expect(decideVerification(parseReceipt(other), SEP)).toMatchObject({ code: "academy" });
  });
});

describe("수강월 — 배지 `NN월 과정` 이 1순위 (2026-09-18 실물 수강증)", () => {
  const card = (badge: string, when: string) =>
    `현재시간 ${when}\n${badge}\n역전토익 [종합반]\n650 목표\n수강생 김민수\n수강센터 부산 서면센터\n강사 이영수 .이혜영\n강의실 온라인 강의\n수강요일 [4주-09/04] 주5일 (월18회 라이브방송)\n수강시간 10:00~12:10\n수강료 264,000원`;

  it("8월 말에 캡처한 9월 과정 수강증은 거절하지 않는다 (날짜는 8월이지만 배지는 9월)", () => {
    expect(decideVerification(parseReceipt(card("09월 과정", "2026-08-28 16:19:02")), SEP)).toEqual({ kind: "review" });
  });

  it("지난달(8월) 과정 수강증은 배지로 거절하고, 몇 월 과정인지 이유에 적는다", () => {
    const d = decideVerification(parseReceipt(card("08월 과정", "2026-08-07 16:19:02")), SEP);
    expect(d).toMatchObject({ kind: "reject", code: "month" });
    expect((d as { reason: string }).reason).toContain("8월 과정");
    expect((d as { reason: string }).reason).toContain("2026년 9월");
  });

  it("배지가 없으면 예전처럼 날짜로 본다", () => {
    const d = decideVerification(parseReceipt(card("", "2026-08-07 16:19:02")), SEP);
    expect(d).toMatchObject({ kind: "reject", code: "month" });
  });
});

describe("캡처 신선도 — isCaptureFresh (자동 승인 조건)", () => {
  it("45일 안이면 신선, 넘으면 아니다", () => {
    expect(isCaptureFresh("2026-08-07", "2026-09-18")).toBe(true); // 42일
    expect(isCaptureFresh("2026-08-01", "2026-09-18")).toBe(false); // 48일
    expect(isCaptureFresh("2026-09-18", "2026-09-18")).toBe(true);
  });
  it("날짜를 못 읽었거나 며칠 미래면 판단하지 않는다(신선으로 본다)", () => {
    expect(isCaptureFresh(null, "2026-09-18")).toBe(true);
    expect(isCaptureFresh("2026-09-20", "2026-09-18")).toBe(true);
    expect(isCaptureFresh("2026-10-18", "2026-09-18")).toBe(false);
  });
});

describe("다음 달 등록 미리 받기 (2026-09-18 Alan — 지난달은 배제, 다음 달은 예비등록생)", () => {
  const card = (badge: string) =>
    `현재시간 2026-09-18 10:00:00\n${badge}\n역전토익 [종합반]\n650 목표\n수강생 김민수\n수강센터 부산 서면센터\n강사 이영수 .이혜영\n강의실 본관 701호\n수강요일 [4주-10/07] 주5일 (월18회)\n수강시간 10:00~12:10`;

  it("다음 달 반이 이미 열려 있으면(모집 중) 검토로 간다 → 승인되면 예비등록생", () => {
    expect(decideVerification(parseReceipt(card("10월 과정")), SEP_OCT)).toEqual({ kind: "review" });
  });
  it("다음 달 반이 아직 안 열렸으면 '아직 열리지 않았어요' 로 거절한다 (지난달 문구와 다르다)", () => {
    const d = decideVerification(parseReceipt(card("10월 과정")), SEP);
    expect(d).toMatchObject({ kind: "reject", code: "month" });
    expect((d as { reason: string }).reason).toContain("아직 열리지 않았어요");
  });
  it("지난달은 '지난 달' 로 거절한다", () => {
    const d = decideVerification(parseReceipt(card("08월 과정")), SEP);
    expect((d as { reason: string }).reason).toContain("지난 달");
  });
  it("12월에 열려 있을 때 1월 과정은 다음 달이다 (연도 넘김)", () => {
    const d = decideVerification(parseReceipt(card("01월 과정")), [{ year: 2026, month: 12 }]);
    expect((d as { reason: string }).reason).toContain("아직 열리지 않았어요");
  });
});
