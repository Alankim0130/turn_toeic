import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { heldCountable, monthSetup } from "./month-setup";

/**
 * 2026-10-22 Alan — 11월 반 편성 달력(개강 11/4 · 종강 11/30 · 월수금 9 · 화목금 9 · 특강 4)을 저장해 두고
 * "11월 시간표 다 넣어놨는데 왜 안잡히는거야?". 달력만으로는 반이 생기지 않는다 — 그 달 시간표와 반 개설이 따로 있다.
 */
const NOV = { month: 11, hasSaved: true, closes: "2026-11-30", today: "2026-10-22", slots: 0, sections: 0, held: 3 };

describe("반 편성 달력의 '다음 할 일'", () => {
  it("달력만 저장한 달 — 시간표부터, 받아 둔 수강증 수와 함께", () => {
    expect(monthSetup(NOV)).toEqual({ timetableReady: false, held: 3, auto: true });
  });

  it("시간표를 만들었으면 반 개설만 남는다", () => {
    expect(monthSetup({ ...NOV, slots: 19 })).toEqual({ timetableReady: true, held: 3, auto: true });
  });

  it("평달은 버튼 하나(한 번에 만들기) · 방학달(1 · 2 · 7 · 8월)은 강사가 두 단계로 (2026-10-22 Alan '방학달만 강사가 직접')", () => {
    for (const month of [3, 4, 5, 6, 9, 10, 11, 12]) expect(monthSetup({ ...NOV, month })?.auto, `${month}월`).toBe(true);
    for (const month of [1, 2, 7, 8]) expect(monthSetup({ ...NOV, month })?.auto, `${month}월`).toBe(false);
  });

  it("반이 하나라도 있거나 · 달력을 아직 저장하지 않았거나 · 종강한 달이면 띄우지 않는다", () => {
    expect(monthSetup({ ...NOV, sections: 1 })).toBeNull();
    expect(monthSetup({ ...NOV, hasSaved: false })).toBeNull();
    expect(monthSetup({ ...NOV, closes: "2026-10-21" })).toBeNull();
    // 종강일 당일까지는 할 일이다
    expect(monthSetup({ ...NOV, closes: "2026-10-22" })).not.toBeNull();
  });

  it("받아 둔 수강증의 달(연도 없음)은 오늘부터 0~2달 뒤만 센다", () => {
    expect(heldCountable(2026, 10, "2026-10-22")).toBe(true);
    expect(heldCountable(2026, 11, "2026-10-22")).toBe(true);
    expect(heldCountable(2026, 12, "2026-10-22")).toBe(true);
    expect(heldCountable(2027, 1, "2026-11-05")).toBe(true);
    expect(heldCountable(2027, 1, "2026-10-22")).toBe(false);
    expect(heldCountable(2027, 11, "2026-10-22")).toBe(false);
    expect(heldCountable(2026, 9, "2026-10-22")).toBe(false);
  });

  it("화면이 이 규칙을 쓴다 — 달력 맨 위 카드 · 새 반 개설의 시간표 안내 · 시간표 설정의 반 개설 안내", () => {
    const calendar = readFileSync("src/app/admin/sections/page.tsx", "utf8");
    expect(calendar).toContain("monthSetup(");
    expect(calendar).toContain("<MonthSetupCard");
    expect(calendar).toMatch(/hold_month/);
    const card = readFileSync("src/components/admin/sections/MonthSetupCard.tsx", "utf8");
    expect(card).toContain("/admin/timetable?month=");
    expect(card).toContain("/admin/sections/new?term=");
    // 평달은 버튼 하나 — 반 편성 액션 openMonthClasses (autoOpenMonth 와 같은 길)
    expect(card).toContain("setup.auto");
    expect(card).toContain("action={openMonthClasses}");
    const bulk = readFileSync("src/app/admin/sections/new/page.tsx", "utf8");
    expect(bulk).toContain("sourceNote(");
    expect(bulk).toMatch(/달력과 따로/);
    const timetable = readFileSync("src/app/admin/timetable/page.tsx", "utf8");
    expect(timetable).toContain("/admin/sections/new?term=");
  });
});
