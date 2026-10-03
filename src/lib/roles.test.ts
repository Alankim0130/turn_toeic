import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canAssignRole, isAdmin, isAssistant, isCrew, isStaff, isStudentGrade, isStudentPlus, ROLE_LABEL, STUDENT_GRADES, TEST_ROLES, type UserRole } from "./auth";
import { canEnterAdminPath, NAV_ADMIN } from "./site";

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
 * 등급을 누가 바꾸나 — **강사·관리자만** (2026-10-03 Alan — 조교에게서 학생명단 · 반 배정을 뺐다.
 * 2026-09-19 ~ 10-02 에는 조교가 학생 등급끼리 바꿀 수 있었다).
 * DB 정책 "profiles: 본인·스태프 수정" 과 같은 집합이어야 한다 (마이그레이션 20261003100000).
 */
describe("등급을 누가 바꿀 수 있나 — canAssignRole", () => {
  const ROLES = Object.keys(ROLE_LABEL) as UserRole[];

  it("강사·관리자만 바꾼다 (DB 의 private.is_admin() 과 같은 집합)", () => {
    expect(ROLES.filter((r) => canAssignRole(r)).sort()).toEqual(ROLES.filter(isAdmin).sort());
  });

  it("조교는 아무 등급도 못 바꾼다 — 학생 등급 사이도", () => {
    expect(canAssignRole("assistant")).toBe(false);
  });

  it("학생·회원·졸업생·비회원·등급 없음은 아무것도 못 바꾼다", () => {
    for (const actor of [...STUDENT_GRADES, null, undefined] as (UserRole | null | undefined)[]) expect(canAssignRole(actor), String(actor)).toBe(false);
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

describe("관리자 라우트 핸들러도 함수마다 가드가 있다", () => {
  // 라우트 핸들러는 레이아웃도 화면도 타지 않는다 — 가드를 빠뜨리면 로그인한 누구에게나 열린다 (출석 포스터 인쇄, 2026-09-21)
  const routes = walk(ADMIN_DIR, (f) => f === "route.ts");

  it("찾은 파일이 있다 (경로가 바뀌면 이 테스트가 헛돈다)", () => {
    expect(routes.length).toBeGreaterThan(0);
  });

  it.each(routes)("%s 의 모든 요청 처리 함수가 권한을 본다", (p) => {
    const unguarded = readFileSync(p, "utf8")
      .split(/export async function /)
      .slice(1)
      .filter((chunk) => !GUARDS.some((g) => chunk.includes(`${g}(`)))
      .map((chunk) => chunk.slice(0, chunk.indexOf("(")));
    expect(unguarded, `가드 없는 처리 함수: ${unguarded.join(", ")}`).toEqual([]);
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

/**
 * 요청 가로채기(proxy)가 `/admin` 을 누구에게 여나 (2026-09-21 — 그 전에는 조교가 관리자 화면에 하나도 못 들어갔다).
 * 조교 메뉴가 있는데 proxy 가 막으면 눌러도 `/my?denied=admin` 으로 튕긴다. 화면 가드와 같은 집합이어야 한다.
 */
describe("관리자 화면 입구 (canEnterAdminPath) — 메뉴·화면 가드와 같은 말을 한다", () => {
  it("강사·관리자는 어디든", () => {
    for (const r of ["instructor", "admin"]) for (const n of NAV_ADMIN) expect(canEnterAdminPath(r, n.href), `${r} ${n.href}`).toBe(true);
  });
  it.each(NAV_ADMIN.filter((n) => n.crew).map((n) => n.href))("조교는 조교 메뉴 %s 와 그 아래로 들어간다", (href) => {
    expect(canEnterAdminPath("assistant", href)).toBe(true);
    expect(canEnterAdminPath("assistant", `${href}/123`)).toBe(true);
  });
  it.each(NAV_ADMIN.filter((n) => !n.crew).map((n) => n.href))("조교는 %s 에 못 들어간다", (href) => {
    expect(canEnterAdminPath("assistant", href)).toBe(false);
  });
  it("비슷한 이름의 주소로 새지 않는다 (/admin/students-x)", () => {
    expect(canEnterAdminPath("assistant", "/admin/studentsx")).toBe(false);
  });
  it("학생·회원·졸업생·비회원·등급 없음은 막는다", () => {
    for (const r of ["student", "member", "alumni", "guest", null, undefined]) expect(canEnterAdminPath(r, "/admin/students"), String(r)).toBe(false);
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

/**
 * 조교에게는 학생 정보 중 **이름만** (2026-10-03 Alan — "등업화면은 전화번호 안보이게 해줘" → "응 이것도 막아줘").
 * 화면에서 번호를 숨겨도 조교가 화면을 거치지 않고 자기 로그인으로 데이터베이스에 바로 물으면(API) 그대로 왔다 — 막는 곳은 DB 다.
 * profiles 는 칸 단위로 못 막아(grant 는 authenticated 전체에 걸린다) 남의 행을 닫았고, 조교 화면의 이름은 `public.profile_names` 로 읽는다.
 * 규칙과 이유는 CLAUDE.md 등급 체계 "바꿀 때 지킬 것" · 마이그레이션 20261003110000.
 */
describe("조교에게는 학생 이름만 — 전화번호 · 대학 · 학과 · 성별이 나가는 길이 없다", () => {
  const DIR = "supabase/migrations";
  const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
  /** 주석(-- …)을 뺀 본문 — 주석 속 문장에 속지 않는다 */
  const sqlOf = (f: string) =>
    readFileSync(join(DIR, f), "utf8")
      .split("\n")
      .map((l) => (l.trim().startsWith("--") ? "" : l))
      .join("\n");
  const CREW = /private\.is_crew\(\)|private\.is_assistant\(\)/;
  const PERSONAL = /\b(phone|university|department|gender)\b/;

  it("profiles 조회 정책에 조교 갈래가 없다 (마이그레이션을 순서대로 재생한 마지막 모양)", () => {
    const live = new Map<string, string>();
    for (const f of files) {
      for (const [, verb, name, body] of sqlOf(f).matchAll(/(create|drop) policy (?:if exists )?"([^"]+)" on public\.profiles([^;]*);/g)) {
        if (verb === "create") live.set(name, body);
        else live.delete(name);
      }
    }
    const selects = [...live].filter(([, body]) => /for select/.test(body));
    expect(selects.length, "profiles 조회 정책을 못 찾았다 (문장 모양이 바뀌면 이 테스트가 헛돈다)").toBeGreaterThan(0);
    const open = selects.filter(([, body]) => CREW.test(body)).map(([name]) => name);
    // 남의 행을 열면 모든 칸(전화번호 · 대학 · 학과 · 성별)이 같이 열린다 — 이름이 필요하면 profile_names 를 쓴다
    expect(open, `조교에게 profiles 행을 여는 정책:\n${open.join("\n")}`).toEqual([]);
  });

  it("조교가 부를 수 있는 함수가 개인정보 칸을 돌려주지 않는다", () => {
    // 함수마다 마지막 정의를 남긴다 (create or replace · drop 을 파일 순서 · 파일 안 순서대로 따라간다)
    const defs = new Map<string, string>();
    for (const f of files) {
      const sql = sqlOf(f);
      const events = [
        ...[...sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+public\.(\w+)\s*\(/gi)].map((m) => ({ at: m.index, name: m[1], drop: false })),
        ...[...sql.matchAll(/drop\s+function\s+(?:if\s+exists\s+)?public\.(\w+)/gi)].map((m) => ({ at: m.index, name: m[1], drop: true })),
      ].sort((a, b) => a.at - b.at);
      for (const e of events) {
        if (e.drop) {
          defs.delete(e.name);
          continue;
        }
        const rest = sql.slice(e.at);
        const tag = rest.match(/\bas\s+(\$\w*\$)/i);
        if (!tag || tag.index == null) continue;
        const body = rest.indexOf(tag[1], tag.index) + tag[1].length;
        const end = rest.indexOf(tag[1], body);
        defs.set(e.name, rest.slice(0, end < 0 ? undefined : end));
      }
    }
    expect(defs.has("profile_names"), "public.profile_names 를 못 찾았다 (조교 화면의 이름 길)").toBe(true);
    const leaks = [...defs]
      .filter(([, def]) => CREW.test(def))
      .filter(([, def]) => PERSONAL.test(def.match(/returns\s+table\s*\(([\s\S]*?)\blanguage\b/i)?.[1] ?? ""))
      .map(([name]) => name);
    expect(leaks, `조교가 부를 수 있는 함수가 개인정보 칸을 돌려준다:\n${leaks.join("\n")}`).toEqual([]);
  });

  it("조교에게 열린 화면 · 액션은 profiles 를 직접 읽지 않는다 — 이름은 getProfileNames 로", () => {
    // 조교 세션으로 profiles 를 임베드하면 이름이 **조용히 비어** 온다 — 강사 · 관리자로만 확인하면 못 본다.
    // 강사 · 관리자 화면에서만 쓰는 번호는 getStaffPhones 한곳이다 (_lib/profile-names.ts).
    // 불라방 링크(조교 화면)의 회차 목록은 _lib/live-links.ts 가 만들어 파일째 본다
    const READ = /profiles(?:!\w+)?\(|from\("profiles"\)/;
    const hits: string[] = [];
    for (const p of walk(ADMIN_DIR, (f) => /\.tsx?$/.test(f) && !f.endsWith(".test.ts"))) {
      const src = readFileSync(p, "utf8");
      const chunks = p.endsWith(join("_lib", "live-links.ts"))
        ? [src]
        : src
            .split(/export (?:default )?async function /)
            .slice(1)
            .filter((c) => c.includes("requireCrew("));
      for (const c of chunks) if (READ.test(c)) hits.push(`${p} → ${c.slice(0, c.indexOf("("))}`);
    }
    expect(hits, `조교에게 열린 곳이 profiles 를 직접 읽는다:\n${hits.join("\n")}`).toEqual([]);
  });
});

/**
 * LC 교재 · 음원은 학생에게 **내 레벨만** — 화면이 아니라 DB 가 막는다 (2026-10-03 권한 재점검).
 * 그전 정책 `is_staff() or has_term_access(null)` 은 수강 중이면 모든 레벨이라, 음원 주소(/files/audio/숫자)의 숫자만 바꾸면 다른 레벨 음원이 재생됐다.
 * 저장소 정책(lc-audio · lc-textbooks)은 이 두 표의 행이 보이는지로 판정하므로 두 표의 조회 정책이 곧 파일의 막이다.
 */
describe("LC 교재 · 음원 조회는 내 레벨로 좁힌다 (마이그레이션을 순서대로 재생한 마지막 모양)", () => {
  const DIR = "supabase/migrations";
  const sqlOf = (f: string) =>
    readFileSync(join(DIR, f), "utf8")
      .split("\n")
      .map((l) => (l.trim().startsWith("--") ? "" : l))
      .join("\n");
  const live = new Map<string, string>();
  for (const f of readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort()) {
    for (const [, verb, name, table, body] of sqlOf(f).matchAll(/(create|drop) policy (?:if exists )?"([^"]+)" on public\.(lc_books|lc_audio_tracks)([^;]*);/g)) {
      if (verb === "create") live.set(`${table} · ${name}`, body);
      else live.delete(`${table} · ${name}`);
    }
  }

  it.each(["lc_books", "lc_audio_tracks"])("%s — 학생 갈래는 my_lc_levels 를 거친다 (수강 중이라는 것만으로 열지 않는다)", (table) => {
    const selects = [...live].filter(([key, body]) => key.startsWith(`${table} ·`) && /for select/.test(body));
    expect(selects.length, `${table} 조회 정책을 못 찾았다 (문장 모양이 바뀌면 이 테스트가 헛돈다)`).toBeGreaterThan(0);
    for (const [key, body] of selects) {
      expect(body, `${key}`).toContain("private.my_lc_levels()");
      // has_term_access 는 레벨을 보지 않는다 — 이것으로 열면 모든 레벨이 다시 열린다
      expect(body, `${key}`).not.toMatch(/has_term_access|has_section_access|using\s*\(\s*true\s*\)/);
    }
  });
});
