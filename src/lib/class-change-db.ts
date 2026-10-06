import "server-only";
import type { createAdminClient } from "./supabase/admin";
import { planClassChange, type ChangeEnrollment, type ChangeSection, type ClassChangePlan } from "./class-change";

type Admin = ReturnType<typeof createAdminClient>;

const SECTION_COLUMNS = "id, track, time_block, term_id, subject, book_set, term:terms(month), course:courses(target_score, program, course_type)";

type SectionRow = {
  id: number;
  track: string;
  time_block: string | null;
  term_id: number;
  subject: string | null;
  book_set: string | null;
  term: { month: number } | null;
  course: { target_score: number | null; program: string | null; course_type: string | null } | null;
};

const toChange = (s: SectionRow): ChangeSection => ({
  id: s.id,
  track: s.track,
  time_block: s.time_block,
  term_id: s.term_id,
  month: s.term?.month ?? null,
  subject: s.subject,
  book_set: s.book_set,
  course: s.course,
});

/**
 * 새 수강증의 반(`sectionIds`)과 이 학생의 같은 달 배정을 읽어 **반을 바꾼 것인지** 정한다 (`planClassChange`, 2026-10-06).
 * 읽지 못하면 강사에게 넘긴다 — 근거 없이 배정을 빼지 않는다.
 */
export async function planClassChangeFor(admin: Admin, userId: string, sectionIds: readonly number[]): Promise<ClassChangePlan> {
  const [{ data: next, error: nextErr }, { data: mine, error: mineErr }] = await Promise.all([
    admin.from("class_sections").select(SECTION_COLUMNS).in("id", [...sectionIds]),
    admin
      .from("enrollments")
      .select(`id, order_id, mode, section:class_sections!enrollments_section_id_fkey(${SECTION_COLUMNS}), order:enrollment_orders!enrollments_order_id_fkey(verification_id)`)
      .eq("student_id", userId),
  ]);
  if (nextErr || mineErr || !next || next.length !== sectionIds.length) {
    if (nextErr || mineErr) console.error(`[verify] 반 변경을 판단하지 못했어요: ${(nextErr ?? mineErr)?.message}`);
    return { kind: "review", reason: "지금 배정을 읽지 못했어요" };
  }
  const existing: ChangeEnrollment[] = (mine ?? []).flatMap((e) =>
    e.section && e.order_id != null
      ? [{ id: e.id, order_id: e.order_id, mode: e.mode, section: toChange(e.section as SectionRow), receipt: e.order?.verification_id ?? null }]
      : [],
  );
  return planClassChange({ next: (next as SectionRow[]).map(toChange), existing });
}
