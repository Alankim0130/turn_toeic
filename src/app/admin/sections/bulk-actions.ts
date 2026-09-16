"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireStaff, isAdmin } from "@/lib/auth";
import type { Database } from "@/lib/supabase/database.types";
import { sectionKeyOf, timeBlockOf } from "@/components/admin/sections/bulk";
import { SEASON_LABEL, seasonOfMonth } from "@/lib/timetable";
import { blockContains } from "@/lib/time-blocks";
import { subjectOf } from "@/lib/instructor-subject";

/**
 * 반 일괄 개설: 시간표(레벨·시간대) × 강좌 × 트랙 조합에서 고른 것만 한 번에 만든다.
 * 한 달에 열리는 반이 수십 개라 하나씩 만들면 오래 걸린다 (2026-09-16 Alan 요청).
 * 불라방은 별도 반이 아니라 같은 반의 수강 방식이므로, 반마다 현장·불라방 수강료를 함께 넣는다.
 * 같은 (강좌 · 트랙 · 시간대) 반이 이미 있으면 건너뛴다.
 */
type SectionInsert = Database["public"]["Tables"]["class_sections"]["Insert"];

export type BulkRow = {
  courseId: number;
  slotId: number | null;
  track: string;
  tuition: number | null;
  liveTuition: number | null;
  capacity: number | null;
  status: string;
  /** LC 교재 세트 (A|B). 시간대마다 정해지고 달마다 뒤바뀐다 */
  bookSet?: string | null;
};
export type BulkResult = { ok: boolean; error?: string; created?: number; skipped?: number };

