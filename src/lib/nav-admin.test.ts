import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { activeAdminHref, adminHomeFor, NAV_ADMIN, NAV_ADMIN_SECTIONS, navAdminFor, navAdminSectionsFor } from "./site";

/**
 * 관리자 메뉴 묶음 (2026-10-02 Alan — "관리자 햄버거 메뉴도 학생 모드와 마찬가지로 카테고리별 분리").
 * 햄버거 서랍 · 사이드바가 같은 묶음을 그리고, 평평한 목록(NAV_ADMIN)은 묶음에서 만든다 — 어긋날 수 없다.
 */
describe("관리자 메뉴 묶음 (NAV_ADMIN_SECTIONS)", () => {
  it("다섯 묶음 — 운영 · 학생 · 수업 편성 · 수업 자료 · 학습 — 이고 대시보드가 맨 앞이다", () => {
    expect(NAV_ADMIN_SECTIONS.map((s) => s.label)).toEqual(["운영", "학생", "수업 편성", "수업 자료", "학습"]);
    expect(NAV_ADMIN[0].href).toBe("/admin");
    for (const s of NAV_ADMIN_SECTIONS) expect(s.items.length, s.label).toBeGreaterThan(0);
  });

  it("평평한 목록은 묶음을 편 것과 같고 주소가 겹치지 않는다", () => {
    const flat = NAV_ADMIN_SECTIONS.flatMap((s) => s.items.map((i) => i.href));
    expect(NAV_ADMIN.map((i) => i.href)).toEqual(flat);
    expect(new Set(flat).size).toBe(flat.length);
  });

  it("스터디 시간 설정이 학습 묶음에 있고, 반 편성은 수업 편성 묶음에 있다 (2026-10-02 페이지 분리)", () => {
    const study = NAV_ADMIN_SECTIONS.find((s) => s.label === "학습")!;
    expect(study.items.map((i) => i.href)).toContain("/admin/study/plan");
    const plan = NAV_ADMIN_SECTIONS.find((s) => s.label === "수업 편성")!;
    expect(plan.items.map((i) => i.href)).toContain("/admin/sections");
  });

  it("조교는 crew 항목만 보고 빈 묶음은 사라진다 — 첫 화면은 출석", () => {
    const crew = navAdminSectionsFor("assistant");
    for (const s of crew) for (const i of s.items) expect(i.crew, i.href).toBe(true);
    expect(crew.map((s) => s.label)).toEqual(["학생", "수업 자료", "학습"]);
    expect(navAdminFor("assistant").map((i) => i.href)).toEqual(crew.flatMap((s) => s.items.map((i) => i.href)));
    expect(adminHomeFor("assistant")).toBe("/admin/attendance");
    expect(navAdminSectionsFor("instructor")).toEqual(NAV_ADMIN_SECTIONS);
  });

  /**
   * 조교가 쓰는 화면은 일곱 (2026-10-03 Alan — "조교의 권한 1. 수동등업 수락 2. 불라방 교재주문 3. 스터디 신청자
   * 4. 불라방 링크 올리기 5. 숙제점검 6. 출석확인 / 없는 권한 1. 학생명단(개인정보) 2. 반배정 3. 이하 다른 관리자페이지"
   * → 2026-10-07 Alan "비대면자료를 조교들이 올릴 수 있으면 좋겠어" 로 비대면 자료가 일곱째).
   * 여기에 하나를 더하면 proxy 입구(canEnterAdminPath)와 화면 가드까지 같이 열린다 — Alan 에게 확인하고 더할 것.
   * DB 쪽 같은 집합은 마이그레이션 20261003100000 · 20261007100000.
   */
  it("조교 화면은 Alan 이 정한 일곱 개뿐이다 — 학생명단은 없다", () => {
    expect(navAdminFor("assistant").map((i) => i.href).sort()).toEqual(
      ["/admin/attendance", "/admin/homework", "/admin/live", "/admin/study", "/admin/study-materials", "/admin/textbook-orders", "/admin/verifications"].sort(),
    );
  });

  it("켜 둘 메뉴는 가장 긴 주소 하나 — /admin/study/plan 은 스터디 신청자(/admin/study)를 켜지 않는다", () => {
    // usePathname() 은 ?term= 같은 쿼리를 주지 않는다 — 경로만 본다
    expect(activeAdminHref(NAV_ADMIN, "/admin/study/plan")).toBe("/admin/study/plan");
    expect(activeAdminHref(NAV_ADMIN, "/admin/study")).toBe("/admin/study");
    expect(activeAdminHref(NAV_ADMIN, "/admin/sections/new")).toBe("/admin/sections");
    expect(activeAdminHref(NAV_ADMIN, "/admin")).toBe("/admin");
    expect(activeAdminHref(NAV_ADMIN, "/admin/students/abc")).toBe("/admin/students");
    expect(activeAdminHref(NAV_ADMIN, "/my")).toBe(null);
  });

  it("아이콘 파일이 전부 있다 (public/icons)", () => {
    for (const i of NAV_ADMIN) expect(existsSync(`public/icons/${i.icon}.png`), i.icon).toBe(true);
  });
});
