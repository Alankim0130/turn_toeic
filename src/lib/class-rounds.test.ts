import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cellKey, cellLevels, cellsOfSection, isRoundOpen, parseCell, roundCells, roundDates, roundKey, roundRowCount, roundsOf } from "./class-rounds";

const sec = (level: number, subject: string | null, set: string | null) => ({ subject, book_set: set, course: { target_score: level } });

// 9월 650 편성 (도메인 규칙 1): 10:00 A과정 = 월수금 RC · 화목금 LC, 11:10 B과정 = 월수금 LC · 화목금 RC
const MWF_10_RC_A = sec(650, "rc", "A");
const MWF_11_LC_B = sec(650, "lc", "B");
const TTF_10_LC_A = sec(650, "lc", "A");
const TTF_11_RC_B = sec(650, "rc", "B");
const PACKAGE_120 = sec(650, null, null); // 묶음 반 — 과정이 없다
const SPARTA = { subject: null, book_set: null, course: { target_score: 650 } };
const VACATION_120_A = sec(750, null, "A"); // 방학달 통짜 — 한 반에서 두 과목

describe("칸 = 레벨 × 과목 × 과정 (DB private.my_round_cells 와 같은 규칙)", () => {
  it("시간 단위 반은 그 반의 과목 · 과정 하나", () => {
    expect(cellsOfSection(MWF_10_RC_A)).toEqual([{ level: 650, subject: "rc", set: "A" }]);
    expect(cellsOfSection(TTF_10_LC_A)).toEqual([{ level: 650, subject: "lc", set: "A" }]);
  });

  it("과목 칸이 빈 반(방학달 통짜)은 그 과정의 두 과목", () => {
    expect(cellsOfSection(VACATION_120_A)).toEqual([
      { level: 750, subject: "rc", set: "A" },
      { level: 750, subject: "lc", set: "A" },
    ]);
  });

  it("과정이 없는 반(묶음 · 속성반)은 칸이 없다 — 품은 시간 단위 반이 칸을 준다", () => {
    expect(cellsOfSection(PACKAGE_120)).toEqual([]);
    expect(cellsOfSection(SPARTA)).toEqual([]);
    expect(cellsOfSection(null)).toEqual([]);
  });

  it("RC 단과(월수금 10:00 RC 만)에게는 LC 칸이 없다", () => {
    expect([...roundCells([MWF_10_RC_A])]).toEqual(["650:rc:A"]);
  });

  it("과목마다 칸이 있는 레벨 — 중급속성(650 + 850 12:30 RC)은 RC 가 650 · 850, LC 는 650", () => {
    const cells = roundCells([SPARTA, MWF_10_RC_A, MWF_11_LC_B, sec(850, "rc", "A")]);
    expect(cellLevels(cells, "rc")).toEqual([650, 850]);
    expect(cellLevels(cells, "lc")).toEqual([650]);
  });

  it("주5일 120분은 네 칸 — RC A · LC B · LC A · RC B", () => {
    expect([...roundCells([PACKAGE_120, MWF_10_RC_A, MWF_11_LC_B, TTF_10_LC_A, TTF_11_RC_B])].sort()).toEqual(["650:lc:A", "650:lc:B", "650:rc:A", "650:rc:B"]);
  });
});

