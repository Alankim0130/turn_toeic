import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  forgetStudentMode,
  hasStudentModeCookie,
  navKindOf,
  rememberStudentMode,
  staffLandsOnAdmin,
  STUDENT_MODE_COOKIE,
  STUDENT_MODE_MAX_AGE,
  studentModeCookie,
  wantsStaffLanding,
  type LandingRequest,
} from "./staff-landing";

/**
 * 강사 · 관리자의 첫 화면은 관리자 모드 (2026-10-11 Alan — "관리자와 강사가 홈페이지에 들어오면 첫화면은 관리자모드가 보이면 좋겠어").
 * 돌리는 조건이 하나라도 넓어지면 학생 화면 안에서 `홈` 을 눌렀는데 관리자 화면이 뜨거나, 학생 모드로 바꿔 놓은 것이 새로고침마다 되돌아간다.
 */
const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const headers = (h: Record<string, string>) => ({ get: (n: string) => h[n.toLowerCase()] ?? null });
const req = (over: Partial<LandingRequest> = {}): LandingRequest => ({ method: "GET", pathname: "/my", search: "", nav: "document", studentCookie: false, ...over });

describe("요청 종류 (navKindOf) — Next 가 rsc · prefetch 헤더를 떼어 내므로 브라우저 헤더로 가른다", () => {
  it("sec-fetch-dest 가 document 면 문서, 그 밖(empty = fetch · RSC · 미리 받기)은 fetch", () => {
    expect(navKindOf(headers({ "sec-fetch-dest": "document", accept: "text/html,application/xhtml+xml" }))).toBe("document");
    expect(navKindOf(headers({ "sec-fetch-dest": "empty", accept: "*/*" }))).toBe("fetch");
    // 브라우저가 fetch 에 accept: text/html 을 붙여도 dest 가 먼저다
    expect(navKindOf(headers({ "sec-fetch-dest": "empty", accept: "text/html" }))).toBe("fetch");
    expect(navKindOf(headers({ "sec-fetch-dest": "iframe" }))).toBe("fetch");
  });
  it("sec-fetch-dest 가 없는 옛 브라우저는 accept 로 — text/html 이면 문서, RSC fetch 의 */* 는 fetch", () => {
    expect(navKindOf(headers({ accept: "text/html,application/xhtml+xml,*/*;q=0.8" }))).toBe("document");
    expect(navKindOf(headers({ accept: "*/*" }))).toBe("fetch");
    expect(navKindOf(headers({}))).toBe("fetch");
  });
  it("Next 의 자기 헤더는 보지 않는다 (proxy 에 오기 전에 떼어 낸다 — 2026-10-11 실측)", () => {
    expect(read("src/lib/staff-landing.ts")).not.toMatch(/headers\.get\("(rsc|next-router-prefetch|next-router-segment-prefetch)"\)/);
  });
});

describe("언제 등급을 묻고 돌리나 (wantsStaffLanding)", () => {
  it("꼭 /my 를 문서로 열 때만 — 앱 켜기 · 로그인 뒤 · 새로고침", () => {
    expect(wantsStaffLanding(req())).toBe(true);
  });
  it("화면 안 이동(하단 바 홈) · 미리 받기는 아니다", () => {
    expect(wantsStaffLanding(req({ nav: "fetch" }))).toBe(false);
  });
  it("깊은 주소 · 물음표 붙은 주소는 그 화면을 보러 온 것이다", () => {
    expect(wantsStaffLanding(req({ pathname: "/my/homework" }))).toBe(false);
    expect(wantsStaffLanding(req({ pathname: "/my/" }))).toBe(false);
    expect(wantsStaffLanding(req({ search: "?welcome=1" }))).toBe(false);
    expect(wantsStaffLanding(req({ search: "?denied=admin" }))).toBe(false);
    expect(wantsStaffLanding(req({ pathname: "/" }))).toBe(false);
    expect(wantsStaffLanding(req({ pathname: "/admin" }))).toBe(false);
  });
  it("학생 모드를 쓰던 중(쿠키)이면 그대로 두고, GET 이 아니면 손대지 않는다", () => {
    expect(wantsStaffLanding(req({ studentCookie: true }))).toBe(false);
    expect(wantsStaffLanding(req({ method: "POST" }))).toBe(false);
  });
});

