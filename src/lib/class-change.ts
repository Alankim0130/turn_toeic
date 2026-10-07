import { slotsClash, slotsOfSections } from "./receipt-seat";
import { singleSubjectOf } from "./section-type";

/**
 * **반을 바꾼 수강증은 새 수강증대로 등업한다** (2026-10-06 Alan — "지금 수업변경을 해서 수강증을 다시 올리는 학생들이 있는데, 이미 등록되어 있는 학생이라고 하면서
 * 검토대기로 빠지는데, 마지막에 올린 수강증을 기반으로 등업처리를 해주면 좋겠어").
 *
 * 그전에는 그 달 반에 이미 배정된 학생의 수강증은 자동 승인하지 않고(`already_enrolled`) 모두 강사가 봤다 — 새로 넣으면 옛 반과 새 반을 둘 다 듣게 되고,
 * 단과를 둘 산 학생(같은 달 수강증 두 장)일 수도 있어서다. 이날 검토 대기에 쌓인 것은 거의 반을 바꾼 학생이었다:
 * 같은 반을 새로 캡처(#150) · 120분 → 실전속성(#156, 시간이 겹친다) · 850 RC단과 → 850 주5일 60분(#86, 같은 레벨 다른 시간).
 * 그래서 **같은 등록을 바꾼 것이 분명할 때만** 새 수강증으로 바꿔 넣는다 — 기존 등록(수강증 한 장)과 새 수강증이:
 *  1. 같은 반이 하나라도 있다 (같은 수업을 다시 캡처 · 현장 ↔ 불라방)
 *  2. 같은 달 · 같은 트랙에 **시간이 겹친다** (한 사람이 동시에 들을 수 없다 — 120분 → 속성반, 주3일 ↔ 주5일, 60분 ↔ 120분, 같은 시간 레벨 변경)
 *  3. **같은 레벨**이다 (오전 ↔ 저녁, 단과 ↔ 종합) — 같은 레벨을 두 벌 사는 일은 없다.
 *     **단 둘 다 단과(시간 하나)면 다른 단과를 하나 더 산 것일 수 있다** (2026-10-06 그날 실제로 있었다 — 650 월수금 10:00 RC + 화목금 11:10 RC) —
 *     과목과 과정까지 같을 때만(오전 ↔ 저녁처럼 같은 수업) 바꾼 것으로 보고, 아니면 강사가 본다
 * 바꿔 넣는 것은 **그 등록 전체**다 — 주5일 → 주3일이면 한 트랙만 겹쳐도 다른 트랙까지 함께 뺀다 (그 수강증이 통째로 바뀌었다).
 *
 * **강사에게 넘기는 것** (예전처럼 검토 대기 — 짐작으로 반을 빼지 않는다):
 *  - 다른 레벨이고 시간도 안 겹친다 (#113 — 750 LC단과가 있는데 850 수강증. 강사가 보니 둘 다 듣는 학생이었다)
 *  - 둘 다 단과인데 과목이나 과정이 다르다 (단과 두 개)
 *  - 바꿔야 할 등록이 **강사가 수강증 없이 넣은 배정**이다 — 기계는 사람이 직접 짠 배정을 빼지 않는다
 * 화면 · DB 가 없는 순수 함수라 테스트로 굳힌다 (`class-change.test.ts`).
 */

export type ChangeSection = {
  id: number;
  track: string;
  time_block: string | null;
  term_id: number;
  /** 기수의 달 (1~12) — 시간 겹침을 같은 달 안에서만 본다 */
  month: number | null;
  subject?: string | null;
  /** 과정 A · B (`class_sections.book_set`) */
  book_set?: string | null;
  course: { target_score: number | null; program?: string | null; course_type?: string | null } | null;
};

/** 이 학생의 지금 배정 한 줄 — 등록(`enrollment_orders`)과 그 등록을 만든 수강증 */
export type ChangeEnrollment = {
  id: number;
  order_id: number;
  mode: string;
  section: ChangeSection;
  /** 등록을 만든 수강증 (`enrollment_orders.verification_id`). null = 강사가 수강증 없이 넣은 배정 */
  receipt: number | null;
};

export type ClassChangePlan =
  /** 바꿔 넣는다 — absorb = 새 수강증과 같은 반이라 새 등록으로 옮겨 올 배정, remove = 뺄 배정, insert = 새로 넣을 반 */
  | { kind: "replace"; absorb: ChangeEnrollment[]; remove: ChangeEnrollment[]; insert: number[]; orders: number[]; receipts: number[] }
  /** 강사가 본다 — reason 은 승인 화면에 적는다 */
  | { kind: "review"; reason: string }
  /** 그 달 배정이 없다 — 반을 바꾼 것이 아니다 */
  | { kind: "none" };

