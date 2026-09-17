import { describe, expect, it } from "vitest";
import { enrollBlocks, enrollCourses, enrollTerms, enrollTracks, resolveEnrollChoice, type EnrollSection } from "./enroll-options";

const C650 = { id: 1, name: "650+ 왕기초반", program: "score", target_score: 650 };
const C750 = { id: 2, name: "750+ 유형마스터", program: "score", target_score: 750 };
const SPARTA = { id: 3, name: "스파르타 650+ 중급속성", program: "sparta", target_score: 650 };
const SEP = { year: 2026, month: 9 };
const OCT = { year: 2026, month: 10 };

let id = 0;
const sec = (course: EnrollSection["course"], term: EnrollSection["term"], track: string, time_block: string | null): EnrollSection => ({
  id: ++id, track, time_block, term, course,
});

// 9월: 650 은 10:00~12:10 주5일(두 트랙) + 18:30~20:40 월수금만, 750 은 10:00~12:10 화목금만
// 스파르타는 10:00~13:40 두 트랙. 10월은 650 10:00~12:10 두 트랙.
const SECTIONS: EnrollSection[] = [
  sec(C650, SEP, "mwf", "10:00~12:10"),
  sec(C650, SEP, "ttf", "10:00~12:10"),
  sec(C650, SEP, "mwf", "18:30~20:40"),
  sec(C750, SEP, "ttf", "10:00~12:10"),
  sec(SPARTA, SEP, "mwf", "10:00~13:40"),
  sec(SPARTA, SEP, "ttf", "10:00~13:40"),
  sec(C650, OCT, "mwf", "10:00~12:10"),
  sec(C650, OCT, "ttf", "10:00~12:10"),
  sec(C650, SEP, "mwf", null), // 시간대 없는 반은 고를 수 없다
];

const find = (course: number, track: string, block: string, term = SEP) =>
  SECTIONS.find((s) => s.course?.id === course && s.track === track && s.time_block === block && s.term?.month === term.month)!.id;

describe("수강월", () => {
  it("열린 달을 이른 순으로", () => {
    expect(enrollTerms(SECTIONS)).toEqual([
      { key: "2026-09", label: "2026년 9월" },
      { key: "2026-10", label: "2026년 10월" },
    ]);
  });
});

describe("레벨", () => {
  it("점수보장반 먼저, 목표 점수 순", () => {
    expect(enrollCourses(SECTIONS, "2026-09").map((c) => c.name)).toEqual([
      "650+ 왕기초반",
      "750+ 유형마스터",
      "스파르타 650+ 중급속성",
    ]);
  });

  it("그 달에 없는 강좌는 안 나온다", () => {
    expect(enrollCourses(SECTIONS, "2026-10").map((c) => c.id)).toEqual([1]);
  });
});

describe("요일", () => {
  it("두 트랙이 같은 시간대에 다 있으면 주5일이 맨 앞", () => {
    expect(enrollTracks(SECTIONS, "2026-09", C650.id)).toEqual(["week5", "mwf", "ttf"]);
  });

  it("한 트랙만 열린 강좌는 그 트랙만", () => {
    expect(enrollTracks(SECTIONS, "2026-09", C750.id)).toEqual(["ttf"]);
  });
});

describe("시간대", () => {
  it("고른 요일에 실제로 열리는 것만", () => {
    expect(enrollBlocks(SECTIONS, "2026-09", C650.id, "mwf")).toEqual(["10:00~12:10", "18:30~20:40"]);
    // 저녁반은 월수금만 있어 주5일이 안 된다
    expect(enrollBlocks(SECTIONS, "2026-09", C650.id, "week5")).toEqual(["10:00~12:10"]);
    expect(enrollBlocks(SECTIONS, "2026-09", C650.id, "ttf")).toEqual(["10:00~12:10"]);
  });

  it("시간대가 없는 반은 선택지에 없다", () => {
    expect(enrollBlocks(SECTIONS, "2026-09", C650.id, "mwf")).not.toContain(null);
  });
});

describe("resolveEnrollChoice — 서버가 다시 푸는 곳", () => {
  const pick = (o: Partial<Parameters<typeof resolveEnrollChoice>[1]>) =>
    resolveEnrollChoice(SECTIONS, { term: "2026-09", courseId: C650.id, track: "mwf", timeBlock: "10:00~12:10", ...o });

  it("주3일은 반 하나", () => {
    expect(pick({})).toEqual({ ok: true, sectionIds: [find(C650.id, "mwf", "10:00~12:10")] });
  });

  it("주5일은 월수금 + 화목금 두 반", () => {
    const r = pick({ track: "week5" });
    expect(r).toEqual({
      ok: true,
      sectionIds: [find(C650.id, "mwf", "10:00~12:10"), find(C650.id, "ttf", "10:00~12:10")],
    });
  });

  it("한 트랙만 있는 시간대에 주5일을 고르면 거절 — 주3일을 주5일로 넣으면 안 된다", () => {
    const r = pick({ track: "week5", timeBlock: "18:30~20:40" });
    expect(r).toMatchObject({ ok: false });
    expect((r as { reason: string }).reason).toContain("주5일");
  });

  it("열리지 않은 조합은 거절", () => {
    expect(pick({ track: "ttf", timeBlock: "18:30~20:40" })).toMatchObject({ ok: false });
    expect(pick({ courseId: C750.id, track: "mwf" })).toMatchObject({ ok: false });
    expect(pick({ term: "2026-10", timeBlock: "18:30~20:40" })).toMatchObject({ ok: false });
  });

  it("하나라도 비면 무엇이 빠졌는지 알려 준다", () => {
    expect(resolveEnrollChoice(SECTIONS, {})).toEqual({ ok: false, reason: "수강월을 골라 주세요." });
    expect(pick({ courseId: undefined })).toEqual({ ok: false, reason: "레벨을 골라 주세요." });
    expect(pick({ track: "" })).toEqual({ ok: false, reason: "요일을 골라 주세요." });
    expect(pick({ timeBlock: "" })).toEqual({ ok: false, reason: "시간대를 골라 주세요." });
  });

  it("다른 달 반을 골라 넣어도 그 달 반만 나온다", () => {
    const r = pick({ term: "2026-10" });
    expect(r).toEqual({ ok: true, sectionIds: [find(C650.id, "mwf", "10:00~12:10", OCT)] });
  });
});
