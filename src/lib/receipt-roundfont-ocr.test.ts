import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { dropFinals, parseReceipt, readEnoughFor, receiptHasName, receiptStudentName } from "./receipt";
import { matchSections } from "./match-sections";
import { autoApproveBlockers } from "./auto-approve";
import type { EnrollSection } from "./enroll-options";

/**
 * 휴대폰 글꼴을 둥근 글꼴로 바꾼 아이폰 화면의 실물 수강증 (2026-10-06 Alan — "학생들이 본인 휴대폰 글꼴을 변경한 상태로 올리는 경우가 있는데,
 * 이런것들 다 인정해주면 좋겠어"). 운영 OCR 원문(변형 셋을 이어 붙인 것) 그대로이고 **이름만 가짜(`김민수`)로 바꿨다** — 실물 그림은 실명이라 넣지 않는다.
 *
 * 실물 표기: `역전토익 [종합반]` · `750 목표` · 레벨 `750+` · 강의실 `본관 301호` · 수강요일 `[4주-10/06] 주5일 (월18회)` · 수강시간 `10:00~12:10`.
 * 둥근 글꼴은 어느 전처리로도 엔진이 못 읽어서 늘 같은 꼴로 비틀린다 — `강` → `남`·`감`, `간` → `반`, 받침이 빠지고(`여저토익`), `7` 이 `1`·`]`·`디` 가 된다.
 * 예전 판독기는 이 수강증을 카드 칸 · 역전토익 글자 · 레벨 · 강의실을 모두 못 읽은 것으로 보아 검토 대기로 보냈다.
 */
const TEXT = fs.readFileSync(path.join(__dirname, "__fixtures__", "receipt-roundfont-ocr.txt"), "utf8");

const c750 = { id: 3, name: "750+ 유형마스터", program: "score", target_score: 750 };
const c650 = { id: 2, name: "650+ 왕기초반", program: "score", target_score: 650 };
const oct = { year: 2026, month: 10 };
/** 10월 750 오전 — 120분 묶음과 그 안의 60분 둘, 두 트랙 (+ 같은 시간의 650 — 레벨이 흔들리면 여기 붙는다) */
const sections: EnrollSection[] = [
  { id: 41, track: "mwf", time_block: "10:00~12:10", term: oct, course: c750 },
  { id: 42, track: "ttf", time_block: "10:00~12:10", term: oct, course: c750 },
  { id: 43, track: "mwf", time_block: "10:00~11:00", term: oct, course: c750 },
  { id: 44, track: "ttf", time_block: "10:00~11:00", term: oct, course: c750 },
  { id: 45, track: "mwf", time_block: "11:10~12:10", term: oct, course: c750 },
  { id: 46, track: "ttf", time_block: "11:10~12:10", term: oct, course: c750 },
  { id: 51, track: "mwf", time_block: "10:00~12:10", term: oct, course: c650 },
  { id: 52, track: "ttf", time_block: "10:00~12:10", term: oct, course: c650 },
];
const quiet = { duplicateImage: false, staleCapture: false, sameCapture: false, alreadyEnrolled: [], decidedBefore: null };

describe("둥근 글꼴 실물 수강증 (2026-10-06) — 750 · 주5일 · 120분 · 현장", () => {
  const p = parseReceipt(TEXT);

  it("판정 키가 전부 맞게 읽힌다 — 카드 칸(수남생 · 수남센터 · 수남시반) · 역전토익(여저토익) · 레벨 750(`\"150 목표` · `레벨 디50+`) · 강의실 호실", () => {
    expect(p.gates).toEqual({ academy: true, brand: true });
    expect(p.brandExact).toBe(true);
    expect(p.card).toBe(true);
    expect(p.levels).toEqual([750]);
    expect(p.level).toBe(750);
    expect(p.program).toBe("score");
    expect(p.weeks).toBe(4);
    expect(p.weekly).toBe(5);
    expect(p.tracks).toEqual(["mwf", "ttf"]);
    expect(p.time?.timeBlock).toBe("10:00~12:10");
    expect(p.mode).toBe("onsite");
    expect(p.modeEvidence).toBe("room");
    // 수강월은 배지 `10월 과정` 이 정한다 — 수강요일 줄은 `]` 가 `1` 로 읽혀(`10/061주5일`) 개강일 꼴이 아니다
    expect(p.courseMonth).toBe(10);
    expect(p.startMonth).toBeNull();
    expect(p.capturedAt).toBe("2026-10-06T11:08:48");
    // 7 을 짐작으로 읽은 것은 승인 화면에 남긴다 — 그 밖의 경고는 없다
    expect(p.warnings).toEqual(["레벨 칸의 7 이 글꼴 때문에 비틀려 읽혀(150 꼴) 750 으로 봤어요"]);
  });

  it("이름(G3)은 봐주지 않아도 그대로 읽힌다", () => {
    expect(receiptHasName(TEXT, "김민수")).toBe(true);
    expect(receiptStudentName(TEXT)).toBe("김민수");
    expect(receiptHasName(TEXT, "김민지")).toBe(false);
  });

  it("10월 750 주5일 120분 두 반에 붙고, 자동 승인을 막을 것이 없다", () => {
    const m = matchSections(p, sections);
    expect(m.result).toEqual({ kind: "match", sectionIds: [41, 42], term: "2026-10" });
    expect(autoApproveBlockers({ parsed: p, nameMatches: receiptHasName(TEXT, "김민수"), flags: quiet, matched: true })).toEqual([]);
  });

  it("첫 변형만으로도 멈춤 기준을 채운다 — 운영은 여기서 더 읽지 않는다", () => {
    const first = TEXT.split("\n\n11:08")[0];
    expect(readEnoughFor("김민수")(first)).toBe(true);
    expect(parseReceipt(first).level).toBe(750);
  });
});

