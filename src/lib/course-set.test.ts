import { describe, expect, it } from "vitest";
import { flipSet, isCourseSet } from "./course-set";

describe("flipSet — A ↔ B", () => {
  it("뒤집고, 없으면 null", () => {
    expect(flipSet("A")).toBe("B");
    expect(flipSet("B")).toBe("A");
    expect(flipSet(null)).toBeNull();
    expect(flipSet("C")).toBeNull();
  });

  it("A · B 만 과정이다", () => {
    expect(isCourseSet("A")).toBe(true);
    expect(isCourseSet("B")).toBe(true);
    expect(isCourseSet("a")).toBe(false);
    expect(isCourseSet(null)).toBe(false);
  });
});
