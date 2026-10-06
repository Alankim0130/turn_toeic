import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parseReceipt, receiptStudentName } from "./receipt";
import { matchSections, twoWeekSpots } from "./match-sections";
import { autoApproveBlockers } from "./auto-approve";
import type { EnrollSection } from "./enroll-options";

/**
 * 첫 실물 2주완성 수강증 (2026-10-06 Alan — "850 2주 수강증 올라왔어").
 * 운영과 같은 길(`readReceiptText` + 2주완성 자리의 멈춤 기준)로 읽은 **OCR 원문 그대로**이고 이름만 가짜(`김민수`)로 바꿨다 —
 * 실물 그림은 실명이라 저장소에 넣지 않는다. 변형 셋(폭 700 흑백 · 흰 글자만 · 원본 흑백)을 이어 붙인 것이고,
 * 배지 `10월 과정` 은 어느 변형도 못 읽어(노랑 위 검정 글자) 수강월은 수강요일 줄의 개강일 `[2주-10/06]` 이 정한다.
 *
 * 실물 표기: `역전토익 [종합반]` · `850 목표` · 강의실 `본관 301호` · 수강요일 `[2주-10/06] 주5일 (월9회)` · 수강시간 `12:30~15:00` · 수강료 199,900원.
 * 2026-10-05 에 Alan 이 알려 준 대로 기간 숫자만 `4주` → `2주` 이고, 주5일인데 회차가 `월9회`(한 달 과정 주3일의 회차)다.
 */
const TEXT = fs.readFileSync(path.join(__dirname, "__fixtures__", "receipt-twoweek-ocr.txt"), "utf8");

const c850 = { id: 1, name: "850+ 문제마스터", program: "score", target_score: 850 };
const t850 = { id: 2, name: "850+ 2주완성", program: "twoweek", target_score: 850 };
const oct = { year: 2026, month: 10 };
const nov = { year: 2026, month: 11 };
/** 10월 850 점수보장반 — 140분 묶음과 그 안의 70분 둘, 두 트랙 */
const score850: EnrollSection[] = [
  { id: 11, track: "mwf", time_block: "12:30~15:00", term: oct, course: c850 },
  { id: 12, track: "ttf", time_block: "12:30~15:00", term: oct, course: c850 },
  { id: 13, track: "mwf", time_block: "12:30~13:40", term: oct, course: c850 },
  { id: 14, track: "ttf", time_block: "12:30~13:40", term: oct, course: c850 },
  { id: 15, track: "mwf", time_block: "13:50~15:00", term: oct, course: c850 },
  { id: 16, track: "ttf", time_block: "13:50~15:00", term: oct, course: c850 },
];
const twoWeekOct: EnrollSection[] = [
  { id: 21, track: "mwf", time_block: "12:30~15:00", term: oct, course: t850 },
  { id: 22, track: "ttf", time_block: "12:30~15:00", term: oct, course: t850 },
];
/** 그 달 시간표의 2주완성 줄 — 반을 아직 안 열었어도 2주완성이 열리는 자리다 */
const timetable = [{ level: 850, start_time: "12:30:00", end_time: "15:00:00" }];

describe("첫 실물 2주완성 수강증 (2026-10-06) — 850 · 주5일 · 현장", () => {
  const p = parseReceipt(TEXT);

  it("판정 키가 전부 맞게 읽힌다 — 2주완성 · 기간 2 · 주5일(월9회) 두 트랙 · 12:30~15:00 · 현장", () => {
    expect(p.gates).toEqual({ academy: true, brand: true });
    expect(p.brandExact).toBe(true);
    expect(p.card).toBe(true);
    // 둘째 변형은 `레벨 8850+` 로 읽었지만 카드 칸 숫자가 정한다
    expect(p.level).toBe(850);
    expect(p.program).toBe("twoweek");
    expect(p.weeks).toBe(2);
    expect(p.weekly).toBe(5);
    expect(p.tracks).toEqual(["mwf", "ttf"]);
    expect(p.time?.timeBlock).toBe("12:30~15:00");
    expect(p.mode).toBe("onsite");
    expect(p.modeEvidence).toBe("room");
    expect(p.capturedAt).toBe("2026-10-06T10:02:58");
    expect(p.warnings).toEqual([]);
    expect(receiptStudentName(TEXT)).toBe("김민수");
  });

  it("수강월은 배지를 못 읽어도 개강일 `[2주-10/06]` 로 10월이다", () => {
    expect(p.courseMonth).toBeNull();
    expect(p.startMonth).toBe(10);
  });

  it("그 달 2주완성 반이 아직 없으면 대조가 멈춘다 — 한 달 850 반에 붙지 않는다 (2026-10-06 운영에서 실제로 이랬다)", () => {
    const spots = twoWeekSpots(score850, timetable);
    expect(matchSections(p, score850, { twoWeekSpots: spots }).result).toEqual({ kind: "none", reason: "850 2주완성 12:30~15:00 에 열린 반이 없어요" });
  });

  it("2주완성 반(월수금 · 화목금)이 열려 있으면 그 둘에 붙고, 자동 승인을 막을 것이 없다", () => {
    const sections = [...score850, ...twoWeekOct];
    const m = matchSections(p, sections, { twoWeekSpots: twoWeekSpots(sections, timetable) });
    expect(m.result).toEqual({ kind: "match", sectionIds: [21, 22], term: "2026-10" });
    expect(
      autoApproveBlockers({
        parsed: p,
        nameMatches: true,
        flags: { duplicateImage: false, staleCapture: false, sameCapture: false, paletteOff: false, alreadyEnrolled: [], decidedBefore: null },
        matched: true,
        periodUnclear: m.result.kind === "match" && !!m.result.periodUnclear,
      }),
    ).toEqual([]);
  });

  it("다음 달 2주완성 반이 함께 열려 있어도 개강일 달(10월)로 고른다", () => {
    const sections = [
      ...score850,
      ...twoWeekOct,
      { id: 31, track: "mwf", time_block: "12:30~15:00", term: nov, course: t850 },
      { id: 32, track: "ttf", time_block: "12:30~15:00", term: nov, course: t850 },
    ];
    expect(matchSections(p, sections, { twoWeekSpots: twoWeekSpots(sections, timetable) }).result).toEqual({ kind: "match", sectionIds: [21, 22], term: "2026-10" });
  });
});
