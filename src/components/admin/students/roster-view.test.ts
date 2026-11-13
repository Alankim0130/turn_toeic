import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ROSTER_VIEWS, isAlertView } from "./ClassRosterView";

/**
 * 학생명단 보기 고르기 (2026-11-13 Alan — "반별명단, 레벨별 명단 저기 왼쪽에 추가부탁해. 숙제 알림받기, 숙제 알림끄기 이렇게 두개를 만들어줘").
 * 숙제 미제출 알림 목록은 보기 두 칸이다 — 그 전 몇 시간은 등록생 탭 맨 위에 늘 서 있는 카드였다(되돌리지 말 것).
 */
describe("학생명단 보기 — 숙제 알림받기 · 숙제 알림끄기", () => {
  it("반별 명단 왼쪽에 숙제 알림받기 · 숙제 알림끄기", () => {
    expect(ROSTER_VIEWS).toEqual(["alerts-on", "alerts-off", "classes", "levels", "cards"]);
  });

  it("알림 목록 보기는 둘뿐", () => {
    expect(ROSTER_VIEWS.filter((v) => isAlertView(v))).toEqual(["alerts-on", "alerts-off"]);
    expect(isAlertView(null)).toBe(false);
  });

  it("목록은 그 보기를 골랐을 때만 그린다 — 맨 위에 늘 서 있는 카드로 되돌리지 않는다", () => {
    const page = fs.readFileSync(path.join(process.cwd(), "src/app/admin/students/page.tsx"), "utf8");
    expect(page).toMatch(/\{alertView && \(\s*<AlertsList/);
    expect(page).not.toMatch(/AlertsOffList/);
  });
});
