import { describe, expect, it } from "vitest";
import { courseShortName } from "./timetable";

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
