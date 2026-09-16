/**
 * 반의 과목 → 담당 강사 (2026-09-16 Alan 요청 "자동으로 LC 이혜영, RC 이영수").
 *
 * 강사는 과목으로 고정돼 있다 (`profiles.subject`: 이혜영 lc · 이영수 rc).
 * 반의 과목은 이미 데이터에 있다 — **`class_sections.book_set` 은 LC 교재**라서
 * 값이 있으면 그 시간은 LC, 없으면 RC 다 (도메인 규칙 1 "LC 교재").
 *
 * 두 가지는 정하지 않는다:
 *  - **묶음 반(120분·140분)·스파르타 반** — 두 과목을 이어 들어 담당이 한 명이 아니다.
 *  - **그 (강좌·시간대)에 LC 교재가 하나도 안 정해진 경우** — 안 넣은 것인지 RC 인지 알 수 없다.
 *    (같은 강좌·시간대의 월수금/화목금 중 한쪽이 LC, 다른 쪽이 RC 다.)
 * 여기서 짐작하면 학생 화면의 강사 이름이 통째로 틀어지므로 건드리지 않는다.
 */

export type Subject = "lc" | "rc";

export type SubjectSection = {
  id: number;
  course_id: number;
  time_block: string | null;
  book_set: string | null;
  /** 묶음 반(안에 시간 단위 반이 든 반) 또는 스파르타 반 */
  package: boolean;
};

export type SubjectPlan = {
  /** 과목이 정해진 반 */
  assign: { id: number; subject: Subject }[];
  /** 담당을 비울 반 (묶음·스파르타) */
  clear: number[];
  /** LC 교재가 안 정해져 과목을 못 정한 반 */
  unknown: number[];
};

export const SUBJECT_LABEL: Record<Subject, string> = { lc: "LC", rc: "RC" };

/** 같은 강좌·시간대 묶음에 LC 교재가 하나라도 있어야 그 묶음의 과목을 읽을 수 있다 */
const groupKey = (s: SubjectSection) => `${s.course_id}|${s.time_block ?? ""}`;

export function planSubjects(sections: SubjectSection[]): SubjectPlan {
  const hasBook = new Set<string>();
  for (const s of sections) if (!s.package && s.book_set) hasBook.add(groupKey(s));

  const plan: SubjectPlan = { assign: [], clear: [], unknown: [] };
  for (const s of sections) {
    if (s.package) plan.clear.push(s.id);
    else if (!hasBook.has(groupKey(s))) plan.unknown.push(s.id);
    else plan.assign.push({ id: s.id, subject: s.book_set ? "lc" : "rc" });
  }
  return plan;
}

/** 반 하나의 과목 — 일괄 개설처럼 아직 id 가 없을 때 쓴다 */
export const subjectOf = (opts: { bookSet: string | null; isPackage: boolean; groupHasBook: boolean }): Subject | null =>
  opts.isPackage || !opts.groupHasBook ? null : opts.bookSet ? "lc" : "rc";
