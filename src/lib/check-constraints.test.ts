import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * **표의 검사 규칙(check)에서 private 함수를 부르지 않는다** (2026-11-25 — 마이그레이션 20261125100000).
 * 검사 규칙 안의 함수는 **넣거나 고치는 사람의 권한으로** 돈다. private 스키마 함수는 기본으로 아무에게도 실행 권한이 없어서
 * (`alter default privileges … in schema private revoke execute on functions from public` — 서버 service_role 도 없다),
 * 20261105100000 이 class_sections 검사에 private.time_block_start 를 넣은 날부터 강사 · 관리자 · 서버의 반 넣기 · 고치기가 전부
 * `permission denied for function`(42501)로 실패했고 12월 반이 저절로 열리지 않았다 (화면에는 "권한이 없다"). 재생 DB 로 재현.
 * 같은 뜻을 함수 없이 적는다 — 꼭 함수를 써야 하면 public 에 두고 authenticated · service_role 에 실행 권한을 함께 준다.
 */
const DIR = "supabase/migrations";
const stripComments = (sql: string) =>
  sql
    .split("\n")
    .map((l) => l.replace(/--.*$/, ""))
    .join("\n");

describe("검사 규칙 — 넣는 사람이 실행할 수 없는 private 함수를 부르지 않는다", () => {
  it("이름마다 마지막으로 더한 check 의 private 함수는 authenticated · service_role 에 실행 권한이 있다", () => {
    const files = readdirSync(DIR).filter((x) => x.endsWith(".sql")).sort();
    const last = new Map<string, { file: string; body: string }>();
    // 함수마다 마지막 grant / revoke — 두 역할이 모두 실행할 수 있나
    const canRun = new Map<string, { auth: boolean; svc: boolean }>();
    for (const f of files) {
      const sql = stripComments(readFileSync(join(DIR, f), "utf8"));
      for (const m of sql.matchAll(/(grant|revoke)\s+(?:execute|all)\s+on\s+function\s+([\s\S]*?)\s+(to|from)\s+([^;]+);/gi)) {
        const grant = m[1].toLowerCase() === "grant";
        const roles = m[4].toLowerCase();
        for (const fn of m[2].matchAll(/private\.([a-z0-9_]+)/gi)) {
          const cur = canRun.get(fn[1]) ?? { auth: false, svc: false };
          if (/\bauthenticated\b/.test(roles) || (!grant && /\bpublic\b/.test(roles))) cur.auth = grant;
          if (/\bservice_role\b/.test(roles)) cur.svc = grant;
          canRun.set(fn[1], cur);
        }
      }
      for (const m of sql.matchAll(/add constraint\s+([a-z0-9_]+)\s+check\s*\(([\s\S]*?);/gi)) last.set(m[1], { file: f, body: m[2] });
    }
    expect(last.size).toBeGreaterThan(10);
    const bad: string[] = [];
    for (const [name, v] of last) {
      for (const fn of v.body.matchAll(/\bprivate\.([a-z0-9_]+)\s*\(/gi)) {
        const r = canRun.get(fn[1]);
        if (!r?.auth || !r.svc) bad.push(`${v.file} → ${name} → private.${fn[1]}`);
      }
    }
    expect(bad, `검사 규칙이 실행 권한 없는 private 함수를 부른다:\n${bad.join("\n")}`).toEqual([]);
  });

  it("class_sections 뒤 교시 시작 검사는 함수 없이 같은 뜻 — 라벨이 HH:MM~HH:MM 일 때만 시작 < 뒤 교시 < 끝", () => {
    const sql = readFileSync(join(DIR, "20261125100000_section_check_no_private_fn.sql"), "utf8");
    expect(sql).toContain("add constraint class_sections_second_start_check");
    expect(sql).toContain("when second_start is null or time_block is null then true");
    expect(sql).toContain("then second_start > split_part(time_block, '~', 1)::time and second_start < split_part(time_block, '~', 2)::time");
  });
});
