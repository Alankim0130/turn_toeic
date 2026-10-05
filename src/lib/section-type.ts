import { COURSE_TYPE_LABEL } from "./utils";
import { isSubject, SUBJECT_LABEL, type Subject } from "./instructor-subject";
import { isContainerProgram } from "./two-week";

/**
 * 반 하나의 종합/단과 이름 (2026-09-18 Alan — "강사가 한 명만 설정되는 경우는 종합반이 아니라 단과반인데 종합으로 표시되어 있다").
 *
 * 강좌(`courses.course_type`)는 상품이라 650·750·850 이 전부 `종합` 이지만, **반은 다르다** —
 * 60분·70분 시간 단위 반은 강사 한 명이 한 과목만 가르치는 **단과**(LC 또는 RC)이고,
 * 두 과목을 이어 듣는 묶음 반(120분·140분)과 스파르타 반만 **종합**이다.
 * 과목은 담당 강사의 과목(`profiles.subject`)으로, 담당이 아직 없으면 반의 과목 칸(`class_sections.subject`)으로 읽는다 (2026-09-23).
 * 어느 쪽으로도 모르면 null — 종합이라고 짐작해 적지 않는다.
 */
export function sectionTypeLabel(
  s: {
    course: { course_type?: string | null; program?: string | null } | null | undefined;
    subject?: string | null;
    instructor?: { subject?: string | null } | null;
  },
  opts: { isPackage: boolean },
): string | null {
  const type = s.course?.course_type;
  if (type === "lc" || type === "rc") return COURSE_TYPE_LABEL[type];
  // 그릇 반(스파르타 · 2주완성 — 2026-10-05) · 묶음 반은 두 과목을 이어 듣는 종합이다
  if (isContainerProgram(s.course?.program) || opts.isPackage) return COURSE_TYPE_LABEL.full;
  const subject: Subject | null = isSubject(s.instructor?.subject) ? s.instructor.subject : isSubject(s.subject) ? s.subject : null;
  return subject ? `단과 ${SUBJECT_LABEL[subject]}` : null;
}

/** 학생명단 카드의 단과 이름표 — 종합은 적지 않는다 (`singleSubjectOf`) */
export const SINGLE_SUBJECT_LABEL: Record<Subject, string> = { rc: "RC단과", lc: "LC단과" };

/**
 * 학생 한 사람의 반 **한 줄**이 단과인지 — 단과면 그 과목, 아니면 null (2026-10-05 Alan — 학생명단 카드에
 * "종합반인지 RC단과, LC단과 표시가 안되어있어. 종합반이 대부분이니 RC단과, LC단과만 표시해주면 좋겠어").
 *
 * 한 줄 = 주5일이면 월수금 + 화목금 두 반, 아니면 반 하나 (`groupWeek5`). **줄 안의 반이 전부 한 과목일 때만** 단과다 —
 * 주3일 60 · 70분(시간 단위 반 하나)이 여기 해당한다.
 *  - 주5일 60분은 두 트랙의 과목이 서로 반대라(월수금 RC · 화목금 LC) 두 과목을 다 듣는다 → 단과가 아니다
 *  - 묶음 반(120 · 140분) · 방학달 통짜 반은 과목 칸이 비어 있다(두 과목을 이어 듣는다) → null
 *  - 속성반 · 2주완성(그릇 반)은 종합이다 → null
 *  - 과목 칸이 빈 시간 단위 반(아직 안 고름)은 모르는 것이라 null — 짐작해 적지 않는다
 * 과목은 반의 과목 칸(`class_sections.subject`)으로 읽는다 — 그 학생의 교재 · LC 음원 · 수업자료실도 이 칸을 본다.
 * (반 목록의 `sectionTypeLabel` 은 담당 강사의 과목을 먼저 보지만, 담당은 이 칸에서 저절로 정해진다.)
 * 강좌가 단과 상품(`course_type` lc · rc)이면 그 과목이다 — `sectionTypeLabel` 과 같은 순서.
 */
export function singleSubjectOf(
  sections: readonly {
    subject?: string | null;
    course?: { course_type?: string | null; program?: string | null } | null;
  }[],
): Subject | null {
  let out: Subject | null = null;
  for (const s of sections) {
    const type = s.course?.course_type;
    const subject: Subject | null = isSubject(type) ? type : isContainerProgram(s.course?.program) ? null : isSubject(s.subject) ? s.subject : null;
    if (!subject || (out && out !== subject)) return null;
    out = subject;
  }
  return out;
}

export const groupKeyOf = (s: { course_id: number | null; time_block: string | null }) => `${s.course_id}|${s.time_block ?? ""}`;
