import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ASSISTANT_MARK, hiddenFromRoster, isAssistantAccount, ROSTER_HIDDEN_ROLES } from "./roster-accounts";

/**
 * 명단 규칙 — 강사 · 관리자 계정은 빼고 조교 계정은 `조교` 로 (2026-10-16 Alan "명단에서 강사랑 관리자는 제외하고
 * 수업이 설정되어 있는 조교는 조교라고 표시도 부탁해"). 학생명단 반별 · 레벨별 명단 · 숙제 미제출 명단 · 출석 명단이 같은 규칙을 쓰는지 본다.
 */
describe("명단에 누가 서나 — 강사 · 관리자는 빼고 조교는 표시", () => {
  it("빼는 등급은 강사 · 관리자뿐 — 조교 · 학생 · 회원 · 졸업생은 선다", () => {
    expect([...ROSTER_HIDDEN_ROLES]).toEqual(["instructor", "admin"]);
    expect(hiddenFromRoster("instructor")).toBe(true);
    expect(hiddenFromRoster("admin")).toBe(true);
    for (const role of ["assistant", "student", "member", "alumni", null, undefined]) expect(hiddenFromRoster(role), String(role)).toBe(false);
  });

  it("조교 계정만 표시가 붙는다", () => {
    expect(isAssistantAccount("assistant")).toBe(true);
    for (const role of ["instructor", "admin", "student", null]) expect(isAssistantAccount(role), String(role)).toBe(false);
    expect(ASSISTANT_MARK).toBe("조교");
  });

  it("학생명단 반별 명단 · 숙제 미제출 명단은 이 규칙 한곳을 쓴다 — 저마다 등급 목록을 두지 않는다", () => {
    for (const file of ["src/app/admin/students/_lib/class-roster.ts", "src/app/admin/homework/_lib/missing.ts"]) {
      const src = readFileSync(join(process.cwd(), file), "utf8");
      expect(src, file).toContain('from "@/lib/roster-accounts"');
      expect(src, file).toContain("hiddenFromRoster(role)");
      expect(src, file).toContain("isAssistantAccount(role)");
      // 2026-10-08 ~ 10-15 의 `STAFF_ROLES = new Set(["instructor", "admin", "assistant"])` 가 되살아나지 않게
      expect(src, file).not.toMatch(/["']admin["'],\s*["']assistant["']/);
    }
  });
});

describe("출석 명단 DB 함수 — 마지막 정의가 같은 규칙", () => {
  const DIR = "supabase/migrations";
  const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
  /** 그 함수를 마지막으로 정의한 create 문 (본문 끝 `$$;` 까지) */
  const lastDef = (name: string) => {
    const re = () => new RegExp(`create (or replace )?function public\\.${name}\\(`, "g");
    const f = [...files].reverse().find((x) => re().test(readFileSync(join(DIR, x), "utf8")));
    expect(f, name).toBeDefined();
    const sql = readFileSync(join(DIR, f!), "utf8");
    const start = [...sql.matchAll(re())].at(-1)!.index;
    return sql.slice(start, sql.indexOf("\n$$;", start));
  };

  for (const name of ["attendance_roster", "attendance_term_board"]) {
    it(`${name} — 강사 · 관리자 줄은 돌려주지 않고 조교는 assistant 칸으로`, () => {
      const body = lastDef(name);
      expect(body).toMatch(/returns table \([^)]*\bassistant boolean/);
      expect(body).not.toMatch(/\btester boolean/);
      expect(body).toContain("p.role = 'assistant'");
      expect(body).toContain("and p.role not in ('instructor', 'admin')");
      // 예전 `테스터` 판정 — 강사 · 관리자 · 조교 · 테스트 등급을 한데 묶었다
      expect(body).not.toContain("p.test_role is not null or p.role in");
    });
  }
});
