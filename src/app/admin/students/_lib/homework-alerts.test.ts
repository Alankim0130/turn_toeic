import { describe, expect, it } from "vitest";
import { READ_PAGE } from "@/lib/read-all";
import type { DB } from "../../_lib/queries";
import { loadHomeworkAlertsOff } from "./homework-alerts";

/**
 * 학생명단의 숙제 미제출 알림 켜짐 · 꺼짐 (2026-11-13). **모르면 null** — 읽기 오류나 테스트 등급(정책이 본인 줄만 오류 없이 준다)을
 * 빈 목록으로 보면 끈 학생까지 모두 '켜짐' 으로 보인다.
 */

type Res = { data: { user_id: string; created_at: string }[] | null; error: unknown; count?: number | null };

/** `from("homework_missing_optouts").select().order().range()` 만 흉내 낸다 */
function fakeDb(answer: (from: number, to: number) => Res) {
  const calls: { table: string; from: number; to: number }[] = [];
  const db = {
    from(table: string) {
      return {
        select: () => ({
          order: () => ({
            range: (from: number, to: number) => {
              calls.push({ table, from, to });
              return Promise.resolve(answer(from, to));
            },
          }),
        }),
      };
    },
  };
  return { db: db as unknown as DB, calls };
}

const AT = "2026-11-05T01:00:00+00:00";
const rows = (from: number, n: number) => Array.from({ length: n }, (_, i) => ({ user_id: `u${from + i}`, created_at: AT }));

describe("loadHomeworkAlertsOff — 숙제 미제출 알림을 끈 학생", () => {
  it("끈 학생 → 끈 때 — 알림 안 받기 표를 읽는다", async () => {
    const { db, calls } = fakeDb(() => ({
      data: [
        { user_id: "a", created_at: AT },
        { user_id: "b", created_at: "2026-11-10T03:00:00+00:00" },
      ],
      error: null,
      count: 2,
    }));
    const off = await loadHomeworkAlertsOff(db, { test_role: null });
    expect(off && [...off.keys()].sort()).toEqual(["a", "b"]);
    expect(off?.get("a")).toBe(AT);
    expect(off?.has("c")).toBe(false);
    expect(calls.map((c) => c.table)).toEqual(["homework_missing_optouts"]);
  });

  it("아무도 끄지 않았으면 빈 집합 (모두 켜짐) — null 이 아니다", async () => {
    const { db } = fakeDb(() => ({ data: [], error: null, count: 0 }));
    const off = await loadHomeworkAlertsOff(db, {});
    expect(off).not.toBeNull();
    expect(off?.size).toBe(0);
  });

  it("읽다 실패하면 null — 모두 '켜짐' 으로 보이지 않게", async () => {
    const { db } = fakeDb(() => ({ data: null, error: { message: "boom" } }));
    expect(await loadHomeworkAlertsOff(db, { test_role: null })).toBeNull();
  });

  it("1,000줄이 넘어도 끝까지 읽고, 뒤 쪽이 실패하면 null", async () => {
    const total = READ_PAGE + 5;
    const ok = fakeDb((from, to) => ({ data: rows(from, Math.min(to, total - 1) - from + 1), error: null, count: total }));
    expect((await loadHomeworkAlertsOff(ok.db, {}))?.size).toBe(total);
    const broken = fakeDb((from, to) =>
      from === 0 ? { data: rows(0, to + 1), error: null, count: total } : { data: null, error: { message: "boom" } },
    );
    expect(await loadHomeworkAlertsOff(broken.db, {})).toBeNull();
  });

  it("테스트 등급을 켠 강사 · 관리자는 묻지도 않고 null — 정책이 본인 줄만 오류 없이 준다", async () => {
    const { db, calls } = fakeDb(() => ({ data: [], error: null, count: 0 }));
    expect(await loadHomeworkAlertsOff(db, { test_role: "student" })).toBeNull();
    expect(calls).toHaveLength(0);
  });
});
