import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { courseLevelLabel, courseShortName, isSpartaProgram, levelTitle, PROGRAMS } from "./timetable";
import { fieldsFor, kindOf } from "./timetable-month";

/**
 * **합반 속성반(`combo`)** — 2026-11-24 Alan "방학에는 650+750 속성반이 하나 더 있어! 새로운 등급을 하나만 더 만들어줘" (마이그레이션 20261124100000).
 * 스파르타반과 같은 속성반(포함 레벨의 시간 단위 반을 품는다)인데, 650 스파르타에는 이미 중급속성이 있어 (레벨 × 과정) 열쇠가 겹치므로 과정을 따로 둔다.
 */
const DIR = "supabase/migrations";
const migrations = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
/** 그 이름이 마지막으로 나오는 마이그레이션 본문 */
const lastWith = (needle: string) => {
  const f = [...migrations].reverse().find((m) => readFileSync(join(DIR, m), "utf8").includes(needle));
  return f ? readFileSync(join(DIR, f), "utf8") : "";
};

describe("합반 속성반 — 과정 값", () => {
  it("앱의 과정 목록과 DB check 두 곳이 같다", () => {
    for (const name of ["courses_program_check", "timetable_slots_program_check"]) {
      const sql = lastWith(`add constraint ${name}`);
      const m = sql.match(new RegExp(`add constraint ${name}\\s*check \\(program = any \\(array\\[([^\\]]+)\\]\\)\\)`));
      expect(m, name).not.toBeNull();
      const values = m![1].split(",").map((v) => v.trim().replace(/'/g, ""));
      expect(new Set(values), name).toEqual(new Set(PROGRAMS));
    }
  });

  it("속성반은 스파르타와 합반 둘 — 함께 듣는 레벨도 둘만 가진다", () => {
    expect(isSpartaProgram("sparta")).toBe(true);
    expect(isSpartaProgram("combo")).toBe(true);
    expect(isSpartaProgram("score")).toBe(false);
    expect(isSpartaProgram("twoweek")).toBe(false);
    expect(isSpartaProgram(null)).toBe(false);
    expect(lastWith("add constraint courses_sparta_includes_levels")).toContain("check ((program in ('sparta', 'combo')) = (cardinality(includes_levels) > 0))");
  });

  it("반 권한(DB section_includes)의 스파르타 갈래가 합반도 연다", () => {
    const sql = lastWith("function private.section_includes");
    expect(sql).toContain("(pc.program in ('sparta', 'combo') and cc.program = 'score'");
    // 나머지 갈래는 그대로
    expect(sql).toContain("(pc.program = 'score' and cc.id = pc.id and private.time_block_contains(p.time_block, c.time_block))");
    expect(sql).toContain("(pc.program = 'twoweek' and cc.program = 'score'");
  });

  it("강좌는 레벨 650 + 포함 750, 없을 때만 넣는다", () => {
    const sql = readFileSync(join(DIR, "20261124100000_combo_program.sql"), "utf8");
    expect(sql).toMatch(/select 'COMBO650750', '스파르타 650\+750 속성반', 'full', 650, 'combo', array\[750\]\s*where not exists/);
  });
});

describe("합반 속성반 — 이름", () => {
  it("레벨 사슬이 이름이다 — `650+750 속성반` (앞 레벨만 떼어 `750 속성반` 이 되지 않는다)", () => {
    expect(courseShortName("스파르타 650+750 속성반")).toBe("650+750 속성반");
    expect(courseLevelLabel({ name: "스파르타 650+750 속성반", program: "combo", target_score: 650 })).toBe("650+750 속성반");
    expect(levelTitle(650, "650+750 속성반")).toBe("650+750 속성반");
  });

  it("다른 속성반 · 2주완성 이름은 그대로", () => {
    expect(courseShortName("스파르타 650+ 중급속성")).toBe("중급속성");
    expect(courseShortName("스파르타 750+ 실전속성")).toBe("실전속성");
    expect(courseShortName("850+ 2주완성")).toBe("2주완성");
    expect(courseLevelLabel({ name: "스파르타 650+ 중급속성", program: "sparta", target_score: 650 })).toBe("650 중급속성");
    expect(levelTitle(650, "중급속성")).toBe("650 중급속성");
  });
});

describe("합반 속성반 — 시간표 줄", () => {
  it("스파르타 줄처럼 과정 · 과목 칸이 없다", () => {
    const row = { id: 1, level: 650, program: "combo", start_time: "10:00:00", end_time: "14:40:00" };
    const hour = { id: 2, level: 650, program: "combo", start_time: "10:00:00", end_time: "11:00:00" };
    expect(kindOf(row, [row, hour])).toBe("sparta");
    expect(fieldsFor("sparta", { book_set: "A", subject_mwf: "lc", subject_ttf: "rc", first_mwf: "lc", first_ttf: "rc", second_start: "11:10" })).toEqual({
      book_set: null,
      subject_mwf: null,
      subject_ttf: null,
      first_mwf: null,
      first_ttf: null,
      second_start: null,
    });
  });

  it("시간표 설정은 합반 카드를 스파르타반 제목 아래에 세운다", () => {
    const page = readFileSync("src/app/admin/timetable/page.tsx", "utf8");
    expect(page).toContain('const headings = PROGRAMS.filter((p) => p !== "combo");');
    expect(page).toContain('(heading === "sparta" ? (["sparta", "combo"] as const) : [heading])');
    expect(page).toContain("cardsUnder(heading).map(({ program, l }) =>");
  });

  it("속성반으로 다루는 곳은 isSpartaProgram — `=== \"sparta\"` 는 수강증(합반 표기를 아직 모른다) · 랜딩 카드 제목만", () => {
    const allowed = new Set([
      "src/lib/receipt.ts",
      "src/lib/match-sections.ts",
      "src/lib/receipt-history.ts",
      "src/app/admin/verifications/[id]/page.tsx",
      "src/components/landing/TimetableCard.tsx",
      // 반 이름표 — 합반은 바로 앞에서 강좌 이름으로 먼저 갈라진다 (`program === "combo"`)
      "src/app/admin/_lib/queries.ts",
    ]);
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(join(dir, e.name)) : /\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name) ? [join(dir, e.name)] : [],
      );
    const offenders = walk("src").filter((f) => !allowed.has(f) && /program\s*===\s*"sparta"/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