type Relation = "same" | "ambiguous" | "other";

/** 시간 하나(60 · 70분)짜리 단과인가 — 그 과목. 주5일 60분(두 과목) · 묶음 · 속성반은 아니다 */
function singleOf(sections: readonly ChangeSection[]): string | null {
  return sections.length === 1 ? singleSubjectOf(sections) : null;
}

const levelsOf = (sections: readonly ChangeSection[]) => new Set(sections.flatMap((s) => (s.course?.target_score != null ? [s.course.target_score] : [])));

function relate(old: readonly ChangeSection[], next: readonly ChangeSection[]): Relation {
  if (old.some((o) => next.some((n) => n.id === o.id))) return "same";
  const a = slotsOfSections(old.map((s) => ({ ...s, term: s.month != null ? { month: s.month } : null })));
  const b = slotsOfSections(next.map((s) => ({ ...s, term: s.month != null ? { month: s.month } : null })));
  // 달 · 트랙을 모르는 칸으로는 겹친다고 보지 않는다 — 확실할 때만 뺀다
  if (a && b && slotsClash(a, b, { strict: true })) return "same";
  const nextLevels = levelsOf(next);
  if (![...levelsOf(old)].some((l) => nextLevels.has(l))) return "other";
  const oldSingle = singleOf(old);
  const nextSingle = singleOf(next);
  if (oldSingle && nextSingle) {
    const o = old[0];
    const n = next[0];
    // 같은 수업(같은 과목 · 같은 과정)을 시간만 옮긴 것 — 오전 ↔ 저녁. 과정을 모르면 같다고 하지 않는다
    return oldSingle === nextSingle && !!o.book_set && o.book_set === n.book_set ? "same" : "ambiguous";
  }
  return "same";
}

export function planClassChange(input: { next: readonly ChangeSection[]; existing: readonly ChangeEnrollment[] }): ClassChangePlan {
  const next = input.next;
  if (next.length === 0) return { kind: "review", reason: "새 수강증의 반을 정하지 못했어요" };
  const terms = new Set(next.map((s) => s.term_id));
  const sameTerm = input.existing.filter((e) => terms.has(e.section.term_id));
  if (sameTerm.length === 0) return { kind: "none" };

  const orders = new Map<number, ChangeEnrollment[]>();
  for (const e of sameTerm) orders.set(e.order_id, [...(orders.get(e.order_id) ?? []), e]);

  const same: ChangeEnrollment[][] = [];
  for (const list of orders.values()) {
    const relation = relate(
      list.map((e) => e.section),
      next,
    );
    if (relation === "ambiguous") return { kind: "review", reason: "그 달 단과가 이미 있어요 — 단과를 하나 더 들은 건지 바꾼 건지 강사가 확인해요" };
    if (relation === "same") same.push(list);
  }
  if (same.length === 0) return { kind: "review", reason: "그 달 다른 레벨 반이 이미 있어요 — 반을 더한 건지 바꾼 건지 강사가 확인해요" };
  if (same.some((list) => list.some((e) => e.receipt == null))) {
    return { kind: "review", reason: "강사가 직접 넣은 그 달 배정이 있어요 — 바꿀지 강사가 확인해요" };
  }

  const nextIds = new Set(next.map((s) => s.id));
  const replaced = same.flat();
  const absorb = replaced.filter((e) => nextIds.has(e.section.id));
  const absorbed = new Set(absorb.map((e) => e.section.id));
  return {
    kind: "replace",
    absorb,
    remove: replaced.filter((e) => !nextIds.has(e.section.id)),
    insert: [...nextIds].filter((id) => !absorbed.has(id)),
    orders: [...new Set(replaced.map((e) => e.order_id))],
    receipts: [...new Set(replaced.flatMap((e) => (e.receipt != null ? [e.receipt] : [])))],
  };
}

/** 승인 화면이 읽는 반 변경 기록 (`candidates.classChange`) — 배정 줄 전체는 남기지 않고 무엇을 뺐는지만. 반을 바꾼 것이 아니면(none) null */
export function classChangeLog(plan: ClassChangePlan) {
  if (plan.kind === "replace") {
    return { kind: "replace", receipts: plan.receipts, orders: plan.orders, removed: plan.remove.map((e) => e.section.id), absorbed: plan.absorb.map((e) => e.section.id) };
  }
  return plan.kind === "review" ? { kind: "review", reason: plan.reason } : null;
}
