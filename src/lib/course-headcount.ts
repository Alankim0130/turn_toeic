import { courseShortName, programRank } from "./timetable";

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
 */
export type HeadcountCourse = { id: number; name: string; program: string; target_score: number | null; is_active: boolean };
/** `mode` = 그 반 배정의 수강 방식 `onsite` | `live` (`enrollments.mode`) */
export type HeadcountRow = { student_id: string; role: string | null; course_id: number | null; mode: string };
/** `live` = `count` 중 불라방 인원 (따로 더하는 수가 아니다) */
export type Headcount = { id: number; label: string; program: string; count: number; live: number };

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

/** 점수보장반(레벨 순) → 속성반(레벨 순) → 2주완성 */
export function courseHeadcounts(courses: HeadcountCourse[], rows: HeadcountRow[]): Headcount[] {
  const people = new Map<number, Set<string>>();
  const live = new Map<number, Set<string>>();
  for (const r of rows.filter(countable)) {
    people.set(r.course_id, (people.get(r.course_id) ?? new Set()).add(r.student_id));
    if (r.mode === "live") live.set(r.course_id, (live.get(r.course_id) ?? new Set()).add(r.student_id));
  }
  return courses
    .filter((c) => c.is_active || people.has(c.id))
    .sort(
      (a, b) =>
        programRank(a.program) - programRank(b.program) ||
        (a.target_score ?? 0) - (b.target_score ?? 0) ||
        a.name.localeCompare(b.name, "ko"),
    )
    .map((c) => ({ id: c.id, label: headcountLabel(c), program: c.program, count: people.get(c.id)?.size ?? 0, live: live.get(c.id)?.size ?? 0 }));
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
