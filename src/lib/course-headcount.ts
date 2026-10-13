import { blockMinutes, buildBlockTree, flattenBlockTree } from "./time-blocks";
import { courseShortName, programRank } from "./timetable";
import { isContainerProgram } from "./two-week";

/**
 * 대시보드 등록생 위젯 (2026-09-23 Alan — "아주 크게 650 / 750 / 850 / 중급속성 / 실전속성 총 등록인원만 보이도록").
 *
 * - 강좌마다 **지금 수강 중인 사람 수**다 — 주5일(월수금 + 화목금 두 반)이나 120분 묶음 반 학생도 그 강좌의 **한 사람**이다.
 *   반마다 세면 주5일 학생이 두 번 세어진다.
 * - 이름은 DB 의 강좌에서 짓는다 (작업 원칙 4 — 코드에 레벨을 적지 않는다):
 *   점수보장반은 레벨 숫자(`650`), 속성반(스파르타)은 `courseShortName` 이 뗀 이름(`중급속성` · `실전속성`).
 * - 테스터(강사·관리자 계정)의 테스트용 배정은 세지 않는다 — 학생명단 등록생 수(`getRosterSets`)와 같은 규칙.
 * - 학생이 없어도 쓰는 중인 강좌는 `0` 으로 늘 보인다 (칸이 사라지면 "그 반이 없어졌나" 로 읽힌다).
 * - **그중 불라방 인원도 함께 센다** (2026-10-06 Alan — "위에 등록생부분에서 불라방인원은 괄호로 넣어줘") — 위젯이 `15명 (불라방 3)` 으로 적는다.
 *   큰 숫자는 그대로 전체(현장 + 불라방)다. 불라방 = 그 강좌의 반 배정 중 **하나라도** 수강 방식이 불라방(`enrollments.mode = live`)인 사람 —
 *   주5일 두 트랙의 방식이 다르면(드물다) 불라방으로 센다 (교재주문 자격 `private.has_live_enrollment` 와 같은 쪽이다).
 * - **60분 · 120분 학생도 나눠 센다** (2026-10-13 Alan — "대시보드 등록생에서 60분수업 학생과 120분 수업학생이 있잖아? 해당 부분도 구분해서") —
 *   위젯이 강좌 이름 아래 `60분 12명 · 120분 26명` 으로 적는다 (`kinds`). 분량은 그 학생이 배정된 반의 시간대 라벨에서 온다 (`blockMinutes` —
 *   시간 단위 반은 벽시계 길이 60 · 70분, 묶음 반은 안에 든 시간 단위의 합 120 · 140분 — 코드에 60 · 120 을 적지 않는다. 850 은 70 · 140 으로 나온다).
 *   한 사람이 그 강좌에서 여러 반이면 **가장 긴 것**이다 — 주5일 60분(60 + 60)은 60분, 단과 두 장도 60분, 주5일 120분은 120분.
 *   묶음의 합을 알려면 **그 기수 · 강좌의 반 전체**(`blocks` — 아무도 안 듣는 60분 반도)로 트리를 만들어야 한다 — 배정만 보면 70분 반에 아무도 없을 때 140분이 안 나온다.
 *   속성반 · 2주완성(그릇 반 — `isContainerProgram`)은 나누지 않고, 분량을 모르는 반(시간이 없는 반 · 방학달 통짜 120분처럼 쉬는 시간을 모르는 긴 한 구간)의 학생은
 *   어느 칸에도 적지 않는다 — 아는 칸이 하나도 없으면(방학달) 줄을 그리지 않는다. 칸이 하나뿐이어도 적는다(`120분 38명` — 60분 학생이 없다는 뜻이 거기 있다).
 */
export type HeadcountCourse = { id: number; name: string; program: string; target_score: number | null; is_active: boolean };
/** 반 하나의 (기수 · 강좌 · 시간대) — 분량 트리를 만드는 재료. 배정 줄도 이 모양을 품는다 */
export type HeadcountBlock = { course_id: number | null; term_id?: number | null; time_block?: string | null };
/** `mode` = 그 반 배정의 수강 방식 `onsite` | `live` (`enrollments.mode`). `term_id` · `time_block` 은 그 반의 것 (60분 · 120분 가르기 — 없으면 못 가른다) */
export type HeadcountRow = HeadcountBlock & { student_id: string; role: string | null; mode: string };
/** 분량 칸 하나 — `60분 12명` */
export type HeadcountKind = { minutes: number; count: number };
/** `live` = `count` 중 불라방 인원 (따로 더하는 수가 아니다). `kinds` = 분량별 인원(분량 순) — 그릇 반 · 분량을 모르면 비어 있다 */
export type Headcount = { id: number; label: string; program: string; count: number; live: number; kinds: HeadcountKind[] };

/** 테스트용 배정을 가진 스태프 등급 — `getRosterSets` 가 빼는 등급과 같다 */
const TESTER_ROLES = new Set(["instructor", "admin"]);

/** 세는 줄인가 — 강좌를 모르는 줄과 테스터의 테스트용 배정은 뺀다 */
const countable = (r: HeadcountRow): r is HeadcountRow & { course_id: number } => r.course_id != null && !(r.role && TESTER_ROLES.has(r.role));