describe("회차 → 내 수업일 (DB private.my_open_rounds 와 같은 규칙)", () => {
  const sessions = [
    { seq: 1, date: "2026-10-07", section: MWF_10_RC_A },
    { seq: 2, date: "2026-10-09", section: MWF_10_RC_A },
    { seq: 1, date: "2026-10-06", section: TTF_11_RC_B },
    { seq: 1, date: "2026-10-06", section: PACKAGE_120 },
  ];

  it("회차마다 날짜 — 그릇 반의 회차는 칸이 없다", () => {
    const dates = roundDates(sessions);
    expect(dates.get(roundKey(650, "rc", "A", 1))).toBe("2026-10-07");
    expect(dates.get(roundKey(650, "rc", "A", 2))).toBe("2026-10-09");
    expect(dates.get(roundKey(650, "rc", "B", 1))).toBe("2026-10-06");
    expect(dates.size).toBe(3);
  });

  it("같은 칸 · 회차가 두 반에서 오면 이른 날짜 (오전 · 저녁 같은 과정)", () => {
    const evening = sec(650, "rc", "A");
    const dates = roundDates([
      { seq: 3, date: "2026-10-12", section: MWF_10_RC_A },
      { seq: 3, date: "2026-10-10", section: evening },
    ]);
    expect(dates.get(roundKey(650, "rc", "A", 3))).toBe("2026-10-10");
  });

  it("수업일이 오늘이거나 지났으면 열린다 — 수업일 전 · 날짜 없음은 잠금", () => {
    expect(isRoundOpen("2026-10-09", "2026-10-09")).toBe(true);
    expect(isRoundOpen("2026-10-08", "2026-10-09")).toBe(true);
    expect(isRoundOpen("2026-10-12", "2026-10-09")).toBe(false);
    expect(isRoundOpen(undefined, "2026-10-09")).toBe(false);
  });

  it("한 레벨 × 과목의 회차를 날짜순으로 (학생 수업자료실 일정표)", () => {
    const rows = roundsOf(roundDates(sessions), 650, "rc");
    expect(rows.map((r) => `${r.set}${r.seq}@${r.date}`)).toEqual(["B1@2026-10-06", "A1@2026-10-07", "A2@2026-10-09"]);
    expect(roundsOf(roundDates(sessions), 650, "lc")).toEqual([]);
  });
});

describe("키 · 줄 수", () => {
  it("칸 키를 풀어 쓴다", () => {
    expect(parseCell(cellKey(850, "lc", "B"))).toEqual({ level: 850, subject: "lc", set: "B" });
    expect(parseCell("850:lc:C")).toBeNull();
    expect(parseCell("x:rc:A")).toBeNull();
  });

  it("관리자 회차 줄 — 그 달 회차 · 올린 회차 중 큰 쪽, 적어도 10, 끝 30", () => {
    expect(roundRowCount(9, 0)).toBe(10);
    expect(roundRowCount(11, 3)).toBe(11);
    expect(roundRowCount(9, 14)).toBe(14);
    expect(roundRowCount(40, 0)).toBe(30);
  });
});

/** 마이그레이션을 파일 순서대로 읽어 마지막 함수 모양을 꺼낸다 — 화면과 키 모양 · 조건이 같아야 한다 */
describe("DB 함수가 화면과 같은 규칙이다", () => {
  const DIR = "supabase/migrations";
  const sql = readdirSync(DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(join(DIR, f), "utf8"))
    .join("\n");
  const fn = (name: string) => {
    const all = [...sql.matchAll(new RegExp(`create or replace function private\\.${name}\\(\\)[\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$`, "g"))];
    const body = all.at(-1)?.[1] ?? "";
    expect(body, `private.${name} 를 못 찾았다`).not.toBe("");
    return body.replace(/\s+/g, " ");
  };

  it.each(["my_round_cells", "my_open_rounds"])("%s — 과목 칸이 빈 반은 두 과목, 과정 없는 반은 뺀다", (name) => {
    const body = fn(name);
    expect(body).toContain("public.my_section_ids()");
    expect(body).toContain("case when s.subject is null then array['rc', 'lc'] else array[s.subject] end");
    expect(body).toContain("s.book_set is not null");
  });

  it("열린 회차는 오늘(KST)까지의 수업일이다", () => {
    const body = fn("my_open_rounds");
    expect(body).toContain("format('%s:%s:%s:%s', c.target_score, sub.subject, s.book_set, d.seq)");
    expect(body).toContain("d.date <= private.today_kst()");
    expect(fn("my_round_cells")).toContain("format('%s:%s:%s', c.target_score, sub.subject, s.book_set)");
  });
});
