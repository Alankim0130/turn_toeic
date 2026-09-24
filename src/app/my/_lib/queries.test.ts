import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 학생 화면(`/my`)의 조회는 **RLS 에만 맡기지 않는다** (CLAUDE.md 등급 체계 10).
 *
 * 학생 화면 정책은 대부분 `… or private.is_staff()` 라 **강사·관리자에게는 모든 반·모든 학생이 열린다** —
 * 관리자 화면에는 맞지만 `/my` 에서 그대로 쓰면 남의 반 수업일·녹화본·불라방과 **남의 숙제**가 내 화면에 선다.
 * 학생에게는 멀쩡해 보여서 늦게 발견되고, 2026-09-23~24 에 같은 실수를 세 번 고쳤다
 * (숙제 달력 레벨 · 등록 현황 · 다시보기 · 숙제 제출 목록).
 *
 * 그래서 **소스를 직접 읽어** 못박는다 — 민감한 표를 읽는 함수는 반드시 한 번 더 좁혀야 한다.
 * 여기 걸리면 `npm test` 가 깨지므로 다음 세션이 지나칠 수 없다.
 */

const FILE = "src/app/my/_lib/queries.ts";
const SOURCE = readFileSync(FILE, "utf8");

/** 스태프에게 전부 열려 있는 표 — 읽으면 반드시 좁혀야 한다 */
const WIDE_OPEN_TABLES = [
  // 반으로 열리는 것
  "session_dates",
  "replays",
  "session_live_links",
  "section_live_links",
  // 사람으로 열리는 것 — 정책이 `본인 or 스태프(조교)` 라 스태프에게는 **모든 학생의 행**이 내려온다
  "homework_submissions",
  "enrollment_orders",
  "enrollment_verifications",
  "lecture_signups",
  "textbook_orders",
  "study_signups",
  "study_checkins",
  "student_messages",
  "study_materials",
];

/** 좁히는 방법 — 내 반(`public.my_section_ids()`) · 내 행(`user_id`) · 부른 쪽이 준 반 목록 */
const NARROWERS = ['my_section_ids', '.eq("user_id"', '.in("section_id"', '.in("study_id"'];

/** 최상위 `export` 마다 한 덩어리로 자른다 (함수 본문을 파싱하지 않고 경계만 본다) */
function exportBlocks(): { name: string; body: string }[] {
  const marks = [...SOURCE.matchAll(/^export (?:async function|const|function) (\w+)/gm)];
  return marks.map((m, i) => ({
    name: m[1],
    body: SOURCE.slice(m.index!, i + 1 < marks.length ? marks[i + 1].index! : SOURCE.length),
  }));
}

describe("/my 조회는 내 것으로 한 번 더 좁힌다", () => {
  const blocks = exportBlocks();

  it("자르기가 동작한다 (정규식이 헛돌면 아래 검사가 통째로 무력해진다)", () => {
    expect(blocks.length).toBeGreaterThan(20);
    expect(blocks.map((b) => b.name)).toContain("getMyReplays");
  });

  it.each(WIDE_OPEN_TABLES)("%s 를 읽는 함수는 전부 좁힌다", (table) => {
    const readers = blocks.filter((b) => b.body.includes(`from("${table}")`));
    expect(readers.length).toBeGreaterThan(0); // 표 이름이 바뀌었는데 검사만 남는 것을 막는다
    for (const r of readers) {
      const narrowed = NARROWERS.some((n) => r.body.includes(n));
      expect(narrowed, `${r.name}() 이 ${table} 를 좁히지 않고 읽는다 — RLS 는 스태프에게 전부 열어 준다`).toBe(true);
    }
  });

  // 레벨이 걸린 세 화면 (2026-09-24 Alan "다시보기, 숙제, 불라방 모두 내 레벨에 맞는것만").
  // 레벨을 코드로 거르지 않는다 — `my_section_ids()` 가 내 반만 주고, 그 안에 레벨이 이미 들어 있다
  // (스파르타는 `private.section_includes` 가 포함 레벨까지 열어 준다 — 중급속성 650+850 · 실전속성 750+850).
  it.each([
    ["getMyReplays", "다시보기"],
    ["getMySessions", "숙제 달력 · 내 시간표"],
    ["getMyLiveCards", "불라방"],
  ])("%s — %s 는 my_section_ids() 로 내 반만 본다", (fn) => {
    const block = blocks.find((b) => b.name === fn);
    expect(block, `${fn}() 이 사라졌다 — 이름을 바꿨으면 이 테스트도 같이 고칠 것`).toBeTruthy();
    expect(block!.body).toContain("my_section_ids");
  });
});
