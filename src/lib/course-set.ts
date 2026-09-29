/**
 * 과정 A/B (2026-09-23 Alan "RC도 A과정 B과정에 따라서 움직이잖아").
 *
 * 편성표의 규칙: **시간대가 과목을 고정하고, 과정 A/B 만 달마다 뒤바뀐다** — 9월 10:00 이 A 과정이면 10월 10:00 은 B 과정이고
 * 월수금 RC · 화목금 LC 배치는 그대로다. 그 규칙으로 새 달 시간표를 미리 채우는 일은 `timetable-month.ts` 가 한다
 * (2026-09-29 부터 과정·과목은 반이 아니라 **그 달 시간표**에 둔다 — 반은 시간표를 따라간다).
 */

export type CourseSet = "A" | "B";

export const COURSE_SETS: readonly CourseSet[] = ["A", "B"];

export const isCourseSet = (v: unknown): v is CourseSet => v === "A" || v === "B";

/** A ↔ B. 값이 없으면 null */
export const flipSet = (s: string | null | undefined): CourseSet | null => (s === "A" ? "B" : s === "B" ? "A" : null);