/** 다른 수강증 테스트와 같은 꼴의 짧은 원문 — 봐주는 꼴이 얼마나 좁은지 본다 */
const card = (lines: string) => `현재시간 2026-10-06 11:08:48\n10월 과정\n역전토익 [종합반]\n수강생 김민수\n수강센터 부산 서면센터\n강사 이영수ㆍ이혜영\n${lines}`;

describe("둥근 글꼴 봐주기는 판정 칸 · 브랜드 낱말 · 레벨 7 만 — 좁게", () => {
  it("받침만 다른 꼴은 같은 낱말 — `여저토익` 은 역전토익, `실전토익` 은 아니다", () => {
    expect(dropFinals("역전토익")).toBe(dropFinals("여저토익"));
    expect(dropFinals("역전토익")).not.toBe(dropFinals("실전토익"));
    expect(parseReceipt(card("수강시간 10:00~12:10").replace("역전토익", "여저토익")).brandExact).toBe(true);
    // 강사명으로 게이트(G2)는 지나도, 다른 과정 이름은 `역전토익` 글자로 보지 않는다 (firsttoeic 사고 3)
    expect(parseReceipt(card("수강시간 10:00~12:10").replace("역전토익", "실전토익")).brandExact).toBe(false);
  });

  it("7 의 오인식은 두 칸(제목 줄 · 레벨 칸) 모두일 때만 750 — 한 칸만이면 레벨을 정하지 않는다", () => {
    const both = parseReceipt(card('"150 목표\n레벨 디50+\n수강시간 10:00~12:10'));
    expect(both.level).toBe(750);
    const titleOnly = parseReceipt(card('"150 목표\n수강시간 10:00~12:10'));
    expect(titleOnly.level).toBeNull();
    expect(titleOnly.levels).toEqual([]);
    const fieldOnly = parseReceipt(card("레벨 ]50+\n수강시간 10:00~12:10"));
    expect(fieldOnly.level).toBeNull();
  });

  it("칸에서 제대로 읽은 레벨이 있으면 그것이 먼저 — 7 짐작은 하지 않는다", () => {
    const p = parseReceipt(card('650 목표\n레벨 디50+\n수강시간 10:00~11:00'));
    expect(p.levels).toEqual([650]);
    expect(p.warnings.some((w) => w.includes("750 으로 봤어요"))).toBe(false);
  });

  it("강의실 라벨은 `감의실` 까지 — `회의실` 같은 다른 낱말은 칸이 아니다", () => {
    expect(parseReceipt(card("감의실 본관 301호\n수강시간 10:00~12:10")).modeEvidence).toBe("room");
    expect(parseReceipt(card("감의실 온라인 강의\n수강시간 10:00~12:10")).modeEvidence).toBe("online");
    expect(parseReceipt(card("회의실 본관 301호\n수강시간 10:00~12:10")).modeEvidence).toBeNull();
  });

  it("수강시간 칸은 `수남시반` 까지 — 다른 시간이 함께 읽혀도 칸의 값을 쓴다", () => {
    const p = parseReceipt(card("수남시반. - 10:00~11:00\n이벤트 18:30~20:40"));
    expect(p.card).toBe(true);
    expect(p.time?.timeBlock).toBe("10:00~11:00");
  });
});
