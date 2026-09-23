/**
 * **수동 승인은 그 달의 최종 배정이다** (2026-09-23 Alan — 반려된 등업신청을 `승인하고 등업하기` 로 올리려는데
 * "이미 같은 반에 배정된 수강생입니다" 가 떴다. "강사가 직접 등급을 지정한 경우 직접 지정한 등급으로 최종 등급으로 저장해주면 좋겠어").
 *
 * 그전에는 승인이 늘 **새 등록**을 만들어서, 학생이 이미 그 반에 있으면(스태프 배정 · 같은 수강증을 다시 올림) 반 하나에 한 사람 규칙에 걸려 멈췄다.
 * 이제 스태프가 승인 화면에서 **체크한 반이 그 달(기수) 이 학생의 배정 그대로** 된다:
 * - 이미 있던 배정 중 체크한 반 → 이 승인의 등록으로 **옮겨 온다** (수강 방식은 승인 화면에서 고른 값으로)
 * - 체크했는데 없던 반 → 새로 넣는다
 * - 같은 달 기존 배정인데 **승인 화면에 떠 있었고 체크를 뺀** 반 → 뺀다
 * - 승인 화면에 뜰 수 없던 반(닫힌 반 등)은 **건드리지 않는다** — 스태프가 볼 수 없던 것을 지우면 안 된다
 * - 다른 달의 배정은 건드리지 않는다
 * 승인 화면은 같은 달 기존 배정을 **미리 체크해 둔다** — 아무것도 안 건드리면 기존 배정이 그대로 남는다.
 *
 * **OCR 자동 승인 · 받아 둔 수강증 다시 맞추기에는 쓰지 않는다** — 기계는 기존 배정을 바꾸지 않고 검토로 넘긴다.
 */
export type ExistingEnrollment = { id: number; order_id: number; section_id: number; term_id: number };

export type AssignmentPlan = {
  /** 이 승인의 등록으로 옮겨 올 기존 배정 (enrollments.id) */
  absorb: ExistingEnrollment[];
  /** 새로 넣을 반 (class_sections.id) */
  insert: number[];
  /** 뺄 기존 배정 (enrollments.id) */
  remove: ExistingEnrollment[];
};

export function planManualApproval(input: {
  /** 체크한 반 — 한 달(기수)의 반이어야 한다 (`assignableError` 가 먼저 본다) */
  chosen: { id: number; term_id: number }[];
  /** 이 학생의 지금 배정 (모든 달) */
  existing: ExistingEnrollment[];
  /** 승인 화면에 뜰 수 있는 반 — 열려 있고 종강 전 (화면의 반 고르기와 같은 조건) */
  selectable: ReadonlySet<number>;
}): AssignmentPlan {
  const term = input.chosen[0]?.term_id;
  const chosen = new Set(input.chosen.map((s) => s.id));
  const sameTerm = input.existing.filter((e) => e.term_id === term);
  const have = new Set(sameTerm.map((e) => e.section_id));
  return {
    absorb: sameTerm.filter((e) => chosen.has(e.section_id)),
    insert: [...chosen].filter((id) => !have.has(id)),
    remove: sameTerm.filter((e) => !chosen.has(e.section_id) && input.selectable.has(e.section_id)),
  };
}

/**
 * 승인 화면에서 미리 체크해 둘 반 — 학생이 고른 반(수동 신청) · OCR 이 찾은 반에 **같은 달 기존 배정**을 더한다.
 * 기존 배정을 체크해 두어야 스태프가 아무것도 안 건드렸을 때 그 배정이 빠지지 않는다 (체크 = 최종 배정).
 * 고른 반이 없으면 지금(또는 곧) 수강 중인 달의 기존 배정만 체크한다. 화면에 뜨지 않는 반은 체크하지 않는다.
 */
export function preselectForApproval(input: {
  suggested: number[];
  existing: { section_id: number; term_id: number; closes_at: string; opens_at: string }[];
  selectable: { id: number; term_id: number }[];
  today: string;
}): number[] {
  const termOf = new Map(input.selectable.map((s) => [s.id, s.term_id]));
  const suggested = input.suggested.filter((id) => termOf.has(id));
  const alive = input.existing.filter((e) => e.closes_at >= input.today && termOf.has(e.section_id));
  // 어느 달인가: 제안이 있으면 그 달, 없으면 지금 수강 중인 달 → 곧 시작하는 달
  const term =
    (suggested.length > 0 ? termOf.get(suggested[0]) : undefined) ??
    [...alive].sort((a, b) => Number(b.opens_at <= input.today) - Number(a.opens_at <= input.today) || a.opens_at.localeCompare(b.opens_at))[0]?.term_id;
  if (term === undefined) return [];
  const fromExisting = alive.filter((e) => e.term_id === term).map((e) => e.section_id);
  return [...new Set([...suggested.filter((id) => termOf.get(id) === term), ...fromExisting])];
}
