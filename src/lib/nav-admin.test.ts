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

  it("조교는 crew 항목만 보고 빈 묶음은 사라진다 — 첫 화면은 여전히 학생명단", () => {
    const crew = navAdminSectionsFor("assistant");
    for (const s of crew) for (const i of s.items) expect(i.crew, i.href).toBe(true);
    expect(crew.map((s) => s.label)).toEqual(["학생", "학습"]);
    expect(navAdminFor("assistant").map((i) => i.href)).toEqual(crew.flatMap((s) => s.items.map((i) => i.href)));
    expect(adminHomeFor("assistant")).toBe("/admin/students");
    expect(navAdminSectionsFor("instructor")).toEqual(NAV_ADMIN_SECTIONS);
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
