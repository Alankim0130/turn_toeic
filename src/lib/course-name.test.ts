import { describe, expect, it } from "vitest";
import { courseLevelLabel, courseShortName, studentLevels } from "./timetable";

describe("courseShortName — 랜딩 카드의 강좌 짧은 이름", () => {
  it("스파르타 강좌는 과정 이름과 레벨을 떼고 속성 이름만 남긴다", () => {
    expect(courseShortName("스파르타 650+ 중급속성")).toBe("중급속성");
    expect(courseShortName("스파르타 750+ 실전속성")).toBe("실전속성");
  });

  it("점수보장반 이름도 레벨 토큰만 뗀다", () => {
    expect(courseShortName("650+ 왕기초반")).toBe("왕기초반");
    expect(courseShortName("850 문제마스터")).toBe("문제마스터");
  });

  it("뗄 것이 없으면 그대로, 떼고 남는 게 없으면 원래 이름", () => {
    expect(courseShortName("문제마스터")).toBe("문제마스터");
    expect(courseShortName("스파르타 650+")).toBe("스파르타 650+");
  });
});

describe("courseLevelLabel · studentLevels — 특강 신청자 명단의 학생 레벨 (2026-10-16 Alan)", () => {
  const c650 = { name: "650+ 왕기초반", program: "score", target_score: 650 };
  const c750 = { name: "750+ 유형마스터", program: "score", target_score: 750 };
  const c850 = { name: "850+ 문제마스터", program: "score", target_score: 850 };
  const sp650 = { name: "스파르타 650+ 중급속성", program: "sparta", target_score: 650 };
  const tw850 = { name: "850+ 2주완성", program: "twoweek", target_score: 850 };

  it("점수보장반은 레벨 숫자, 속성반 · 2주완성은 레벨 + 과정 이름", () => {
    expect(courseLevelLabel(c650)).toBe("650");
    expect(courseLevelLabel(sp650)).toBe("650 중급속성");
    expect(courseLevelLabel({ name: "스파르타 750+ 실전속성", program: "sparta", target_score: 750 })).toBe("750 실전속성");
    expect(courseLevelLabel(tw850)).toBe("850 2주완성");
  });

  it("레벨을 모르면 강좌 이름 그대로 · 과정 이름이 없으면 과정 라벨 (레벨을 두 번 적지 않는다)", () => {
    expect(courseLevelLabel({ name: " 특별반 ", program: "score", target_score: null })).toBe("특별반");
    expect(courseLevelLabel({ name: "스파르타 650+", program: "sparta", target_score: 650 })).toBe("650 스파르타반");
    expect(courseLevelLabel({ name: "650", target_score: 650 })).toBe("650");
  });

  it("학생 한 명 — 같은 강좌는 한 번, 레벨 → 과정 순", () => {
    // 주5일 120분 = 같은 강좌 두 반
    expect(studentLevels([c650, c650]).map((l) => l.label)).toEqual(["650"]);
    // 650 RC 단과 + 750 LC 단과 — 들어온 순서와 상관없이 레벨 순
    expect(studentLevels([c750, c650]).map((l) => l.label)).toEqual(["650", "750"]);
    // 같은 850 이라도 점수보장반이 2주완성보다 앞
    expect(studentLevels([tw850, c850]).map((l) => l.label)).toEqual(["850", "850 2주완성"]);
    expect(studentLevels([sp650])).toEqual([{ label: "650 중급속성", level: 650 }]);
    expect(studentLevels([])).toEqual([]);
    // 레벨을 모르는 강좌는 맨 뒤
    expect(studentLevels([{ name: "특별반", program: "score", target_score: null }, c750]).map((l) => l.label)).toEqual(["750", "특별반"]);
  });
});
