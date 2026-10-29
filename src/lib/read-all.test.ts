import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { IN_CHUNK, READ_PAGE, readAll, readAllIn } from "./read-all";

/**
 * PostgREST 는 한 번에 1,000줄까지만 주고, 넘친 줄은 **조용히 빠진다**. `.limit(5000)` 을 적어도 1,000줄에서 잘린다.
 * id 수백 개를 `.in()` 하나에 실으면 요청 주소가 너무 길어 실패하고, 실패는 빈 목록으로 보인다.
 * 2026-10-29 전체 점검에서 이 둘에 걸린 곳 여섯을 고쳤다 — 아래 '부르는 곳' 이 못박는다.
 */

type Row = { id: number };

/** 줄 n개를 1,000줄 상한으로 흉내 낸 쪽 읽기 */
function pages(n: number, failAt = -1) {
  const calls: [number, number][] = [];
  const page = (from: number, to: number, count: boolean) => {
    calls.push([from, to]);
    if (from === failAt) return Promise.resolve({ data: null, error: { message: "boom" }, count: null });
    const data = Array.from({ length: Math.max(0, Math.min(to, n - 1) - from + 1) }, (_, i) => ({ id: from + i }));
    return Promise.resolve({ data: data.slice(0, READ_PAGE), error: null, count: count ? n : null });
  };
  return { page, calls };
}

describe("readAll — 1,000줄씩 끝까지", () => {
  it("2,345줄이면 세 쪽을 읽어 다 모은다", async () => {
    const { page, calls } = pages(2345);
    const { rows, ok } = await readAll<Row>(page);
    expect(ok).toBe(true);
    expect(rows).toHaveLength(2345);
    expect(calls.map(([f]) => f)).toEqual([0, 1000, 2000]);
  });

  it("한 쪽이라도 실패하면 ok 거짓 — 부르는 쪽이 '다 못 읽었어요' 를 말한다", async () => {
    const { page } = pages(2345, 1000);
    expect((await readAll<Row>(page)).ok).toBe(false);
  });
});

describe("readAllIn — id 를 100개씩 나눠 묻는다", () => {
  it("250개면 100 · 100 · 50 으로 나누고 줄을 다 모은다", async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `id-${i}`);
    const sizes: number[] = [];
    const { rows, ok } = await readAllIn(ids, (chunk) => {
      sizes.push(chunk.length);
      return Promise.resolve({ data: chunk.map((id) => ({ id })), error: null, count: null });
    });
    expect(IN_CHUNK).toBe(100);
    expect(sizes).toEqual([100, 100, 50]);
    expect(ok).toBe(true);
    expect(rows.map((r) => r.id)).toEqual(ids);
  });

  it("빈 목록이면 묻지 않는다 · 한 묶음이 실패하면 ok 거짓", async () => {
    let asked = 0;
    expect(await readAllIn([], () => (asked++, Promise.resolve({ data: [], error: null })))).toEqual({ rows: [], ok: true });
    expect(asked).toBe(0);
    const ids = Array.from({ length: 150 }, (_, i) => i);
    const res = await readAllIn(ids, (chunk) =>
      Promise.resolve(chunk[0] === 100 ? { data: null, error: { message: "URI too long" } } : { data: chunk.map((id) => ({ id })), error: null }),
    );
    expect(res.ok).toBe(false);
  });
});

describe("부르는 곳 — 1,000줄에서 잘리거나 주소가 길어 비던 곳 (2026-10-29)", () => {
  const root = path.resolve(__dirname, "../..");
  const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");
  const code = (rel: string) => read(rel).replace(/\/\/.*$/gm, ""); // 주석의 옛 코드 설명은 빼고 본다

  it("네이버 예약 현황 — 60일치 칸을 쪽으로 읽는다 (.limit(5000) 없음)", () => {
    const src = code("src/app/admin/naver-reservations/page.tsx");
    expect(src).not.toContain(".limit(5000)");
    expect(src).toMatch(/readAll\(\(from, to, count\) =>\s*supabase\s*\.from\("naver_booking_slots"\)/);
  });

  it("마케팅 분석 · 대시보드 — 회원 · 설문을 쪽으로 읽는다", () => {
    const analytics = code("src/app/admin/analytics/page.tsx");
    expect(analytics).not.toContain(".limit(5000)");
    expect(analytics).toMatch(/\.from\("profiles"\)[\s\S]{0,200}\.order\("id"\)\s*\.range\(from, to\)/);
    expect(analytics).toMatch(/\.from\("student_surveys"\)[\s\S]{0,200}\.order\("user_id"\)\s*\.range\(from, to\)/);
    const dashboard = code("src/app/admin/page.tsx");
    expect(dashboard).toMatch(/readAll\(\(from, to, count\) => supabase\.from\("profiles"\)\.select\("id, gender, university"/);
  });

  it("학생명단 등록생 · 예비등록생 집합 — 등록을 쪽으로 읽는다", () => {
    const src = code("src/app/admin/_lib/queries.ts");
    const fn = src.slice(src.indexOf("export async function getRosterSets"), src.indexOf("export async function getActiveCourseRows"));
    expect(fn).toContain("readAll(");
    expect(fn).toMatch(/\.order\("id"\)\s*\.range\(from, to\)/);
  });

  it("학생명단 — id 목록은 100개씩 (프로필 · 배정 · 지난 등록 · 스터디 신청)", () => {
    const src = code("src/app/admin/students/page.tsx");
    expect(src).not.toMatch(/\.in\("id", ids\)/);
    expect(src).not.toMatch(/\.in\("student_id", ids\)/);
    expect(src).not.toMatch(/\.in\("user_id", ids\)/);
    expect(src.match(/readAllIn\(/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it("학생 숙제 달력 — 내 제출을 다 읽는다 (예전 최근 60건)", () => {
    const src = code("src/app/my/_lib/queries.ts");
    const fn = src.slice(src.indexOf("export async function getMyHomework("), src.indexOf("export type MyHomework"));
    expect(fn).not.toContain(".limit(60)");
    expect(fn).toContain('.eq("user_id", user.id)');
    expect(fn).toContain("readAll(");
  });

  it("비대면스터디 인증 — 학생의 반은 그 기수 반의 배정에서 (학생 id 를 주소에 싣지 않는다)", () => {
    const src = code("src/app/admin/study-checkins/page.tsx");
    const fn = src.slice(src.indexOf("async function getTermClasses"));
    expect(fn).not.toContain('.in("student_id"');
    expect(fn).toContain('.in("section_id", sectionIds)');
    expect(fn).toContain("readAll(");
  });
});
