import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canAssignRole, isAdmin, isAssistant, isCrew, isStaff, isStudentGrade, isStudentPlus, ROLE_LABEL, STUDENT_GRADES, TEST_ROLES, type UserRole } from "./auth";
import { NAV_ADMIN } from "./site";

/**
 * 등급 체계를 지키는 테스트 (2026-09-17 Alan 요청 — "다른 워크트리에서도 항상 고려할 수 있도록").
 *
 * 문서만으로는 다른 세션이 빠뜨린다. 여기 걸리면 `npm test` 가 깨지므로 지나칠 수 없다.
 * 규칙 자체와 이유는 CLAUDE.md 도메인 규칙 3 에 있다.
 */

const ADMIN_DIR = "src/app/admin";
const GUARDS = ["requireStaff", "requireCrew"];

function walk(dir: string, match: (f: string) => boolean): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p, match));
    else if (match(name)) out.push(p);
  }
  return out;
}

describe("등급 판정 — 앱 안에서 어긋나지 않는다", () => {
  const ROLES = Object.keys(ROLE_LABEL) as UserRole[];

  it("강사 권한 = 관리자 권한 (DB 의 private.is_admin() 과 같은 집합이어야 한다)", () => {
    expect(isAdmin("instructor")).toBe(true);
    expect(isAdmin("admin")).toBe(true);
    expect(ROLES.filter(isAdmin).sort()).toEqual(ROLES.filter(isStaff).sort());
  });

  it("조교는 스태프가 아니다 — is_staff() 를 넓히면 관리자 화면이 통째로 열린다", () => {
    expect(isStaff("assistant")).toBe(false);
    expect(isAdmin("assistant")).toBe(false);
    expect(isCrew("assistant")).toBe(true);
  });

  it("crew = 스태프 + 조교, 그 밖은 아무도 아니다", () => {
    expect(ROLES.filter(isCrew).sort()).toEqual(["admin", "assistant", "instructor"]);
  });

  it("학생·회원·졸업생·비회원은 어떤 관리자 판정에도 걸리지 않는다", () => {
    for (const r of ["guest", "member", "student", "alumni"] as UserRole[]) {
      expect(isStaff(r), r).toBe(false);
      expect(isAdmin(r), r).toBe(false);
      expect(isCrew(r), r).toBe(false);
      expect(isAssistant(r), r).toBe(false);
    }
  });

  it("수강생전용은 수강생 + crew 만 (졸업생은 아니다)", () => {
    expect(ROLES.filter(isStudentPlus).sort()).toEqual(["admin", "assistant", "instructor", "student"]);
    expect(isStudentPlus("alumni")).toBe(false);
  });

  it("테스트 등급은 낮은 등급만 — 조교·강사·관리자로는 테스트하지 않는다", () => {
    expect([...TEST_ROLES].sort()).toEqual(["alumni", "member", "student"]);
    for (const t of TEST_ROLES) expect(isCrew(t)).toBe(false);
  });

  it("등급마다 한국어 이름이 있다 (화면에 영어가 새지 않는다)", () => {
    for (const r of ROLES) expect(ROLE_LABEL[r]?.length, r).toBeGreaterThan(0);
  });

  it("학생 등급 = 관리자 화면을 하나도 못 쓰는 등급 (DB 의 private.is_student_grade() 와 같은 집합)", () => {
    expect([...STUDENT_GRADES].sort()).toEqual(["alumni", "guest", "member", "student"]);
    expect(ROLES.filter(isStudentGrade).sort()).toEqual(ROLES.filter((r) => !isCrew(r)).sort());
  });
});

/**
 * 조교의 등급 변경 (2026-09-19 Alan — "조교에게도 등급권한을 부여해주는 권한").
 * DB 정책 "profiles: 본인·스태프·조교 수정" 과 같은 집합이어야 한다 (마이그레이션 20260919130000).
 */
describe("등급을 누가 바꿀 수 있나 — canAssignRole", () => {
  const ROLES = Object.keys(ROLE_LABEL) as UserRole[];

  it("강사·관리자는 무엇이든 바꾼다", () => {
    for (const actor of ["instructor", "admin"] as UserRole[])
      for (const target of ROLES) for (const next of ROLES) expect(canAssignRole(actor, target, next), `${actor}:${target}→${next}`).toBe(true);
  });

  it("조교는 학생 등급인 사람만 건드린다 — 강사·관리자·조교 계정은 못 바꾼다", () => {
    for (const target of ["instructor", "admin", "assistant"] as UserRole[])
      expect(canAssignRole("assistant", target, "member"), target).toBe(false);
  });

  it("조교는 누구도 스태프 등급으로 못 올린다 (스스로 권한을 올리는 길 차단)", () => {
    for (const next of ["instructor", "admin", "assistant"] as UserRole[])
      expect(canAssignRole("assistant", "student", next), next).toBe(false);
  });

  it("조교는 학생 등급 사이는 바꾼다", () => {
    for (const target of STUDENT_GRADES) for (const next of STUDENT_GRADES) expect(canAssignRole("assistant", target, next)).toBe(true);
  });

  it("학생·회원·졸업생·비회원은 아무것도 못 바꾼다", () => {
    for (const actor of [...STUDENT_GRADES, null] as (UserRole | null)[])
      expect(canAssignRole(actor, "member", "student"), String(actor)).toBe(false);
  });
});

