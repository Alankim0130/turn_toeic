import { courseShortName } from "./timetable";

/**
 * 대시보드 등록생 위젯 (2026-09-23 Alan — "아주 크게 650 / 750 / 850 / 중급속성 / 실전속성 총 등록인원만 보이도록").
 *
 * - 강좌마다 **지금 수강 중인 사람 수**다 — 주5일(월수금 + 화목금 두 반)이나 120분 묶음 반 학생도 그 강좌의 **한 사람**이다.
 *   반마다 세면 주5일 학생이 두 번 세어진다.
 * - 이름은 DB 의 강좌에서 짓는다 (작업 원칙 4 — 코드에 레벨을 적지 않는다):
 *   점수보장반은 레벨 숫자(`650`), 속성반(스파르타)은 `courseShortName` 이 뗀 이름(`중급속성` · `실전속성`).
 * - 테스터(강사·관리자 계정)의 테스트용 배정은 세지 않는다 — 학생명단 등록생 수(`getRosterSets`)와 같은 규칙.
 * - 학생이 없어도 쓰는 중인 강좌는 `0` 으로 늘 보인다 (칸이 사라지면 "그 반이 없어졌나" 로 읽힌다).
 */
export type HeadcountCourse = { id: number; name: string; program: string; target_score: number | null; is_active: boolean };
export type HeadcountRow = { student_id: string; role: string | null; course_id: number | null };
export type Headcount = { id: number; label: string; program: string; count: number };

/** 테스트용 배정을 가진 스태프 등급 — `getRosterSets` 가 빼는 등급과 같다 */
const TESTER_ROLES = new Set(["instructor", "admin"]);

export function headcountLabel(c: Pick<HeadcountCourse, "name" | "program" | "target_score">): string {
  if (c.program === "sparta") return courseShortName(c.name);
  return c.target_score != null ? String(c.target_score) : c.name;
}

/** 점수보장반(레벨 순) 다음에 속성반(레벨 순) */
export function courseHeadcounts(courses: HeadcountCourse[], rows: HeadcountRow[]): Headcount[] {
  const people = new Map<number, Set<string>>();
  for (const r of rows) {
    if (r.course_id == null || (r.role && TESTER_ROLES.has(r.role))) continue;
    people.set(r.course_id, (people.get(r.course_id) ?? new Set()).add(r.student_id));
  }
  return courses
    .filter((c) => c.is_active || people.has(c.id))
    .sort(
      (a, b) =>
        Number(a.program === "sparta") - Number(b.program === "sparta") ||
        (a.target_score ?? 0) - (b.target_score ?? 0) ||
        a.name.localeCompare(b.name, "ko"),
    )
    .map((c) => ({ id: c.id, label: headcountLabel(c), program: c.program, count: people.get(c.id)?.size ?? 0 }));
}