describe("누구를 돌리나 (staffLandsOnAdmin)", () => {
  it("강사 · 관리자만 — /admin 대시보드 입구와 같은 집합", () => {
    expect(staffLandsOnAdmin({ role: "admin", test_role: null })).toBe(true);
    expect(staffLandsOnAdmin({ role: "instructor", test_role: null })).toBe(true);
  });
  it("조교는 아니다 (Alan 이 '관리자와 강사' 라고 했다 — 넓히려면 묻는다) · 학생 등급도 아니다", () => {
    for (const r of ["assistant", "student", "member", "alumni", "guest"]) expect(staffLandsOnAdmin({ role: r, test_role: null }), r).toBe(false);
    expect(staffLandsOnAdmin(null)).toBe(false);
    expect(staffLandsOnAdmin(undefined)).toBe(false);
  });
  it("테스트 등급을 켠 스태프는 일부러 학생으로 보는 중이라 돌리지 않는다", () => {
    expect(staffLandsOnAdmin({ role: "admin", test_role: "student" })).toBe(false);
    expect(staffLandsOnAdmin({ role: "instructor", test_role: "member" })).toBe(false);
  });
});

describe("학생 모드 쿠키 (브라우저가 둔다)", () => {
  it("두는 문장 — path / · 한 시간 · samesite lax · https 면 secure. 보안 뜻이 없는 값이라 httpOnly 는 아니다 (브라우저가 써야 한다)", () => {
    expect(studentModeCookie(true, true)).toBe(`wt-mode=student; path=/; max-age=${STUDENT_MODE_MAX_AGE}; samesite=lax; secure`);
    expect(studentModeCookie(true, false)).toBe(`wt-mode=student; path=/; max-age=${STUDENT_MODE_MAX_AGE}; samesite=lax`);
    expect(STUDENT_MODE_MAX_AGE).toBe(3600);
    expect(STUDENT_MODE_COOKIE).toBe("wt-mode");
  });
  it("지우는 문장은 max-age=0", () => {
    expect(studentModeCookie(false, true)).toBe("wt-mode=; path=/; max-age=0; samesite=lax; secure");
  });
  it("rememberStudentMode 는 늘 쓰고(밀어 두기), forgetStudentMode 는 쿠키가 있을 때만 쓴다", () => {
    const doc = { cookie: "" };
    rememberStudentMode(doc, true);
    expect(doc.cookie).toBe(studentModeCookie(true, true));
    const browser = { cookie: "a=1; wt-mode=student; b=2" };
    expect(hasStudentModeCookie(browser)).toBe(true);
    forgetStudentMode(browser, false);
    expect(browser.cookie).toBe(studentModeCookie(false, false));
    const none = { cookie: "a=1; wt-mode=other" };
    expect(hasStudentModeCookie(none)).toBe(false);
    forgetStudentMode(none, false);
    expect(none.cookie).toBe("a=1; wt-mode=other");
  });
});

describe("proxy · 레이아웃이 이 판정을 그대로 쓴다", () => {
  const proxy = read("src/lib/supabase/proxy.ts");
  it("proxy 는 wantsStaffLanding 이 참일 때만 등급을 묻고(role · test_role), staffLandsOnAdmin 이면 /admin 으로 보낸다", () => {
    expect(proxy).toMatch(/if \(user && wantsStaffLanding\(landing\)\) \{\s*const \{ data: profile \} = await supabase\.from\("profiles"\)\.select\("role, test_role"\)/);
    expect(proxy).toMatch(/if \(staffLandsOnAdmin\(profile\)\) \{[\s\S]*?url\.pathname = "\/admin";\s*url\.search = "";\s*return NextResponse\.redirect\(url\);/);
    expect(proxy).toContain("nav: navKindOf(request.headers)");
    expect(proxy).toContain("request.cookies.get(STUDENT_MODE_COOKIE)?.value === STUDENT_MODE_VALUE");
    // 쿠키는 브라우저가 둔다 — 서버가 쓰면 미리 받기(헤더가 떼어져 안 보인다)에도 쓰게 된다
    expect(proxy).not.toMatch(/response\.cookies\.(set|delete)\(STUDENT_MODE_COOKIE/);
  });
  it("학생 레이아웃은 강사 · 관리자에게만 StudentModeKeeper 를, 관리자 틀은 AdminModeMark 를 그린다", () => {
    expect(read("src/app/my/layout.tsx")).toMatch(/\{isStaff\(profile\?\.role\) && <StudentModeKeeper \/>\}/);
    expect(read("src/components/admin/AdminShell.tsx")).toContain("<AdminModeMark />");
    const memory = read("src/components/layout/ModeMemory.tsx");
    expect(memory).toMatch(/^"use client";/);
    expect(memory).toMatch(/export function StudentModeKeeper\(\)[\s\S]*rememberStudentMode\(\);[\s\S]*\}, \[pathname\]\)/);
    expect(memory).toMatch(/export function AdminModeMark\(\)[\s\S]*forgetStudentMode\(\);/);
  });
  it("학생 모드 링크는 그대로 /my 다 — 모드는 주소로 정하고, 기억은 쿠키 하나뿐이다", () => {
    expect(read("src/components/layout/StaffModeSwitch.tsx")).toMatch(/key: "student", label: "학생 모드", href: "\/my"/);
    expect(read("src/components/admin/AdminNav.tsx").match(/href="\/my"/g)?.length).toBe(2);
  });
});