export async function bulkCreateSections(input: { termId: number; instructorId?: string | null; rows: BulkRow[] }): Promise<BulkResult> {
  const { user, profile } = await requireStaff();
  const termId = Number(input.termId);
  const rows = Array.isArray(input.rows) ? input.rows : [];
  if (!Number.isInteger(termId)) return { ok: false, error: "기수(월)가 선택되지 않았어요." };
  if (rows.length === 0) return { ok: false, error: "개설할 반을 하나 이상 골라 주세요." };
  if (rows.length > 200) return { ok: false, error: "한 번에 200개까지 만들 수 있어요." };

  const supabase = await createClient();
  const [{ data: term }, { data: classDates }, { data: slots }, { data: courses }, { data: existing }, { data: teachers }] = await Promise.all([
    supabase.from("terms").select("year, month, enrollment_opens_at, closes_at").eq("id", termId).maybeSingle(),
    supabase.from("term_class_dates").select("track").eq("term_id", termId),
    supabase.from("timetable_slots").select("id, level, program, season, start_time, end_time"),
    supabase.from("courses").select("id, program, target_score").eq("is_active", true),
    supabase.from("class_sections").select("course_id, track, time_block").eq("term_id", termId),
    // 과목이 정해진 강사 (이혜영 LC · 이영수 RC) — 반의 LC 교재로 담당을 저절로 정한다
    supabase.from("profiles").select("id, subject").in("role", ["instructor", "admin"]).not("subject", "is", null),
  ]);
  if (!term) return { ok: false, error: "기수(월)를 찾을 수 없어요." };
  if (!term.enrollment_opens_at || !term.closes_at) {
    return { ok: false, error: "먼저 달력에서 개강일·종강일을 찍고 생성하기를 눌러 주세요." };
  }

  // 평달과 방학달은 시간대가 다르다 (2026-09-16 Alan) — 이 기수의 계절에 맞는 시간대만 쓴다
  const season = seasonOfMonth(term.month);
  const slotById = new Map((slots ?? []).map((s) => [s.id, s]));
  const courseById = new Map((courses ?? []).map((c) => [c.id, c]));
  const taken = new Set((existing ?? []).map((s) => sectionKeyOf(s.course_id, s.track, s.time_block)));
  const sessionsOf = (t: string) => (classDates ?? []).filter((d) => d.track === t).length || 1;
  const fallbackInstructor = isAdmin(profile.role) && input.instructorId ? input.instructorId : user.id;
  // 과목 → 강사. 반의 LC 교재(book_set)가 그 시간의 과목을 말해 준다 (lib/instructor-subject.ts)
  const bySubject = new Map<string, string>();
  for (const t of teachers ?? []) if (t.subject) bySubject.set(t.subject, t.id);
  // 같은 강좌·시간대 묶음에 LC 교재가 하나라도 있어야 과목을 읽을 수 있다 (한쪽이 LC 면 반대쪽이 RC)
  const groupHasBook = new Set(
    rows.filter((r) => r.bookSet === "A" || r.bookSet === "B").map((r) => `${Number(r.courseId)}|${r.slotId ?? ""}`),
  );

  /**
   * 담당 강사 (2026-09-16 Alan "자동으로 LC 이혜영, RC 이영수").
   * 묶음 반·스파르타 반은 두 과목을 이어 들어 담당이 한 명이 아니므로 비운다 —
   * 만든 사람을 넣어 두면 학생에게 틀린 이름이 보인다. 과목 강사가 아직 없으면 고른 사람으로 둔다.
   */
  const instructorOf = (courseId: number, slotId: number | null, bookSet: string | null, isPackage: boolean) => {
    const subject = subjectOf({ bookSet, isPackage, groupHasBook: groupHasBook.has(`${courseId}|${slotId ?? ""}`) });
    if (!subject) return isPackage ? null : fallbackInstructor;
    return bySubject.get(subject) ?? fallbackInstructor;
  };

  const inserts: SectionInsert[] = [];
  let skipped = 0;
  for (const r of rows) {
    const courseId = Number(r.courseId);
    const course = courseById.get(courseId);
    if (!course) return { ok: false, error: "강좌를 찾을 수 없어요. 새로고침한 뒤 다시 시도해 주세요." };
    if (r.track !== "mwf" && r.track !== "ttf") return { ok: false, error: "트랙 값이 올바르지 않아요." };
    if (!["draft", "open"].includes(r.status)) return { ok: false, error: "상태 값이 올바르지 않아요." };

    // 수강료는 선택 — 등록은 YBM 에서 한다 (2026-09-16 Alan)
    const tuition = r.tuition == null ? null : Number(r.tuition);
    if (tuition !== null && (!Number.isInteger(tuition) || tuition < 0)) return { ok: false, error: "현장 수강료는 0 이상 숫자로 입력해 주세요." };
    const live = r.liveTuition == null ? null : Number(r.liveTuition);
    if (live !== null && (!Number.isInteger(live) || live < 0)) return { ok: false, error: "불라방 수강료는 0 이상 숫자로 입력해 주세요." };
    const capacity = r.capacity == null ? null : Number(r.capacity);
    if (capacity !== null && (!Number.isInteger(capacity) || capacity < 1)) return { ok: false, error: "정원은 1명 이상이어야 해요." };

    const slot = r.slotId == null ? null : slotById.get(Number(r.slotId));
    if (r.slotId != null && !slot) return { ok: false, error: "시간대를 찾을 수 없어요. 새로고침한 뒤 다시 시도해 주세요." };
    // 묶음 시간대(120분 · 140분: 같은 레벨 시간표에 안에 들어오는 시간 단위가 있는 것)에는 교재를 두지 않는다 —
    // 묶음 반 학생은 안에 든 시간 단위 반의 교재를 쓴다. 스파르타 반도 함께 듣는 점수보장반의 교재를 쓴다
    const isPackage =
      !!slot &&
      (slots ?? []).some(
        (o) => o.id !== slot.id && o.level === slot.level && o.program === slot.program && o.season === slot.season && blockContains(timeBlockOf(slot.start_time, slot.end_time), timeBlockOf(o.start_time, o.end_time)),
      );
    const bookSet = course.program !== "sparta" && !isPackage && (r.bookSet === "A" || r.bookSet === "B") ? r.bookSet : null;
    // 점수보장반 시간대로 스파르타 반을 만들거나 그 반대가 되면 반의 시간·권한 판정이 틀어진다
    if (slot && (slot.program !== course.program || slot.level !== course.target_score)) {
      return { ok: false, error: "강좌와 맞지 않는 시간대예요. 새로고침한 뒤 다시 시도해 주세요." };
    }
    if (slot && slot.season !== season) {
      return { ok: false, error: `${term.month}월은 ${SEASON_LABEL[season]}이라 ${SEASON_LABEL[slot.season as "regular" | "vacation"] ?? slot.season} 시간대로는 반을 만들 수 없어요. 새로고침한 뒤 다시 시도해 주세요.` };
    }
    const timeBlock = slot ? timeBlockOf(slot.start_time, slot.end_time) : null;

    const key = sectionKeyOf(courseId, r.track, timeBlock);
    if (taken.has(key)) {
      skipped++;
      continue;
    }
    taken.add(key);

    inserts.push({
      term_id: termId,
      course_id: courseId,
      track: r.track,
      time_block: timeBlock,
      enrollment_opens_at: term.enrollment_opens_at,
      closes_at: term.closes_at,
      target_sessions: sessionsOf(r.track),
      instructor_id: instructorOf(courseId, r.slotId == null ? null : Number(r.slotId), bookSet, isPackage),
      tuition,
      live_tuition: live,
      capacity,
      status: r.status,
      book_set: bookSet,
      bundle_id: null,
    });
  }

  if (inserts.length > 0) {
    const { error } = await supabase.from("class_sections").insert(inserts);
    if (error) {
      return { ok: false, error: error.code === "42501" ? "권한이 없어요. 본인 반만 만들 수 있습니다." : "반을 개설하지 못했어요. 잠시 후 다시 시도해 주세요." };
    }
  }

  revalidatePath("/admin/sections");
  revalidatePath("/admin");
  revalidatePath("/");
  return { ok: true, created: inserts.length, skipped };
}
