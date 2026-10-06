import { describe, expect, it } from "vitest";
import { missingClassOf, type CourseName, type OpenClass } from "./missing-class";

/** 2026-10-06 — 첫 2주완성 수강증이 왔는데 10월 2주완성 반을 안 열어 승인 화면에 고를 칸이 없었다 */
const oct = { year: 2026, month: 10 };
const score850 = { program: "score", target_score: 850 };
const tw850 = { program: "twoweek", target_score: 850 };
const open850: OpenClass[] = [
  { track: "mwf", time_block: "12:30~15:00", term: oct, course: score850 },
  { track: "ttf", time_block: "12:30~15:00", term: oct, course: score850 },
  { track: "mwf", time_block: "12:30~13:40", term: oct, course: score850 },
  { track: "ttf", time_block: "12:30~13:40", term: oct, course: score850 },
];
const courses: CourseName[] = [
  { name: "850+ 문제마스터", program: "score", target_score: 850 },
  { name: "850+ 2주완성", program: "twoweek", target_score: 850 },
  { name: "650+ 왕기초반", program: "score", target_score: 650 },
];
/** 운영 수강증의 판독 (저장된 jsonb 모양) */
const twoWeek = { level: 850, program: "twoweek", weekly: 5, tracks: ["mwf", "ttf"], time: { timeBlock: "12:30~15:00" }, courseMonth: null, startMonth: 10 };
const TODAY = "2026-10-06";

describe("missingClassOf — 수강증에 적힌 반이 열린 반 목록에 없나", () => {
  it("10월 2주완성 반을 안 열었으면 그 반을 적고 10월 새 반 개설로 보낸다", () => {
    expect(missingClassOf(twoWeek, open850, courses, TODAY)).toEqual({ label: "10월 850+ 2주완성 · 주5일 · 12:30~15:00", term: "2026-10" });
  });

  it("월수금 · 화목금이 다 열려 있으면 말하지 않는다", () => {
    const opened = [...open850, { track: "mwf", time_block: "12:30~15:00", term: oct, course: tw850 }, { track: "ttf", time_block: "12:30~15:00", term: oct, course: tw850 }];
    expect(missingClassOf(twoWeek, opened, courses, TODAY)).toBeNull();
  });

  it("주5일인데 한 트랙만 열려 있으면 없는 트랙만 적는다", () => {
    const half = [...open850, { track: "mwf", time_block: "12:30~15:00", term: oct, course: tw850 }];
    expect(missingClassOf(twoWeek, half, courses, TODAY)?.label).toBe("10월 850+ 2주완성 · 화목금 · 12:30~15:00");
  });

  it("주3일이면 읽은 트랙 하나만 본다", () => {
    const mwfOnly = { ...twoWeek, weekly: 3, tracks: ["mwf"] };
    const withMwf = [...open850, { track: "mwf", time_block: "12:30~15:00", term: oct, course: tw850 }];
    expect(missingClassOf(mwfOnly, withMwf, courses, TODAY)).toBeNull();
    expect(missingClassOf(mwfOnly, open850, courses, TODAY)?.label).toBe("10월 850+ 2주완성 · 월수금 · 12:30~15:00");
  });

  it("시간이 다르면(60분 수강증에 120분 반만 열림) 그 시간 반이 없다고 적는다 — 시간은 정확히 맞아야 같은 반이다", () => {
    const hour = { level: 850, program: "score", weekly: 3, tracks: ["ttf"], time: { timeBlock: "13:50~15:00" }, courseMonth: 10 };
    expect(missingClassOf(hour, open850, courses, TODAY)?.label).toBe("10월 850+ 문제마스터 · 화목금 · 13:50~15:00");
    expect(missingClassOf({ ...hour, time: { timeBlock: "12:30~13:40" } }, open850, courses, TODAY)).toBeNull();
  });

  it("수강월을 읽었으면 그 달만 본다 — 10월 반이 열려 있어도 11월 수강증의 반은 없다", () => {
    const nov = { ...twoWeek, program: "score", startMonth: 11 };
    expect(missingClassOf(nov, open850, courses, TODAY)).toEqual({ label: "11월 850+ 문제마스터 · 주5일 · 12:30~15:00", term: "2026-11" });
  });

  it("수강월을 못 읽었으면 어느 달이든 열린 반이 있으면 된다 — 새 반 개설은 이번 달로", () => {
    const noMonth = { ...twoWeek, program: "score", startMonth: null };
    expect(missingClassOf(noMonth, open850, courses, TODAY)).toBeNull();
    expect(missingClassOf({ ...twoWeek, startMonth: null }, open850, courses, TODAY)).toEqual({ label: "850+ 2주완성 · 주5일 · 12:30~15:00", term: null });
  });

  it("주3일/주5일을 못 읽었으면 트랙은 따지지 않는다 — 그 시간 반이 하나라도 열려 있으면 된다", () => {
    const noWeekly = { level: 850, program: "score", weekly: null, tracks: [], time: { timeBlock: "12:30~15:00" }, courseMonth: 10 };
    expect(missingClassOf(noWeekly, open850, courses, TODAY)).toBeNull();
    expect(missingClassOf({ ...noWeekly, program: "twoweek" }, open850, courses, TODAY)?.label).toBe("10월 850+ 2주완성 · 12:30~15:00");
  });

  it("레벨 · 시간을 못 읽었으면 말하지 않는다 — 근거 없이 '안 열렸다' 고 하지 않는다", () => {
    expect(missingClassOf(null, open850, courses, TODAY)).toBeNull();
    expect(missingClassOf({ ...twoWeek, level: null }, open850, courses, TODAY)).toBeNull();
    expect(missingClassOf({ ...twoWeek, time: null }, open850, courses, TODAY)).toBeNull();
  });

  it("과정 칸이 없는 예전 판독은 점수보장반으로 본다", () => {
    const old = { level: 650, weekly: 5, tracks: ["mwf", "ttf"], time: { timeBlock: "10:00~12:10" }, courseMonth: 10 };
    expect(missingClassOf(old, open850, courses, TODAY)?.label).toBe("10월 650+ 왕기초반 · 주5일 · 10:00~12:10");
  });

  it("강좌 목록에 없으면 레벨 + 과정 이름으로 적는다", () => {
    expect(missingClassOf({ ...twoWeek, level: 750 }, open850, courses, TODAY)?.label).toBe("10월 750 2주완성반 · 주5일 · 12:30~15:00");
  });

  it("기수의 연도 — 그 달 반이 열려 있으면 그 연도, 아니면 오늘에서 가까운 해", () => {
    const jan = { ...twoWeek, program: "score", startMonth: 1 };
    expect(missingClassOf(jan, open850, courses, "2026-12-20")?.term).toBe("2027-01");
    expect(missingClassOf({ ...jan, startMonth: 12 }, [], courses, "2027-01-03")?.term).toBe("2026-12");
    const openJan = [{ track: "mwf", time_block: "10:00~11:00", term: { year: 2027, month: 1 }, course: { program: "score", target_score: 650 } }];
    expect(missingClassOf(jan, openJan, courses, "2026-10-06")?.term).toBe("2027-01");
  });
});
