"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireStaff, isAdmin } from "@/lib/auth";
import type { Database } from "@/lib/supabase/database.types";
import { sectionKeyOf, timeBlockOf } from "@/components/admin/sections/bulk";

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
  const [{ data: term }, { data: classDates }, { data: slots }, { data: courses }, { data: existing }] = await Promise.all([
    supabase.from("terms").select("year, month, enrollment_opens_at, closes_at").eq("id", termId).maybeSingle(),
    supabase.from("term_class_dates").select("track").eq("term_id", termId),
    supabase.from("timetable_slots").select("id, level, start_time, end_time"),
    supabase.from("courses").select("id").eq("is_active", true),
    supabase.from("class_sections").select("course_id, track, time_block").eq("term_id", termId),
  ]);
  if (!term) return { ok: false, error: "기수(월)를 찾을 수 없어요." };
  if (!term.enrollment_opens_at || !term.closes_at) {
    return { ok: false, error: "먼저 달력에서 개강일·종강일을 찍고 생성하기를 눌러 주세요." };
  }

  const slotById = new Map((slots ?? []).map((s) => [s.id, s]));
  const courseIds = new Set((courses ?? []).map((c) => c.id));
  const taken = new Set((existing ?? []).map((s) => sectionKeyOf(s.course_id, s.track, s.time_block)));
  const sessionsOf = (t: string) => (classDates ?? []).filter((d) => d.track === t).length || 1;
  const instructorId = isAdmin(profile.role) && input.instructorId ? input.instructorId : user.id;

  const inserts: SectionInsert[] = [];
  let skipped = 0;
  for (const r of rows) {
    const courseId = Number(r.courseId);
    if (!courseIds.has(courseId)) return { ok: false, error: "강좌를 찾을 수 없어요. 새로고침한 뒤 다시 시도해 주세요." };
    if (r.track !== "mwf" && r.track !== "ttf") return { ok: false, error: "트랙 값이 올바르지 않아요." };
    if (!["draft", "open"].includes(r.status)) return { ok: false, error: "상태 값이 올바르지 않아요." };

    // 수강료는 선택 — 등록은 YBM 에서 한다 (2026-09-16 Alan)
    const tuition = r.tuition == null ? null : Number(r.tuition);
    if (tuition !== null && (!Number.isInteger(tuition) || tuition < 0)) return { ok: false, error: "현장 수강료는 0 이상 숫자로 입력해 주세요." };
    const live = r.liveTuition == null ? null : Number(r.liveTuition);
    if (live !== null && (!Number.isInteger(live) || live < 0)) return { ok: false, error: "불라방 수강료는 0 이상 숫자로 입력해 주세요." };
    const capacity = r.capacity == null ? null : Number(r.capacity);
    if (capacity !== null && (!Number.isInteger(capacity) || capacity < 1)) return { ok: false, error: "정원은 1명 이상이어야 해요." };

    const bookSet = r.bookSet === "A" || r.bookSet === "B" ? r.bookSet : null;

    const slot = r.slotId == null ? null : slotById.get(Number(r.slotId));
    if (r.slotId != null && !slot) return { ok: false, error: "시간대를 찾을 수 없어요. 새로고침한 뒤 다시 시도해 주세요." };
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
      instructor_id: instructorId,
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
