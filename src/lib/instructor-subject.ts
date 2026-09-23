/**
 * 반의 과목 → 담당 강사 (2026-09-16 Alan 요청 "자동으로 LC 이혜영, RC 이영수").
 *
 * 강사는 과목으로 고정돼 있다 (`profiles.subject`: 이혜영 lc · 이영수 rc).
 * 반의 과목은 **`class_sections.subject`**(lc | rc) 에 적혀 있다 (2026-09-23, 마이그레이션 20260923160000).
 * 그전에는 LC 교재(`book_set`)가 있으면 LC, 없으면 RC 로 읽었는데, A/B 가 LC 교재가 아니라 **과정**이라
 * RC 시간에도 글자가 붙게 되면서(Alan "RC도 A과정 B과정에 따라서 움직이잖아") 그 규칙은 버렸다.
 *
 * 두 가지는 정하지 않는다:
 *  - **묶음 반(120분·140분)·스파르타 반** — 두 과목을 이어 들어 담당이 한 명이 아니다.
 *  - **과목 칸이 비어 있는 반** — 방학달 통짜 반처럼 한 반이 두 과목을 이어 듣거나, 아직 안 고른 것이다.
 * 여기서 짐작하면 학생 화면의 강사 이름이 통째로 틀어지므로 건드리지 않는다. DB 의 `private.section_instructor_plan` 과 같은 규칙이다.
 */

export type Subject = "lc" | "rc";

export const isSubject = (v: unknown): v is Subject => v === "lc" || v === "rc";

export type SubjectSection = {
  id: number;
  course_id: number;
  time_block: string | null;
  /** 과목 칸. 비어 있으면 정하지 않는다 */
  subject: string | null;
  /** 묶음 반(안에 시간 단위 반이 든 반) 또는 스파르타 반 */
  package: boolean;
};

export type SubjectPlan = {
  /** 과목이 정해진 반 */
  assign: { id: number; subject: Subject }[];
  /** 담당을 비울 반 (묶음·스파르타) */
  clear: number[];
  /** 과목 칸이 비어 있어 정하지 못한 반 */
  unknown: number[];
};

export const SUBJECT_LABEL: Record<Subject, string> = { lc: "LC", rc: "RC" };

export function planSubjects(sections: SubjectSection[]): SubjectPlan {
  const plan: SubjectPlan = { assign: [], clear: [], unknown: [] };
  for (const s of sections) {
    if (s.package) plan.clear.push(s.id);
    else if (isSubject(s.subject)) plan.assign.push({ id: s.id, subject: s.subject });
    else plan.unknown.push(s.id);
  }
  return plan;
}

/** 반 하나의 과목 — 묶음·스파르타는 없고, 과목 칸이 비어 있으면 정하지 않는다 */
export const subjectOf = (opts: { subject: string | null | undefined; isPackage: boolean }): Subject | null =>
  opts.isPackage ? null : isSubject(opts.subject) ? opts.subject : null;

/**
 * 함께 듣는 시간들의 과목 (2026-09-16 Alan 요청 — 내 시간표에 "10:00–11:00 LC / 11:10–12:10 RC" 로 보여 준다).
 * 과목 칸이 있는 반만 말하고, 비어 있는 반은 아무 말도 하지 않는다 (짐작하지 않는다).
 */
export function subjectsWithin<T extends { id: number; subject?: string | null }>(list: T[]): Map<number, Subject> {
  const out = new Map<number, Subject>();
  for (const s of list) if (isSubject(s.subject)) out.set(s.id, s.subject);
  return out;
}
