import { COURSE_TYPE_LABEL } from "./utils";
import { SUBJECT_LABEL, type Subject } from "./instructor-subject";

/**
 * 반 하나의 종합/단과 이름 (2026-09-18 Alan — "강사가 한 명만 설정되는 경우는 종합반이 아니라 단과반인데 종합으로 표시되어 있다").
 *
 * 강좌(`courses.course_type`)는 상품이라 650·750·850 이 전부 `종합` 이지만, **반은 다르다** —
 * 60분·70분 시간 단위 반은 강사 한 명이 한 과목만 가르치는 **단과**(LC 또는 RC)이고,
 * 두 과목을 이어 듣는 묶음 반(120분·140분)과 스파르타 반만 **종합**이다.
 * 과목은 담당 강사의 과목(`profiles.subject`)으로, 담당이 아직 없으면 LC 교재로 읽는다 (도메인 규칙 1 "담당 강사").
 * 어느 쪽으로도 모르면 null — 종합이라고 짐작해 적지 않는다.
 */
export function sectionTypeLabel(
  s: {
    course: { course_type?: string | null; program?: string | null } | null | undefined;
    book_set: string | null;
    instructor?: { subject?: string | null } | null;
  },
  opts: { isPackage: boolean; groupHasBook: boolean },
): string | null {
  const type = s.course?.course_type;
  if (type === "lc" || type === "rc") return COURSE_TYPE_LABEL[type];
  if (s.course?.program === "sparta" || opts.isPackage) return COURSE_TYPE_LABEL.full;
  const subject: Subject | null =
    s.instructor?.subject === "lc" || s.instructor?.subject === "rc" ? s.instructor.subject : opts.groupHasBook ? (s.book_set ? "lc" : "rc") : null;
  return subject ? `단과 ${SUBJECT_LABEL[subject]}` : null;
}

/** 같은 강좌·시간대 묶음(월수금·화목금)에 LC 교재가 하나라도 있는가 — 없으면 RC 인지 미지정인지 모른다 */
export function groupHasBookSet<T extends { course_id: number | null; time_block: string | null; book_set: string | null }>(list: T[]): Set<string> {
  const out = new Set<string>();
  for (const s of list) if (s.book_set) out.add(`${s.course_id}|${s.time_block ?? ""}`);
  return out;
}

export const groupKeyOf = (s: { course_id: number | null; time_block: string | null }) => `${s.course_id}|${s.time_block ?? ""}`;
