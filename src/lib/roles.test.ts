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
 * LC 교재 · 음원 · 수업자료실은 학생에게 **내 반의 과정 칸, 그 회차 수업일부터** — 화면이 아니라 DB 가 막는다
 * (2026-10-03 권한 재점검 → 2026-10-05 Alan "RC단과 학생들은 음원파일과 LC수업자료실에 접근 안되는거 맞지?" 로 과목까지 →
 * 같은 날 "LC음원듣기와 자료게시판도 수업날짜에 맞춰서 오픈 … 해당 날짜가 안되면 잠금" 으로 과정 · 회차 수업일까지).
 * 그전 정책 `is_staff() or has_term_access(null)` 은 수강 중이면 모든 레벨이라, 음원 주소(/files/audio/숫자)의 숫자만 바꾸면 다른 레벨 음원이 재생됐다.
 * 저장소 정책(lc-audio · lc-textbooks · class-materials)은 이 표들의 행이 보이는지로 판정하므로 조회 정책이 곧 파일의 막이다.
 */
describe("LC 교재 · 음원 · 수업자료실 조회는 내 과정 칸 · 열린 회차로 좁힌다 (마이그레이션을 순서대로 재생한 마지막 모양)", () => {
  const DIR = "supabase/migrations";
  const sqlOf = (f: string) =>
    readFileSync(join(DIR, f), "utf8")
      .split("\n")
      .map((l) => (l.trim().startsWith("--") ? "" : l))
      .join("\n");
  const live = new Map<string, string>();
  for (const f of readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort()) {
    for (const [, verb, name, table, body] of sqlOf(f).matchAll(/(create|drop) policy (?:if exists )?"([^"]+)" on public\.(lc_books|lc_audio_tracks|class_materials|class_material_files)([^;]*);/g)) {
      if (verb === "create") live.set(`${table} · ${name}`, body);
      else live.delete(`${table} · ${name}`);
    }
  }

  const selectsOf = (table: string) => {
    const selects = [...live].filter(([key, body]) => key.startsWith(`${table} ·`) && /for select/.test(body));
    expect(selects.length, `${table} 조회 정책을 못 찾았다 (문장 모양이 바뀌면 이 테스트가 헛돈다)`).toBeGreaterThan(0);
    for (const [key, body] of selects) {
      // has_term_access 는 레벨도 과목도 날짜도 보지 않는다 — 이것으로 열면 모든 레벨 · 모든 회차가 다시 열린다
      expect(body, `${key}`).not.toMatch(/has_term_access|has_section_access|using\s*\(\s*true\s*\)/);
      // 레벨만 · 과목만 보는 옛 갈래가 남으면 수업일 전 음원 · 자료가 다시 열린다
      expect(body, `${key}`).not.toMatch(/my_lc_levels|my_subject_levels/);
    }
    return selects;
  };

  it("lc_books — 학생 갈래는 내 LC 과정 칸(my_round_cells — 그 교재를 쓰는 내 반이 있다)을 거친다", () => {
    for (const [key, body] of selectsOf("lc_books")) {
      expect(body.replace(/\s+/g, " "), `${key}`).toContain("array[format('%s:lc:%s', level, book_set)] <@ (select private.my_round_cells())");
    }
  });

  it("lc_audio_tracks — 학생 갈래는 열린 회차(my_open_rounds — 그 강의 내 수업일이 지났다)를 거친다", () => {
    for (const [key, body] of selectsOf("lc_audio_tracks")) {
      expect(body.replace(/\s+/g, " "), `${key}`).toContain("array[format('%s:lc:%s:%s', b.level, b.book_set, lc_audio_tracks.day)] <@ (select private.my_open_rounds())");
    }
  });

  it("class_materials — 자료의 레벨 · 과목 · 과정 · 회차가 열린 회차여야 한다 (과정 · 회차가 없는 자료는 학생에게 닫힌다)", () => {
    for (const [key, body] of selectsOf("class_materials")) {
      const flat = body.replace(/\s+/g, " ");
      expect(flat, `${key}`).toContain("book_set is not null and seq is not null");
      expect(flat, `${key}`).toContain("array[format('%s:%s:%s:%s', level, subject, book_set, seq)] <@ (select private.my_open_rounds())");
    }
  });

  it("class_material_files — 파일 행은 부모 자료가 보일 때만 (2026-10-06 — 자료 하나에 파일 여러 개). 그래야 위 열린 회차 규칙이 파일에도 걸린다", () => {
    for (const [key, body] of selectsOf("class_material_files")) {
      expect(body.replace(/\s+/g, " "), `${key}`).toContain("exists (select 1 from public.class_materials m where m.id = class_material_files.material_id)");
    }
    // 쓰기는 강사·관리자만 (조교 화면이 아니다)
    const writes = [...live].filter(([key, body]) => key.startsWith("class_material_files ·") && /for (insert|update|delete)/.test(body));
    expect(writes.length).toBe(3);
    for (const [key, body] of writes) expect(body, key).toMatch(/^[^]*private\.is_staff\(\)[^]*$/);
  });

  it("저장소 class-materials — 강사·관리자, 아니면 보이는 파일 행이 있어야 서명 URL 이 나온다 (2026-10-06)", () => {
    const storage = new Map<string, string>();
    for (const f of readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort()) {
      for (const [, verb, name, body] of sqlOf(f).matchAll(/(create|drop) policy (?:if exists )?"(class-materials:[^"]+)" on storage\.objects([^;]*);/g)) {
        if (verb === "create") storage.set(name, body);
        else storage.delete(name);
      }
    }
    const selects = [...storage].filter(([, body]) => /for select/.test(body));
    expect(selects.length, "class-materials 저장소 조회 정책을 못 찾았다").toBe(1);
    const flat = selects[0][1].replace(/\s+/g, " ");
    expect(flat).toContain("bucket_id = 'class-materials'");
    expect(flat).toContain("(select private.is_staff())");
    expect(flat).toContain("exists (select 1 from public.class_material_files f where f.file_path = objects.name)");
    expect(flat).not.toMatch(/has_term_access|has_section_access|using\s*\(\s*true\s*\)/);
    // 옛 갈래(class_materials.file_path)는 20261006110000 이 뺐다 — 그 칸은 지워졌다
    expect(flat).not.toContain("public.class_materials m where m.file_path");
  });

  /** 함수는 마지막 create or replace 가 진짜다 */
  const fnBody = (name: string) => {
    let body = "";
    for (const f of readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort()) {
      for (const m of sqlOf(f).matchAll(new RegExp(`create or replace function private\\.${name}\\([^)]*\\)[\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$`, "g"))) body = m[1];
    }
    expect(body, `private.${name} 를 못 찾았다`).not.toBe("");
    return body.replace(/\s+/g, " ");
  };

  it.each(["my_round_cells", "my_open_rounds"])("%s — 내 반(my_section_ids)의 과정 칸, 과목 칸이 빈 반은 두 과목, 과정 없는 반(묶음 · 속성반)은 뺀다", (name) => {
    const body = fnBody(name);
    expect(body).toContain("public.my_section_ids()");
    expect(body).toContain("case when s.subject is null then array['rc', 'lc'] else array[s.subject] end");
    expect(body).toContain("s.book_set is not null");
    // 테스트 등급을 켠 스태프는 그 등급으로 — 등급 조건이 빠지면 회원(member)에게도 열린다
    expect(body).toContain("(select private.user_role()) in ('student', 'instructor', 'admin', 'assistant')");
  });

  it("my_open_rounds — 그 회차 수업일이 오늘(KST)이거나 지났다", () => {
    expect(fnBody("my_open_rounds")).toContain("d.date <= private.today_kst()");
  });
});

