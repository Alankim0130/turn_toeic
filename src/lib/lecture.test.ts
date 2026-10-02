import { describe, expect, it } from "vitest";
import { ddayLabel, kstDateOf, lectureCameo, lectureOpensAt, lectureState, shiftDate, signupDday } from "./lecture";

const base = { id: 1, date: "2026-10-17", signup: true, capacity: 140, signup_opens_at: null, applied_count: 0 };
const at = (kst: string) => new Date(`${kst}+09:00`).getTime();

describe("lectureOpensAt — 신청 시작 기본값은 특강 7일 전 자정(KST) (2026-10-02 Alan)", () => {
  it("비어 있으면 특강 7일 전 00:00 KST", () => {
    expect(lectureOpensAt(base)).toBe(new Date("2026-10-10T00:00:00+09:00").toISOString());
  });
  it("강사가 따로 적은 신청 시작이 있으면 그 값", () => {
    expect(lectureOpensAt({ ...base, signup_opens_at: "2026-10-01T03:00:00.000Z" })).toBe("2026-10-01T03:00:00.000Z");
  });
  it("달을 넘어가도 날짜 계산이 맞는다", () => {
    expect(shiftDate("2026-10-03", -7)).toBe("2026-09-26");
    expect(shiftDate("2026-03-02", -7)).toBe("2026-02-23");
    expect(kstDateOf("2026-10-09T15:00:00.000Z")).toBe("2026-10-10");
  });
});

describe("lectureState — 7일 전부터 당일까지", () => {
  it("8일 전에는 아직 신청 전, 7일 전 자정부터 신청 받는 중", () => {
    expect(lectureState(base, "2026-10-09", at("2026-10-09T23:59:59"))).toBe("not_open");
    expect(lectureState(base, "2026-10-10", at("2026-10-10T00:00:00"))).toBe("open");
    expect(lectureState(base, "2026-10-17", at("2026-10-17T12:00:00"))).toBe("open");
    expect(lectureState(base, "2026-10-18", at("2026-10-18T00:00:00"))).toBe("closed");
  });
  it("정원이 차면 정원 마감, 신청을 안 받으면 none", () => {
    expect(lectureState({ ...base, applied_count: 140 }, "2026-10-12", at("2026-10-12T10:00:00"))).toBe("full");
    expect(lectureState({ ...base, signup: false }, "2026-10-12", at("2026-10-12T10:00:00"))).toBe("none");
  });
});

describe("signupDday — 잠긴 특강의 D-day", () => {
  it("10/2 에 10/17 특강(10/10 오픈)은 D-8, 10/9 에는 D-1, 10/10 00:00 부터는 열려서 null", () => {
    expect(signupDday(base, "2026-10-02", at("2026-10-02T15:00:00"))).toBe(8);
    expect(signupDday(base, "2026-10-09", at("2026-10-09T23:00:00"))).toBe(1);
    expect(signupDday(base, "2026-10-10", at("2026-10-10T00:00:00"))).toBeNull();
  });
  it("오늘 낮에 열리는 특강(강사가 시각을 적음)은 D-DAY", () => {
    const l = { ...base, signup_opens_at: new Date("2026-10-02T18:00:00+09:00").toISOString() };
    expect(signupDday(l, "2026-10-02", at("2026-10-02T09:00:00"))).toBe(0);
    expect(ddayLabel(0)).toBe("D-DAY");
    expect(ddayLabel(3)).toBe("D-3");
  });
});

describe("lectureCameo — 강사와 종류에 맞는 캐리커처", () => {
  it("이혜영 LC특강은 헤드폰 노트 컷, 모의고사만이면 윙크 가리키기", () => {
    expect(lectureCameo("이혜영", ["lc", "mock2"])?.pose).toBe("notebook");
    expect(lectureCameo("이혜영", ["mock1"])?.pose).toBe("point");
  });
  it("이영수 RC특강은 태블릿 컷, 모의고사만이면 엄지척", () => {
    expect(lectureCameo("이영수", ["rc", "mock1"])?.pose).toBe("tablet");
    expect(lectureCameo("이영수", ["mock2"])?.pose).toBe("thumbsup");
  });
  it("강사가 없거나 두 분이 아니면 그리지 않는다", () => {
    expect(lectureCameo(null, ["rc"])).toBeNull();
    expect(lectureCameo("알런", ["rc"])).toBeNull();
  });
});
