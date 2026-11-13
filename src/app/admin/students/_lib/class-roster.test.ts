import { describe, expect, it } from "vitest";
import type { DB, TermLite } from "../../_lib/queries";
import type { PersonName } from "../../_lib/profile-names";
import { loadClassRoster } from "./class-roster";

/**
 * 조교 화면(숙제 미제출 알림의 숙제 알림받기 · 숙제 알림끄기, 2026-11-13)은 profiles 를 못 읽는다 — `names`(getProfileNames)로 이름 · 등급을 붙인다.
 * 이름을 하나도 못 받으면 강사 · 관리자 계정을 가려낼 수 없으니 `ok` 가 거짓이다.
 */

/** 어떤 메서드를 불러도 자기를 돌려주고, await 하면 정한 결과를 주는 가짜 쿼리 */
function chain(result: unknown, seen: string[] = []) {
  const c: object = new Proxy(
    {},
    {
      get(_, key) {
        if (key === "then") return (ok: (v: unknown) => unknown, no: (e: unknown) => unknown) => Promise.resolve(result).then(ok, no);
        return (...args: unknown[]) => {
          if (key === "select") seen.push(String(args[0]));
          return c;
        };
      },
    },
  );
  return c;
}

const TERM = { id: 1, year: 2026, month: 11 } as TermLite;
const SECTION = { id: 10, track: "mwf", time_block: "10:00~11:00", subject: "rc", book_set: "B", recorded: false, closes_at: "2026-11-30", course_id: 1, course: { name: "650+", target_score: 650, program: "score" } };

function fakeDb(enrollments: { student_id: string; section_id: number; mode: string }[]) {
  const selects: string[] = [];
  const db = {
    from: (table: string) =>
      table === "class_sections" ? chain({ data: [SECTION], error: null }) : chain({ data: enrollments, error: null, count: enrollments.length }, selects),
    rpc: () => chain({ data: [], error: null }),
  };
  return { db: db as unknown as DB, selects };
}

describe("loadClassRoster — 조교 화면은 names 로 이름 · 등급을 붙인다", () => {
  const enrollments = [
    { student_id: "s1", section_id: 10, mode: "onsite" },
    { student_id: "s2", section_id: 10, mode: "live" },
    { student_id: "t1", section_id: 10, mode: "onsite" },
    { student_id: "a1", section_id: 10, mode: "onsite" },
  ];
  const names = async () =>
    new Map<string, PersonName>([
      ["s1", { name: "가온", role: "student" }],
      ["s2", { name: "나리", role: "student" }],
      ["t1", { name: "선생", role: "instructor" }],
      ["a1", { name: "도움", role: "assistant" }],
    ]);

  it("배정은 profiles 를 붙이지 않고 읽고, 강사 계정은 빠지고 조교는 (조교)", async () => {
    const { db, selects } = fakeDb(enrollments);
    const { roster, ok } = await loadClassRoster(db, TERM, "2026-11-13", "track", names);
    expect(ok).toBe(true);
    expect(selects.every((s) => !s.includes("profiles"))).toBe(true);
    expect(roster.levels[0].columns[0].students.map((s) => [s.name, s.marks.join("/")])).toEqual([
      ["가온", "RC"],
      ["나리", "불/RC"],
      ["도움", "조교/RC"],
    ]);
  });

  it("이름을 하나도 못 받으면 ok 거짓 — 강사 계정을 가려낼 수 없다", async () => {
    const { db } = fakeDb(enrollments);
    const { ok } = await loadClassRoster(db, TERM, "2026-11-13", "track", async () => new Map());
    expect(ok).toBe(false);
  });
});
