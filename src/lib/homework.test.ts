import { describe, expect, it } from "vitest";
import { classDayLabel, homeworkCheckedMessage, homeworkLabel, levelsOfDay } from "./homework";

describe("levelsOfDay — 달력에서 고른 날 낼 수 있는 레벨", () => {
  it("점수보장반은 그 레벨 하나", () => {
    expect(levelsOfDay([{ target_score: 650, includes_levels: [] }])).toEqual([650]);
  });

  it("중급속성(스파르타 650)은 650·850 두 레벨이 다 나온다", () => {
    expect(levelsOfDay([{ target_score: 650, includes_levels: [850] }])).toEqual([650, 850]);
  });

  it("실전속성(스파르타 750)은 750·850", () => {
    expect(levelsOfDay([{ target_score: 750, includes_levels: [850] }])).toEqual([750, 850]);
  });

  it("같은 날 여러 반이면 합치고 중복은 없앤다", () => {
    expect(levelsOfDay([{ target_score: 650 }, { target_score: 650 }, { target_score: 850 }])).toEqual([650, 850]);
  });

  it("오름차순으로 준다 — 버튼 순서가 날마다 흔들리면 안 된다", () => {
    expect(levelsOfDay([{ target_score: 850 }, { target_score: 650 }])).toEqual([650, 850]);
  });

  it("강좌를 못 읽은 반은 건너뛴다 (짐작해서 레벨을 만들지 않는다)", () => {
    expect(levelsOfDay([null, undefined, { target_score: null }])).toEqual([]);
  });
});

describe("점검완료 알림 문구", () => {
  it("강사 코멘트가 있으면 그대로 싣는다", () => {
    const m = homeworkCheckedMessage({ level: 650, subject: "rc", classDate: "2026-09-17", feedback: "3번 문제 다시 보세요" });
    expect(m.title).toBe("9월 17일 650 · RC 숙제 점검이 끝났어요");
    expect(m.body).toBe("3번 문제 다시 보세요");
  });

  it("코멘트가 없으면 기본 안내", () => {
    const m = homeworkCheckedMessage({ level: 750, subject: "lc", classDate: "2026-09-17", feedback: "   " });
    expect(m.body).toContain("확인했어요");
  });

  it("날짜가 없는 옛 제출도 문구가 자연스럽다", () => {
    const m = homeworkCheckedMessage({ level: 850, subject: "rc", classDate: null });
    expect(m.title).toBe("850 · RC 숙제 점검이 끝났어요");
  });
});

describe("라벨", () => {
  it("homeworkLabel 은 레벨 · 과목", () => {
    expect(homeworkLabel(650, "lc")).toBe("650 · LC");
  });
  it("classDayLabel 은 월·일", () => {
    expect(classDayLabel("2026-09-03")).toBe("9월 3일");
  });
});