/**
 * 조교가 숙제를 점검해도 학생 알림에는 **그 과목 선생님 이름** (2026-10-08 Alan — "지금 조교가 숙제검사했을때 조교가 했다고 알림이 가고 있어!
 * 이러면 안되잖아 으휴. 조교가 했다고 알림가는거 빨리 없애줘"). 학생 알림함은 보낸 이름을 "○○○ 선생님" 으로 그린다.
 * 이름은 DB 트리거 한곳이 정한다. RLS 의 with check 는 BEFORE 트리거가 고친 행을 보므로, 조교 발송 정책이 숙제 알림에서도
 * "보낸 이름 = 자기 이름" 을 요구하면 **조교의 숙제 알림이 통째로 막힌다** — 그 모양으로 되돌리지 말 것.
 */
describe("조교의 숙제 점검 알림에 조교 이름이 남지 않는다 (마이그레이션을 순서대로 재생한 마지막 모양)", () => {
  const DIR = "supabase/migrations";
  const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
  const sqlOf = (f: string) =>
    readFileSync(join(DIR, f), "utf8")
      .split("\n")
      .map((l) => (l.trim().startsWith("--") ? "" : l))
      .join("\n");

  it("트리거가 살아 있다 — 보낸 사람이 강사가 아닌(조교 · 관리자) homework_checked 는 이름을 그 과목 선생님(homework_notice_teacher)으로", () => {
    let alive = false;
    let fn = "";
    for (const f of files) {
      const sql = sqlOf(f);
      for (const m of sql.matchAll(/(create|drop) trigger (?:if exists )?student_messages_homework_sender\b([^;]*);/g)) {
        alive = m[1] === "create" && /before insert on public\.student_messages/.test(m[2]);
      }
      for (const m of sql.matchAll(/create or replace function private\.student_messages_homework_sender\(\)[\s\S]*?\$\$([\s\S]*?)\$\$/g)) fn = m[1];
    }
    expect(alive, "student_messages_homework_sender 트리거(before insert)가 없다").toBe(true);
    const body = fn.replace(/\s+/g, " ");
    expect(body).toContain("new.kind = 'homework_checked'");
    // 2026-10-08 저녁 — 조교 등급만 보던 낮의 규칙은 관리자 등급을 받은 조교(윤혜원)에게 안 걸렸다. 강사(과목이 있는 사람)가 아니면 전부
    expect(body).toContain("p.id = new.sender_id and p.role <> 'instructor'");
    expect(body).not.toContain("p.role = 'assistant'");
    expect(body).toContain("new.sender_name := private.homework_notice_teacher(new.related)");
  });

  it("조교 발송 정책 — 숙제 갈래는 이름 대신 '그 학생의 점검된 숙제' 를 보고, 자기 이름 조건은 비대면 독촉에만", () => {
    const live = new Map<string, string>();
    for (const f of files) {
      for (const [, verb, name, body] of sqlOf(f).matchAll(/(create|drop) policy (?:if exists )?"([^"]+)" on public\.student_messages([^;]*);/g)) {
        if (verb === "create") live.set(name, body.replace(/\s+/g, " "));
        else live.delete(name);
      }
    }
    const crew = [...live].filter(([, body]) => /private\.is_assistant\(\)/.test(body) && /for insert/.test(body));
    expect(crew.length, "조교가 학생 알림을 넣는 정책을 못 찾았다").toBe(1);
    const body = crew[0][1];
    expect(body).toContain("(kind = 'homework_checked' and private.homework_notice_ok(related, user_id))");
    expect(body).toContain("(kind = 'study_checkin' and sender_name = (select private.my_profile_name()))");
    // 두 종류를 묶어 자기 이름을 요구하던 2026-10-03 모양 — 트리거가 바꾼 이름이 걸려 숙제 알림이 막힌다
    expect(body).not.toMatch(/kind in \(/);
  });

  it("점검완료 알림은 앱의 checkHomework 가 보낸다 — 넣는 길이 그대로여야 트리거가 받는다", () => {
    const src = readFileSync("src/app/admin/homework/actions.ts", "utf8");
    expect(src).toContain('kind: "homework_checked"');
    expect(src).toContain("related: { submissionId: s.id }");
  });
});

