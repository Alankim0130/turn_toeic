import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { clipToOwnRange, isContainerProgram, isTwoWeek, termHalfDate } from "./two-week";

describe("2주완성 — 앞 절반의 마지막 수업일 (ceil(N/2) 번째)", () => {
  // 2026-10 편성 예: 화목금 10/6(화) 개강 · 월수금 10/7(수) — 18일이면 9번째
  const days = (n: number) => Array.from({ length: n }, (_, i) => `2026-10-${String(6 + i).padStart(2, "0")}`);

  it("18일이면 9번째 · 19일이면 10번째 · 1일이면 그날", () => {
    expect(termHalfDate(days(18))).toBe("2026-10-14");
    expect(termHalfDate(days(19))).toBe("2026-10-15");
    expect(termHalfDate(["2026-10-06"])).toBe("2026-10-06");
  });

  it("월수금 · 화목금이 섞여 와도 날짜순으로 하루씩 센다 (같은 날은 하루)", () => {
    expect(termHalfDate(["2026-10-09", "2026-10-05", "2026-10-08", "2026-10-05", "2026-10-12", "2026-10-13", "2026-10-14"])).toBe("2026-10-09");
  });

  it("개강일 ~ 종강일 밖 수업일은 세지 않는다 · 수업일이 없으면 null", () => {
    expect(termHalfDate(["2026-10-01", "2026-10-02", "2026-10-06", "2026-10-07", "2026-11-02"], { opens: "2026-10-02", closes: "2026-10-31" })).toBe("2026-10-06");
    expect(termHalfDate([])).toBeNull();
  });

  it("그릇 과정 = 점수보장반이 아닌 것 (스파르타 · 2주완성)", () => {
    expect(isContainerProgram("score")).toBe(false);
    expect(isContainerProgram("sparta")).toBe(true);
    expect(isContainerProgram("twoweek")).toBe(true);
    expect(isContainerProgram(null)).toBe(false);
    expect(isTwoWeek("twoweek")).toBe(true);
    expect(isTwoWeek("sparta")).toBe(false);
  });
});

describe("clipToOwnRange — 품은 반의 수업일을 내 반 회차 범위로", () => {
  const sec = (id: number, term_id = 10) => ({ id, term_id });
  // 10월: 2주완성 반(1) 은 10/6 ~ 10/15 · 품은 850 12:30~13:40 반(2) 은 10/6 ~ 10/30
  const twoWeek = [
    { id: 1, date: "2026-10-06", section: sec(1) },
    { id: 2, date: "2026-10-15", section: sec(1) },
    { id: 3, date: "2026-10-06", section: sec(2) },
    { id: 4, date: "2026-10-15", section: sec(2) },
    { id: 5, date: "2026-10-16", section: sec(2) },
    { id: 6, date: "2026-10-30", section: sec(2) },
  ];

  it("2주완성: 뒤 절반(10/16 · 10/30) 품은 반 회차는 빠진다", () => {
    expect(clipToOwnRange(twoWeek, new Set([1])).map((s) => s.id)).toEqual([1, 2, 3, 4]);
  });

  it("120분 · 속성반처럼 같은 달력이면 아무것도 빠지지 않는다", () => {
    const pkg = [
      { id: 1, date: "2026-10-06", section: sec(1) },
      { id: 2, date: "2026-10-30", section: sec(1) },
      { id: 3, date: "2026-10-06", section: sec(2) },
      { id: 4, date: "2026-10-30", section: sec(2) },
    ];
    expect(clipToOwnRange(pkg, new Set([1]))).toHaveLength(4);
  });

  it("내 반 회차가 없는 기수 · 등록을 못 읽었으면 자르지 않는다", () => {
    expect(clipToOwnRange(twoWeek, new Set())).toHaveLength(6);
    const other = [...twoWeek, { id: 7, date: "2026-11-20", section: sec(9, 11) }];
    expect(clipToOwnRange(other, new Set([1])).map((s) => s.id)).toEqual([1, 2, 3, 4, 7]);
  });
});

/** DB 가 같은 규칙인지 — 마이그레이션을 파일 순서대로 읽어 마지막 모양을 꺼낸다 */
describe("DB 도 같은 규칙이다 (마이그레이션 재생한 마지막 모양)", () => {
  const DIR = "supabase/migrations";
  const sql = readdirSync(DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(join(DIR, f), "utf8"))
    .join("\n");
  const last = (re: RegExp) => ([...sql.matchAll(re)].at(-1)?.[0] ?? "").replace(/\s+/g, " ");

  it("앞 절반 = ceil(N/2) 번째, 개강일 ~ 종강일 안 수업일", () => {
    const fn = last(/create or replace function private\.term_half_date[\s\S]*?\$\$;/gi);
    expect(fn).toContain("x.rn = ceil(x.n / 2.0)");
    expect(fn).toContain("c.date >= t.enrollment_opens_at");
    expect(fn).toContain("c.date <= t.closes_at");
  });

  it("2주완성 반: 종강일 = 앞 절반 마지막 날 · 회차는 개강일부터 그날까지", () => {
    const fn = last(/create or replace function private\.sync_section_schedule[\s\S]*?\$function\$;/gi);
    expect(fn).toContain("if v_program = 'twoweek' then v_closes := coalesce(private.term_half_date(v_term_id), v_opens);");
    expect(fn).toContain("(v_program is distinct from 'twoweek' or (d.date >= v_opens and d.date <= v_closes))");
  });

  it("2주완성 반은 같은 레벨 점수보장반의 시간 단위 반을 품는다 (묶음 반은 건너뛴다)", () => {
    const fn = last(/create or replace function private\.section_includes[\s\S]*?\$\$;/gi);
    expect(fn).toContain("pc.program = 'twoweek' and cc.program = 'score' and cc.target_score = pc.target_score and private.time_block_contains(p.time_block, c.time_block) and not private.is_package_section(c.id)");
  });

  it("담당 강사: 점수보장반이 아닌 과정은 그릇이라 비운다", () => {
    expect(last(/create or replace function private\.section_instructor_plan[\s\S]*?\$fn\$;/gi)).toContain("(c.program <> 'score' or private.is_package_section(cs.id)) as pkg");
  });
});