describe("관리자 화면은 화면마다 가드가 있다", () => {
  const pages = walk(ADMIN_DIR, (f) => f === "page.tsx");

  it("찾은 화면이 있다 (경로가 바뀌면 이 테스트가 헛돈다)", () => {
    expect(pages.length).toBeGreaterThan(10);
  });

  it.each(pages)("%s 에 requireStaff/requireCrew 가 있다", (p) => {
    // 레이아웃이 조교를 통과시키므로 화면이 스스로 막아야 한다 — 주소를 직접 치면 레이아웃만으론 못 막는다
    expect(GUARDS.some((g) => readFileSync(p, "utf8").includes(`${g}(`))).toBe(true);
  });
});

describe("관리자 서버 액션은 함수마다 가드가 있다", () => {
  const files = walk(ADMIN_DIR, (f) => /actions.*\.ts$/.test(f));

  it("찾은 파일이 있다", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it.each(files)("%s 의 모든 액션이 권한을 본다", (p) => {
    const src = readFileSync(p, "utf8");
    // 파일 안 헬퍼가 대신 확인하는 경우도 있다 (tester-actions 의 공용 확인 함수)
    const helpers = [...src.matchAll(/(?:async )?function (\w+)\s*\([^)]*\)[^{]*\{([\s\S]*?)\n\}/g)]
      .filter(([, , body]) => GUARDS.some((g) => body.includes(`${g}(`)))
      .map(([, name]) => name);
    const ok = [...GUARDS, ...helpers];

    const unguarded = src
      .split(/export async function /)
      .slice(1)
      .map((chunk) => ({ name: chunk.slice(0, chunk.indexOf("(")), body: chunk }))
      .filter(({ body }) => !ok.some((g) => body.includes(`${g}(`)))
      .map(({ name }) => name);

    expect(unguarded, `가드 없는 액션: ${unguarded.join(", ")}`).toEqual([]);
  });
});

/**
 * 메뉴와 가드가 어긋나면 조용히 틀린다 — 조교에게 보이는 메뉴인데 화면이 막거나(눌러도 튕긴다),
 * 조교에게 안 보이는 화면인데 가드가 느슨하면(주소를 직접 치면 들어온다).
 */
describe("관리자 메뉴와 화면 가드가 같은 말을 한다", () => {
  const src = (href: string) => readFileSync(`src/app${href}/page.tsx`, "utf8");

  it.each(NAV_ADMIN.filter((n) => n.crew).map((n) => n.href))("조교 메뉴 %s 는 requireCrew 로 연다", (href) => {
    expect(src(href)).toContain("requireCrew(");
  });

  it.each(NAV_ADMIN.filter((n) => !n.crew).map((n) => n.href))("조교에게 안 보이는 %s 는 requireStaff 로 막는다", (href) => {
    const body = src(href);
    expect(body).toContain("requireStaff(");
    expect(body).not.toContain("requireCrew(");
  });
});

describe("등급·과목은 사용자가 스스로 못 바꾼다 (마이그레이션 grant 목록)", () => {
  const grants = readFileSync("supabase/migrations/20260915052027_scope_expansion.sql", "utf8");

  it("authenticated 의 profiles update 권한에 test_role·subject 가 없다", () => {
    const line = grants.split("\n").find((l) => l.includes("grant update") && l.includes("public.profiles"));
    expect(line, "grant update 줄을 못 찾았다").toBeTruthy();
    expect(line).not.toContain("test_role");
    expect(line).not.toContain("subject");
  });
});

describe("새 enum 값은 자기 파일에만 둔다 (Postgres 55P04)", () => {
  const dir = "supabase/migrations";
  const adders = readdirSync(dir).filter((f) => /add value/i.test(readFileSync(join(dir, f), "utf8")));

  it.each(adders)("%s 은 enum 값 추가 말고 다른 일을 하지 않는다", (f) => {
    const body = readFileSync(join(dir, f), "utf8")
      .split("\n")
      .filter((l) => l.trim() && !l.trim().startsWith("--"))
      .join("\n");
    // 같은 트랜잭션에서 새 값을 쓰면 55P04 로 배포가 통째로 실패한다
    expect(body.split(";").filter((s) => s.trim()).length, `${f} 에 다른 문장이 섞였다`).toBe(1);
  });
});