/**
 * 비대면스터디 인증 게시판 (2026-10-08 Alan — "비대면 스터디도 숙제 점검 처럼 게시판이 필요합니당~ "비대면스터디 인증" 카테고리 하나 만들어줘").
 * 스터디는 조교가 운영하므로 조교도 사진을 보고 확인 완료한다. 확인 알림에 **조교 이름이 남지 않는다** (숙제 알림과 같은 까닭).
 */
describe("비대면스터디 인증 게시판 — 조교도 확인하고, 알림에 조교 이름이 없다 (마이그레이션을 순서대로 재생한 마지막 모양)", () => {
  const DIR = "supabase/migrations";
  const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
  const sqlOf = (f: string) =>
    readFileSync(join(DIR, f), "utf8")
      .split("\n")
      .map((l) => (l.trim().startsWith("--") ? "" : l))
      .join("\n");
  const livePolicies = (table: string) => {
    const live = new Map<string, string>();
    const re = new RegExp(`(create|drop) policy (?:if exists )?"([^"]+)" on ${table.replace(".", "\\.")}([^;]*);`, "g");
    for (const f of files) {
      for (const [, verb, name, body] of sqlOf(f).matchAll(re)) {
        if (verb === "create") live.set(name, body.replace(/\s+/g, " "));
        else live.delete(name);
      }
    }
    return live;
  };

  it("확인(update)은 스태프 · 조교만, 학생이 지우는 것은 확인 전 인증만 (사진 줄도)", () => {
    const checkins = livePolicies("public.study_checkins");
    const updates = [...checkins].filter(([, b]) => /for update/.test(b));
    expect(updates.map(([n]) => n)).toEqual(["study_checkins: 스태프·조교 확인"]);
    expect(updates[0][1]).toContain("private.is_crew()");
    const del = [...checkins].filter(([, b]) => /for delete/.test(b));
    expect(del.length).toBe(1);
    expect(del[0][1]).toContain("status = 'submitted'");
    const fileDel = [...livePolicies("public.study_checkin_files")].filter(([, b]) => /for delete/.test(b));
    expect(fileDel.length).toBe(1);
    expect(fileDel[0][1]).toContain("c.status = 'submitted'");
  });

  it("조교 발송 정책 — 인증 확인 알림은 '받는 학생의 확인된 인증' 일 때만", () => {
    const crew = [...livePolicies("public.student_messages")].filter(([, b]) => /private\.is_assistant\(\)/.test(b) && /for insert/.test(b));
    expect(crew.length).toBe(1);
    expect(crew[0][1]).toContain("(kind = 'study_checked' and private.study_checkin_notice_ok(related, user_id))");
    let fn = "";
    for (const f of files) for (const m of sqlOf(f).matchAll(/create or replace function private\.study_checkin_notice_ok\([\s\S]*?\$\$([\s\S]*?)\$\$/g)) fn = m[1];
    const body = fn.replace(/\s+/g, " ");
    expect(body).toContain("c.user_id = p_user_id");
    expect(body).toContain("c.status = 'checked'");
  });

  it("트리거가 살아 있다 — 보낸 사람이 강사가 아닌(조교 · 관리자) study_checked 는 이름을 비운다", () => {
    let alive = false;
    let fn = "";
    for (const f of files) {
      const sql = sqlOf(f);
      for (const m of sql.matchAll(/(create|drop) trigger (?:if exists )?student_messages_study_sender\b([^;]*);/g)) {
        alive = m[1] === "create" && /before insert on public\.student_messages/.test(m[2]);
      }
      for (const m of sql.matchAll(/create or replace function private\.student_messages_study_sender\(\)[\s\S]*?\$\$([\s\S]*?)\$\$/g)) fn = m[1];
    }
    expect(alive, "student_messages_study_sender 트리거(before insert)가 없다").toBe(true);
    const body = fn.replace(/\s+/g, " ");
    expect(body).toContain("new.kind = 'study_checked'");
    expect(body).toContain("p.id = new.sender_id and p.role <> 'instructor'");
    expect(body).not.toContain("p.role = 'assistant'");
    expect(body).toContain("new.sender_name := ''");
  });

  it("인증 사진(저장소 study-checkins)은 본인 · 스태프 · 조교만 — 조교 세션으로도 서명 주소가 나온다", () => {
    const live = new Map<string, string>();
    for (const f of files) {
      for (const [, verb, name, body] of sqlOf(f).matchAll(/(create|drop) policy (?:if exists )?"([^"]+)" on storage\.objects([^;]*);/g)) {
        if (!name.startsWith("study-checkins")) continue;
        if (verb === "create") live.set(name, body.replace(/\s+/g, " "));
        else live.delete(name);
      }
    }
    const selects = [...live].filter(([, b]) => /for select/.test(b));
    expect(selects.map(([n]) => n)).toEqual(["study-checkins: 본인·스태프·조교 조회"]);
    expect(selects[0][1]).toContain("private.is_crew()");
    expect(selects[0][1]).toContain("(storage.foldername(name))[1] = (select auth.uid())::text");
  });
});

