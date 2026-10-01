import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 마이그레이션은 `main` 에 머지되는 순간 운영 DB 에 자동 적용된다 (CLAUDE.md 기술 스택).
 * **없는 정책을 drop 하면 그 배포가 통째로 실패한다** — 실제로 2026-09-19 에
 * `drop policy "verifications: 스태프 조회"` 를 쓸 뻔했는데, 그 이름은 이미
 * 20260915045300 에서 `"verifications: 본인·스태프 조회"` 로 합쳐져 사라진 뒤였다.
 *
 * 그래서 마이그레이션을 파일 이름 순서대로 재생해 **그 시점에 살아 있는 정책**을 따라가며
 * drop 이 실제로 맞는 이름을 가리키는지 본다. `drop policy if exists` 는 봐준다
 * (일부러 있을 수도 없을 수도 있는 경우).
 */
const DIR = "supabase/migrations";

/** 주석(-- …)을 뺀 본문 — 주석 속 정책 이름에 속지 않는다 */
const stripComments = (sql: string) =>
  sql
    .split("\n")
    .map((l) => (l.trim().startsWith("--") ? "" : l))
    .join("\n");

describe("마이그레이션 — 없는 정책을 drop 하지 않는다", () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();

  it("파일을 찾았다 (경로가 바뀌면 이 테스트가 헛돈다)", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it("모든 drop policy 가 그 시점에 있는 정책을 가리킨다", () => {
    const live = new Set<string>();
    const missing: string[] = [];

    for (const f of files) {
      const body = stripComments(readFileSync(join(DIR, f), "utf8"));
      // 한 파일 안에서도 순서대로 본다 (drop → create 를 같은 파일에서 하는 경우가 많다)
      for (const m of body.matchAll(/(drop|create) policy (if exists )?"([^"]+)" on ([\w.]+)/g)) {
        const [, verb, ifExists, name, table] = m;
        const key = `${table} :: ${name}`;
        if (verb === "create") live.add(key);
        else {
          if (!ifExists && !live.has(key)) missing.push(`${f} → ${key}`);
          live.delete(key);
        }
      }
    }

    expect(missing, `없는 정책을 drop 한다:\n${missing.join("\n")}`).toEqual([]);
  });
});

describe("마이그레이션 — 버전 번호(파일 이름 앞 14자리)가 겹치지 않는다", () => {
  // Supabase 는 버전 번호로 적용 여부를 기억한다. 같은 번호의 파일이 둘이면 먼저 적용된 쪽만 남고 **다른 쪽은 조용히 건너뛴다** —
  // 2026-10-01 에 실제로 20261001130000 이 두 파일(ybm_review_stats · youtube_stream_replay)에 붙어 뒤 것이 운영에 적용되지 않은 채
  // 코드만 배포됐다 (반 상세 수업일 표가 빈 채로 떴다). 파일을 만들 때 마지막 번호를 보고 그보다 뒤 번호를 쓸 것
  const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();

  it("같은 번호의 파일이 둘 이상 없다", () => {
    const byVersion = new Map<string, string[]>();
    for (const f of files) {
      const v = f.slice(0, 14);
      byVersion.set(v, [...(byVersion.get(v) ?? []), f]);
    }
    const dup = [...byVersion.entries()].filter(([, fs]) => fs.length > 1).map(([v, fs]) => `${v}: ${fs.join(", ")}`);
    expect(dup, `버전이 겹친다 — 뒤 파일은 운영에 적용되지 않는다:\n${dup.join("\n")}`).toEqual([]);
  });
});
