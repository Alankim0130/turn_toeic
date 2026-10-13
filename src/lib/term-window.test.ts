import { describe, expect, it } from "vitest";
import { clampToTerm, inTerm, pickCurrentTerm, shiftDate, termWindow, type TermRow } from "./term-window";

// 운영 DB 의 실제 날짜 (2026-09-22): 9월 기수 9/3~10/3 · 10월 기수 10/6~11/1 · 11월은 아직 날짜 없음
const SEP: TermRow = { id: 8, year: 2026, month: 9, enrollment_opens_at: "2026-09-03", closes_at: "2026-10-03" };
const OCT: TermRow = { id: 40, year: 2026, month: 10, enrollment_opens_at: "2026-10-06", closes_at: "2026-11-01" };
const NOV: TermRow = { id: 41, year: 2026, month: 11, enrollment_opens_at: null, closes_at: null };
const terms = [OCT, SEP, NOV];

describe("지금 기수 — 강사가 정한 개강일~종강일", () => {
  it("개강일~종강일 안이면 그 기수 (양 끝 포함)", () => {
    expect(pickCurrentTerm(terms, "2026-09-03")?.id).toBe(8);
    expect(pickCurrentTerm(terms, "2026-09-22")?.id).toBe(8);
    expect(pickCurrentTerm(terms, "2026-10-03")?.id).toBe(8);
    expect(pickCurrentTerm(terms, "2026-10-06")?.id).toBe(40);
    expect(pickCurrentTerm(terms, "2026-11-01")?.id).toBe(40);
  });

  it("달력의 월이 아니다 — 10/1~10/3 은 아직 9월 기수", () => {
    expect(pickCurrentTerm(terms, "2026-10-01")?.id).toBe(8);
  });

  it("종강일이 지나면 다음 기수로 넘어간다", () => {
    expect(pickCurrentTerm(terms, "2026-10-04")?.id).toBe(40);
    expect(pickCurrentTerm(terms, "2026-10-05")?.id).toBe(40);
  });

  it("날짜를 안 정한 기수는 그 달 1일~말일로 대신한다 (출석은 고르지 않는다)", () => {
    expect(pickCurrentTerm(terms, "2026-11-10")?.id).toBe(41);
    expect(pickCurrentTerm(terms, "2026-11-10", { datedOnly: true })?.id).toBe(40);
    expect(termWindow(NOV)).toEqual({ opens: "2026-11-01", closes: "2026-11-30", dated: false });
    expect(termWindow({ id: 1, year: 2028, month: 2 }).closes).toBe("2028-02-29");
  });

  it("첫 기수 개강 전이면 그 기수, 모두 끝났으면 마지막 기수", () => {
    expect(pickCurrentTerm([SEP, OCT], "2026-08-20")?.id).toBe(8);
    expect(pickCurrentTerm([SEP, OCT], "2026-12-01")?.id).toBe(40);
    expect(pickCurrentTerm([], "2026-12-01")).toBeNull();
  });

  it("다음 달 개강일을 이번 달 안으로 당겨 잡아 겹치면 — 이번 달 안은 이번 달 기수 (수업이 이어지는 달)", () => {
    const early: TermRow = { ...OCT, enrollment_opens_at: "2026-09-28" };
    expect(pickCurrentTerm([SEP, early], "2026-09-29")?.id).toBe(8);
    expect(pickCurrentTerm([SEP, early], "2026-10-04")?.id).toBe(40);
  });

  it("지난 달 종강일을 다음 달 개강일 뒤로 잡아 겹치면 — 다음 달에 들어선 날은 다음 달 기수 (2026-10-13 월 넘김 리허설)", () => {
    // 10월 마지막 수업 10/30 · 녹화본을 더 보게 종강 11/6 · 11월 개강 11/4
    const lateOct: TermRow = { ...OCT, closes_at: "2026-11-06" };
    const nov: TermRow = { id: 41, year: 2026, month: 11, enrollment_opens_at: "2026-11-04", closes_at: "2026-12-03" };
    expect(pickCurrentTerm([lateOct, nov], "2026-11-03")?.id).toBe(40);
    expect(pickCurrentTerm([lateOct, nov], "2026-11-04")?.id).toBe(41);
    expect(pickCurrentTerm([lateOct, nov], "2026-11-06")?.id).toBe(41);
    expect(pickCurrentTerm([lateOct, nov], "2026-11-07")?.id).toBe(41);
    expect(pickCurrentTerm([nov, lateOct], "2026-11-05", { datedOnly: true })?.id).toBe(41);
    // 그 달 기수가 겹친 둘 중에 없으면 예전처럼 먼저 끝나는 쪽
    const sepLong: TermRow = { ...SEP, closes_at: "2026-11-10" };
    expect(pickCurrentTerm([sepLong, nov], "2026-11-05")?.id).toBe(41);
    expect(pickCurrentTerm([sepLong, { ...OCT, closes_at: "2026-11-20" }], "2026-11-05")?.id).toBe(8);
    // 날짜를 아직 안 찍은 그 달 기수(1일~말일로 대신)는 날짜를 정한 지난 기수를 이기지 않는다
    expect(pickCurrentTerm([OCT, NOV], "2026-11-01")?.id).toBe(40);
  });
});

describe("기간 안으로", () => {
  it("밖이면 가까운 끝으로", () => {
    expect(clampToTerm("2026-08-30", SEP)).toBe("2026-09-03");
    expect(clampToTerm("2026-10-10", SEP)).toBe("2026-10-03");
    expect(clampToTerm("2026-09-15", SEP)).toBe("2026-09-15");
  });

  it("기간 판정은 양 끝 포함, 날짜 없는 기수는 아니다", () => {
    expect(inTerm("2026-09-03", SEP)).toBe(true);
    expect(inTerm("2026-10-03", SEP)).toBe(true);
    expect(inTerm("2026-10-04", SEP)).toBe(false);
    expect(inTerm("2026-09-02", SEP)).toBe(false);
    expect(inTerm("2026-11-10", NOV)).toBe(false);
  });

  it("하루 앞뒤는 한국 날짜로 (달·해 넘김)", () => {
    expect(shiftDate("2026-09-30", 1)).toBe("2026-10-01");
    expect(shiftDate("2026-10-01", -1)).toBe("2026-09-30");
    expect(shiftDate("2026-12-31", 1)).toBe("2027-01-01");
  });
});
