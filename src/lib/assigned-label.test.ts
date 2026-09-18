import { describe, expect, it } from "vitest";
import { assignedLabels } from "./assigned-label";
import type { EnrollSection } from "./enroll-options";

const sep = { year: 2026, month: 9 };
const c650 = { id: 1, name: "650+ 왕기초반", program: "score", target_score: 650 };
const S: EnrollSection[] = [
  { id: 11, track: "mwf", time_block: "10:00~12:10", term: sep, course: c650 },
  { id: 12, track: "ttf", time_block: "10:00~12:10", term: sep, course: c650 },
  { id: 13, track: "mwf", time_block: "10:00~11:00", term: sep, course: c650 },
];

describe("승인된 반 한 줄 (학생 팝업)", () => {
  it("주5일(월수금+화목금)은 한 줄로 합쳐 `주5일` 이라고 쓴다", () => {
    expect(assignedLabels(S, [11, 12], "live")).toEqual(["2026년 9월 · 650+ 왕기초반 · 주5일 · 10:00~12:10 · 불라방"]);
  });
  it("주3일은 트랙 이름을 쓴다", () => {
    expect(assignedLabels(S, [13], "onsite")).toEqual(["2026년 9월 · 650+ 왕기초반 · 월수금 · 10:00~11:00 · 현장"]);
  });
  it("없는 반 id 는 건너뛴다", () => {
    expect(assignedLabels(S, [99], "onsite")).toEqual([]);
  });
});
