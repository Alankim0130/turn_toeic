import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parseCourseMonth, parseReceipt, readEnoughFor, receiptHasName, receiptStudentName } from "./receipt";
import { matchSections } from "./match-sections";
import { autoApproveBlockers } from "./auto-approve";
import type { EnrollSection } from "./enroll-options";

/**
 * **PC · 태블릿으로 캡처한 실물 수강증** (2026-10-06 Alan — "테블릿이나 pc로 올린학생들은 이런형태의 수강증이야. 이것들도 등업으로 인정해줘. 검토로 보내지말고").
 * 운영 OCR 이 지금 읽는 원문(카드를 잘라 키운 변형 `card_h800` + 배지 변형 `card_badge` 를 이어 붙인 것) 그대로이고 **이름만 가짜(`김민수`)로 바꿨다**.
 * 실물 그림은 이름을 가려 `receipt-pc-card.png` 로 넣었다 (`ocr.integration.test.ts`).
 *
 * 실물 표기: 카드만 잘린 524×554 · `10월 과정` · `역전토익 [종합반]` · `750 목표` · 레벨 `750+` · 강의실 `본관 301호` ·
 * 수강요일 `[4주-10/06] 주5일 월수금(현강)+화목금(인강) (월18` / `회)` (줄이 갈린다) · 수강시간 `18:30~20:40` — 저녁 750 주5일 120분 현장.
 * 휴대폰 앱과 같은 카드인데 가로로 넓어 글자가 작다. 예전 OCR(원본 크기 흑백)은 `수강시간` 을 `수강신관`, `[4주-10/06]` 을 `나즈10101` 로 읽고
 * 배지를 못 읽어 카드 칸 · 수강월이 비었다 — 강사 검토로 갔다.
 */
const TEXT = fs.readFileSync(path.join(__dirname, "__fixtures__", "receipt-pc-ocr.txt"), "utf8");

/** 예전 OCR 이 같은 수강증에서 읽은 원문 (원본 크기 흑백 — 흰 글자만 변형은 비어 있었다). 이름만 가짜로 */
const BEFORE = `현재시 2026-10-06 19:01:58
역전토익 [종합반]
750 목표
수강생 _ 김민수
수강센터 부산 서면센터
강사 _ 이영수-이혜영
레벨   750+
강의실 본관 301호
20 나즈10101주5위첨수금(829+화목3인(216
수강신관 18:30~20:40.
수갈료. 266,000원
`;

const c750 = { id: 3, name: "750+ 유형마스터", program: "score", target_score: 750 };
const c650 = { id: 2, name: "650+ 왕기초반", program: "score", target_score: 650 };
const oct = { year: 2026, month: 10 };
const nov = { year: 2026, month: 11 };
/** 10월 · 11월 반이 함께 열린 때 (다음 달 반을 연 뒤) — 수강월을 못 읽으면 어느 달인지 못 고른다 */
const sections: EnrollSection[] = [
  { id: 61, track: "mwf", time_block: "18:30~20:40", term: oct, course: c750 },
  { id: 62, track: "ttf", time_block: "18:30~20:40", term: oct, course: c750 },
  { id: 63, track: "mwf", time_block: "18:30~19:30", term: oct, course: c750 },
  { id: 64, track: "ttf", time_block: "18:30~19:30", term: oct, course: c750 },
  { id: 65, track: "mwf", time_block: "18:30~20:40", term: oct, course: c650 },
  { id: 66, track: "ttf", time_block: "18:30~20:40", term: oct, course: c650 },
  { id: 71, track: "mwf", time_block: "18:30~20:40", term: nov, course: c750 },
  { id: 72, track: "ttf", time_block: "18:30~20:40", term: nov, course: c750 },
];
const quiet = { duplicateImage: false, staleCapture: false, sameCapture: false, alreadyEnrolled: [], decidedBefore: null };

