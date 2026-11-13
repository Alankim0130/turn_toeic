import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ROSTER_VIEWS, isAlertView } from "./ClassRosterView";

/**
 * 학생명단 보기 고르기 · 숙제 알림 명단 (2026-11-13).
 * "반별명단, 레벨별 명단 저기 왼쪽에 추가부탁해. 숙제 알림받기, 숙제 알림끄기 이렇게 두개를 만들어줘" → "조교들이 볼 수 있도록" →
 * 레벨별 명단 화면을 보내며 "숙제 알림 명단을 이런식으로 만들어줘". 그 전 몇 시간은 등록생 탭 맨 위에 늘 서 있는 카드였고, 그다음은 이름 · 반 배지 줄 목록이었다 (되돌리지 말 것).
 */
const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

describe("학생명단 보기 — 숙제 알림받기 · 숙제 알림끄기", () => {
  it("반별 명단 왼쪽에 숙제 알림받기 · 숙제 알림끄기", () => {
    expect(ROSTER_VIEWS).toEqual(["alerts-on", "alerts-off", "classes", "levels", "cards"]);
  });

  it("알림 명단 보기는 둘뿐", () => {
    expect(ROSTER_VIEWS.filter((v) => isAlertView(v))).toEqual(["alerts-on", "alerts-off"]);
    expect(isAlertView(null)).toBe(false);
  });

  it("명단은 레벨별 명단 그림 그대로 — 그 달 레벨별 명단을 켜 둔 · 끈 학생으로 거른 것", () => {
    const roster = read("src/components/admin/students/AlertsRoster.tsx");
    expect(roster).toMatch(/<TrackLevels/);
    const students = read("src/app/admin/students/page.tsx");
    expect(students).toMatch(/view === "levels" \|\| alertView \? "track"/);
    expect(students).toMatch(/filterRoster\(classRoster\.roster/);
    expect(students).toMatch(/\{alertView &&/);
    // 줄 목록 · 맨 위 카드로 되돌리지 않는다
    expect(fs.existsSync(path.join(process.cwd(), "src/components/admin/students/AlertsList.tsx"))).toBe(false);
    expect(fs.existsSync(path.join(process.cwd(), "src/components/admin/students/AlertsOffList.tsx"))).toBe(false);
  });

  it("조교도 본다 — 숙제 미제출 알림 화면(조교 화면)에 같은 명단, 이름은 getProfileNames. 학생명단은 그대로 강사 · 관리자만", () => {
    const missing = read("src/app/admin/homework/missing/page.tsx");
    expect(missing).toMatch(/await requireCrew\(\)/);
    expect(missing).toMatch(/value: "alerts-on", label: "숙제 알림받기"/);
    expect(missing).toMatch(/value: "alerts-off", label: "숙제 알림끄기"/);
    expect(missing).toMatch(/loadClassRoster\(supabase, term, today, "track", \(ids\) => getProfileNames\(supabase, ids\)\)/);
    expect(missing).toMatch(/<AlertsRoster/);
    expect(read("src/app/admin/students/page.tsx")).toMatch(/await requireStaff\(\)/);
  });
});