export function headcountLabel(c: Pick<HeadcountCourse, "name" | "program" | "target_score">): string {
  if (c.program === "sparta") return courseShortName(c.name);
  // 2주완성(2026-10-05)은 레벨을 붙인다 — `850 2주완성` (같은 850 이라 레벨이 빠지면 무엇의 2주완성인지 모른다)
  if (c.program === "twoweek") return c.target_score != null ? `${c.target_score} ${courseShortName(c.name)}` : c.name;
  return c.target_score != null ? String(c.target_score) : c.name;
}

const blockKey = (b: HeadcountBlock) => `${b.term_id ?? ""}|${b.course_id}|${b.time_block}`;

/**
 * (기수 · 강좌 · 시간대) → 분량. 같은 기수 · 강좌의 시간대들로 묶음 → 시간 단위 트리를 만든다 (`buildBlockTree`) —
 * 10:00~12:10 은 안에 든 10:00~11:00 + 11:10~12:10 이 있어야 120분이고, 없으면(방학달 통짜) 모른다(null).
 * 속성반도 함께 들어오지만 분량을 쓰는 곳은 점수보장반뿐이라 상관없다.
 */
export function blockMinutesIndex(blocks: readonly HeadcountBlock[]): Map<string, number | null> {
  const groups = new Map<string, Set<string>>();
  for (const b of blocks) {
    if (b.course_id == null || !b.time_block) continue;
    const k = `${b.term_id ?? ""}|${b.course_id}`;
    groups.set(k, (groups.get(k) ?? new Set()).add(b.time_block));
  }
  const out = new Map<string, number | null>();
  for (const [k, labels] of groups) {
    for (const { node } of flattenBlockTree(buildBlockTree(labels))) out.set(`${k}|${node.label}`, blockMinutes(node));
  }
  return out;
}

/**
 * 점수보장반(레벨 순) → 속성반(레벨 순) → 2주완성.
 * `blocks` = 지금 기수 반 전체의 (기수 · 강좌 · 시간대) — 60분 · 120분을 가르는 트리의 재료 (배정 줄의 것과 합친다).
 */
export function courseHeadcounts(courses: HeadcountCourse[], rows: HeadcountRow[], blocks: readonly HeadcountBlock[] = []): Headcount[] {
  const people = new Map<number, Set<string>>();
  const live = new Map<number, Set<string>>();
  // 강좌 → 학생 → 그 강좌에서 듣는 반 중 가장 긴 분량
  const minutes = new Map<number, Map<string, number>>();
  const index = blockMinutesIndex([...blocks, ...rows]);
  for (const r of rows.filter(countable)) {
    people.set(r.course_id, (people.get(r.course_id) ?? new Set()).add(r.student_id));
    if (r.mode === "live") live.set(r.course_id, (live.get(r.course_id) ?? new Set()).add(r.student_id));
    const m = r.time_block ? index.get(blockKey(r)) : null;
    if (m != null) {
      const byStudent = minutes.get(r.course_id) ?? new Map<string, number>();
      byStudent.set(r.student_id, Math.max(m, byStudent.get(r.student_id) ?? 0));
      minutes.set(r.course_id, byStudent);
    }
  }
  const kindsOf = (c: HeadcountCourse): HeadcountKind[] => {
    if (isContainerProgram(c.program)) return [];
    const tally = new Map<number, number>();
    for (const m of minutes.get(c.id)?.values() ?? []) tally.set(m, (tally.get(m) ?? 0) + 1);
    return [...tally].map(([minutes, count]) => ({ minutes, count })).sort((a, b) => a.minutes - b.minutes);
  };
  return courses
    .filter((c) => c.is_active || people.has(c.id))
    .sort(
      (a, b) =>
        programRank(a.program) - programRank(b.program) ||
        (a.target_score ?? 0) - (b.target_score ?? 0) ||
        a.name.localeCompare(b.name, "ko"),
    )
    .map((c) => ({
      id: c.id,
      label: headcountLabel(c),
      program: c.program,
      count: people.get(c.id)?.size ?? 0,
      live: live.get(c.id)?.size ?? 0,
      kinds: kindsOf(c),
    }));
}

/**
 * 위젯 맨 아래 **총인원** (2026-09-23 Alan — "650 - 0명 / 750 - 0명 / … / 총인원").
 * 강좌 칸을 더한 값이 아니라 **사람 수**다 — 두 강좌를 함께 듣는 학생도 한 명이다. 테스터는 강좌 칸과 똑같이 뺀다.
 * `live` 는 그중 불라방 인원 — 강좌 칸과 같은 규칙(반 배정 하나라도 불라방)으로 사람마다 한 번 (2026-10-06).
 */
export function headcountTotal(rows: HeadcountRow[]): { count: number; live: number } {
  const counted = rows.filter(countable);
  return {
    count: new Set(counted.map((r) => r.student_id)).size,
    live: new Set(counted.filter((r) => r.mode === "live").map((r) => r.student_id)).size,
  };
}