describe("PC · 태블릿 실물 수강증 (2026-10-06) — 750 · 주5일 · 저녁 120분 · 현장", () => {
  const p = parseReceipt(TEXT);

  it("판정 키가 전부 읽힌다 — 카드 칸 · 역전토익 · 레벨 · 주5일 · 수강시간 칸 · 강의실 호실 · 배지 · 개강일 달 · 캡처 시각", () => {
    expect(p.gates).toEqual({ academy: true, brand: true });
    expect(p.brandExact).toBe(true);
    expect(p.card).toBe(true);
    expect(p.levels).toEqual([750]);
    expect(p.program).toBe("score");
    expect(p.weeks).toBe(4);
    // `(월18` / `회)` 로 갈려 회차는 못 읽지만 `주5일` 이 있다
    expect(p.weekly).toBe(5);
    expect(p.tracks).toEqual(["mwf", "ttf"]);
    expect(p.time?.timeBlock).toBe("18:30~20:40");
    expect(p.mode).toBe("onsite");
    expect(p.modeEvidence).toBe("room");
    expect(p.courseMonth).toBe(10);
    expect(p.startMonth).toBe(10);
    expect(p.capturedAt).toBe("2026-10-06T19:01:58");
    expect(p.warnings).toEqual([]);
  });

  it("이름(G3)은 `수강생` 칸 그대로", () => {
    expect(receiptHasName(TEXT, "김민수")).toBe(true);
    expect(receiptStudentName(TEXT)).toBe("김민수");
    expect(receiptHasName(TEXT, "김민지")).toBe(false);
  });

  it("두 변형만으로 멈춤 기준을 채운다 — 운영은 여기서 더 읽지 않는다", () => {
    expect(readEnoughFor("김민수")(TEXT)).toBe(true);
  });

  it("10월 · 11월 반이 함께 열려 있어도 10월 저녁 750 주5일 두 반에 붙고, 자동 승인을 막을 것이 없다", () => {
    const m = matchSections(p, sections);
    expect(m.result).toEqual({ kind: "match", sectionIds: [61, 62], term: "2026-10" });
    expect(autoApproveBlockers({ parsed: p, nameMatches: receiptHasName(TEXT, "김민수"), flags: quiet, matched: true })).toEqual([]);
  });

  it("예전 원문은 수강월을 못 읽어 두 달 사이에서 반을 못 골랐다 — 그래서 검토로 갔다", () => {
    const old = parseReceipt(BEFORE);
    expect(old.courseMonth).toBeNull();
    expect(old.startMonth).toBeNull();
    expect(matchSections(old, sections).result.kind).toBe("ambiguous");
  });

  it("예전 원문의 잡음이 뒤에 붙어도(변형을 다 읽은 경우) 판정이 흔들리지 않는다", () => {
    const both = parseReceipt(`${TEXT}\n${BEFORE}`);
    expect(both.levels).toEqual([750]);
    expect(both.weekly).toBe(5);
    expect(both.weeks).toBe(4);
    expect(both.time?.timeBlock).toBe("18:30~20:40");
    expect(both.courseMonth).toBe(10);
    expect(matchSections(both, sections).result).toEqual({ kind: "match", sectionIds: [61, 62], term: "2026-10" });
  });
});

describe("PC 화면 글꼴의 오인식 — 좁게만 봐준다", () => {
  it("배지 `월` 이 `뭘` 로 읽혀도 수강월이다 — 숫자 뒤 다른 글자(`3개 과정`)는 아니다", () => {
    expect(parseCourseMonth("10뭘 과정")).toBe(10);
    expect(parseCourseMonth("09월 과정")).toBe(9);
    expect(parseCourseMonth("3개 과정")).toBeNull();
    expect(parseCourseMonth("10될 과정")).toBeNull();
  });

  it("`수강신관` 은 수강시간 칸 라벨이다 — 메뉴의 `수강신청` 은 아니다", () => {
    const card = (timeLabel: string) =>
      `현재시간 2026-10-06 19:01:58\n10월 과정\n역전토익 [종합반]\n750 목표\n수강생 김민수\n수강센터 부산 서면센터\n강의실 본관 301호\n${timeLabel} 18:30~20:40\n9:00~10:00`;
    expect(parseReceipt(card("수강신관")).card).toBe(true);
    expect(parseReceipt(card("수강신관")).time?.timeBlock).toBe("18:30~20:40");
    expect(parseReceipt(card("수강신청")).card).toBe(false);
    // 라벨을 못 읽었고 시간이 둘이면 어느 것인지 모른다
    expect(parseReceipt(card("수강신청")).time).toBeNull();
  });
});