/**
 * 숙제 미제출 알림 (2026-10-08 Alan — "안한사람은 일괄선택해서 알림메시지도 보낼 수 있으면 좋겠어" · "조교도 보낸다").
 * 조교가 보내도 학생에게는 **안 낸 과목의 선생님 이름**으로 간다 (점검완료 알림과 같은 까닭 — "조교가 했다고 알림가는거 빨리 없애줘").
 * 조교 갈래는 **받는 학생이 그 기수 반에 배정된 학생일 때만** — 선생님 이름이 붙는 알림을 아무 회원에게나 보내지 못하게.
 */
describe("숙제 미제출 알림 — 조교도 보내고, 학생에게 조교 이름이 가지 않는다 (마이그레이션을 순서대로 재생한 마지막 모양)", () => {
  const DIR = "supabase/migrations";
  const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
  const sqlOf = (f: string) =>
    readFileSync(join(DIR, f), "utf8")
      .split("\n")
      .map((l) => (l.trim().startsWith("--") ? "" : l))
      .join("\n");
  const lastFn = (name: string) => {
    let fn = "";
    const re = new RegExp(`create or replace function ${name.replace(".", "\\.")}\\([\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$`, "g");
    for (const f of files) for (const m of sqlOf(f).matchAll(re)) fn = m[1];
    return fn.replace(/\s+/g, " ");
  };

  it("조교 발송 정책 — 미제출 알림은 '그 기수 반에 배정된 학생' 일 때만, 이름 조건 없이 (트리거가 이름을 바꾼다)", () => {
    const live = new Map<string, string>();
    for (const f of files) {
      for (const [, verb, name, body] of sqlOf(f).matchAll(/(create|drop) policy (?:if exists )?"([^"]+)" on public\.student_messages([^;]*);/g)) {
        if (verb === "create") live.set(name, body.replace(/\s+/g, " "));
        else live.delete(name);
      }
    }
    const crew = [...live].filter(([, b]) => /private\.is_assistant\(\)/.test(b) && /for insert/.test(b));
    expect(crew.length).toBe(1);
    expect(crew[0][1]).toContain("(kind = 'homework_missing' and private.homework_missing_notice_ok(related, user_id))");
    // 앞서 연 세 갈래도 그대로다
    expect(crew[0][1]).toContain("(kind = 'homework_checked' and private.homework_notice_ok(related, user_id))");
    expect(crew[0][1]).toContain("(kind = 'study_checked' and private.study_checkin_notice_ok(related, user_id))");
    const ok = lastFn("private.homework_missing_notice_ok");
    expect(ok).toContain("e.student_id = p_user_id");
    expect(ok).toContain("s.term_id = private.homework_missing_term(p_related)");
  });

  it("트리거가 살아 있다 — 보낸 사람이 강사가 아닌(조교 · 관리자) homework_missing 은 이름을 안 낸 과목의 선생님으로", () => {
    let alive = false;
    for (const f of files) {
      for (const m of sqlOf(f).matchAll(/(create|drop) trigger (?:if exists )?student_messages_homework_missing_sender\b([^;]*);/g)) {
        alive = m[1] === "create" && /before insert on public\.student_messages/.test(m[2]);
      }
    }
    expect(alive, "student_messages_homework_missing_sender 트리거(before insert)가 없다").toBe(true);
    const body = lastFn("private.student_messages_homework_missing_sender");
    expect(body).toContain("new.kind = 'homework_missing'");
    expect(body).toContain("p.id = new.sender_id and p.role <> 'instructor'");
    expect(body).not.toContain("p.role = 'assistant'");
    expect(body).toContain("new.sender_name := private.homework_missing_teacher(new.related)");
    // 선생님 이름은 과목 칸(profiles.subject)에서 — RC 먼저, 합쳐진 옛 계정은 빼고
    const teacher = lastFn("private.homework_missing_teacher");
    expect(teacher).toContain("(values ('rc', 1), ('lc', 2))");
    expect(teacher).toContain("i.subject = s.subject and i.merged_into is null");
  });

  it("보낸 시각 함수는 강사 · 관리자 · 조교만, 시각만 준다 (알림 내용 · 개인정보 칸 없음)", () => {
    let fn = "";
    for (const f of files) for (const m of sqlOf(f).matchAll(/create or replace function public\.homework_missing_notices\(([\s\S]*?)\$\$([\s\S]*?)\$\$/g)) fn = m[1] + m[2];
    const body = fn.replace(/\s+/g, " ");
    expect(body).toContain("returns table (user_id uuid, level integer, sent_at timestamptz)");
    expect(body).toContain("if not private.is_crew() then raise exception 'forbidden'");
  });

  it("보내는 것은 앱의 서버 액션이다 — 서버가 다시 세어 글을 만들고 kind 는 homework_missing", () => {
    const src = readFileSync("src/app/admin/homework/missing/actions.ts", "utf8");
    expect(src).toContain("requireCrew(");
    expect(src).toContain('kind: "homework_missing"');
    expect(src).toContain("buildMissingBoard(");
    expect(src).toContain("homeworkMissingMessage(");
  });
});
