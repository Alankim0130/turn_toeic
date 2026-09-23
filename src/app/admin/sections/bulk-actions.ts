"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rematchHeldVerifications } from "@/lib/rematch-held";
import { requireStaff, isAdmin } from "@/lib/auth";
import type { Database } from "@/lib/supabase/database.types";
import { sectionKeyOf, timeBlockOf } from "@/components/admin/sections/bulk";
import { SEASON_LABEL, seasonOfMonth } from "@/lib/timetable";
import { blockContains } from "@/lib/time-blocks";

/**
 * 반 일괄 개설: 시간표(레벨·시간대) × 강좌 × 트랙 조합에서 고른 것만 한 번에 만든다.
 * 한 달에 열리는 반이 수십 개라 하나씩 만들면 오래 걸린다 (2026-09-16 Alan 요청).
 * 수강료는 받지 않는다 (2026-09-18 Alan "수강료 부분은 다 삭제") — 불라방은 별도 반이 아니라 같은 반의 수강 방식(enrollments.mode)이다.
 * 같은 (강좌 · 트랙 · 시간대) 반이 이미 있으면 건너뛴다.
 */
type SectionInsert = Database["public"]["Tables"]["class_sections"]["Insert"];

export type BulkRow = {
  courseId: number;
  slotId: number | null;
  track: string;
  capacity: number | null;
  status: string;
  /** 과목 (lc|rc). 시간 단위 반마다, 트랙마다 다르고 달이 바뀌어도 그대로 (2026-09-23) */
  subject?: string | null;
  /** 과정 A|B. (강좌·시간대) 단위로 두 트랙이 같고 달마다 뒤바뀐다. LC 시간에는 곧 LC 교재 */
  bookSet?: string | null;
};
export type BulkResult = { ok: boolean; error?: string; created?: number; skipped?: number };

export async function bulkCreateSections(input: { termId: number; instructorId?: string | null; rows: BulkRow[] }): Promise<BulkResult> {
  const { profile } = await requireStaff();
  const termId = Number(input.termId);
  const rows = Array.isArray(input.rows) ? input.rows : [];
  if (!Number.isInteger(termId)) return { ok: false, error: "기수(월)가 선택되지 않았어요." };
  if (rows.length === 0) return { ok: false, error: "개설할 반을 하나 이상 골라 주세요." };
  if (rows.length > 200) return { ok: false, error: "한 번에 200개까지 만들 수 있어요." };

  const supabase = await createClient();
  const [{ data: term }, { data: classDates }, { data: slots }, { data: courses }, { data: existing }] = await Promise.all([
    supabase.from("terms").select("year, month, enrollment_opens_at, closes_at").eq("id", termId).maybeSingle(),
    supabase.from("term_class_dates").select("track").eq("term_id", termId),
    supabase.from("timetable_slots").select("id, level, program, season, start_time, end_time, ttf_recorded"),
    supabase.from("courses").select("id, program, target_score").eq("is_active", true),
    supabase.from("class_sections").select("course_id, track, time_block").eq("term_id", termId),
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
  /**
   * 담당 강사는 DB 가 저절로 정한다 (2026-09-18 Alan "앞으로도 반편성과 달에 따라서 자동으로 매칭").
   * 반이 들어가면 `class_sections` 트리거가 과목 칸(subject)으로 LC 이혜영 · RC 이영수를 넣고
   * 묶음·스파르타 반은 비운다 (마이그레이션 20260918120000 · 20260923160000, 규칙은 lib/instructor-subject.ts 와 같다).
   * 여기서는 **관리자가 일부러 고른 사람**만 넣는다 — 과목을 안 정한 반에만 남는다.
   * 만든 사람을 기본값으로 넣지 않는다: 2026-09-18 까지 9월 반 36개가 그래서 전부 알런이었다.
   */
  const pickedInstructor = isAdmin(profile.role) && input.instructorId ? input.instructorId : null;

  const inserts: SectionInsert[] = [];
  let skipped = 0;
  for (const r of rows) {
    const courseId = Number(r.courseId);
    const course = courseById.get(courseId);
    if (!course) return { ok: false, error: "강좌를 찾을 수 없어요. 새로고침한 뒤 다시 시도해 주세요." };
    if (r.track !== "mwf" && r.track !== "ttf") return { ok: false, error: "트랙 값이 올바르지 않아요." };
    if (!["draft", "open"].includes(r.status)) return { ok: false, error: "상태 값이 올바르지 않아요." };

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
    const leafScore = course.program !== "sparta" && !isPackage;
    const bookSet = leafScore && (r.bookSet === "A" || r.bookSet === "B") ? r.bookSet : null;
    // 과목도 시간 단위 반에만 — 묶음·스파르타는 두 과목을 이어 듣는다. 비어 있으면 담당 강사를 정하지 않는다 (짐작하지 않는다)
    const subject = leafScore && (r.subject === "lc" || r.subject === "rc") ? r.subject : null;
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
      instructor_id: isPackage || course.program === "sparta" ? null : pickedInstructor,
      capacity,
      status: r.status,
      book_set: bookSet,
      subject,
      // 저녁반 화목금은 인강 — 시간표가 정한다 (2026-09-17 Alan). 월수금은 그대로 현장
      recorded: !!slot?.ttf_recorded && r.track === "ttf",
      // 저녁 줄(화목금 인강이 켜진 시간대)의 불라방은 라이브만 — 오전반만 수업 뒤 다시보기로 연결한다 (2026-09-18 Alan)
      live_to_replay: !slot?.ttf_recorded,
      bundle_id: null,
    });
  }

  if (inserts.length > 0) {
    const { error } = await supabase.from("class_sections").insert(inserts);
    if (error) {
      return { ok: false, error: error.code === "42501" ? "권한이 없어요. 본인 반만 만들 수 있습니다." : "반을 개설하지 못했어요. 잠시 후 다시 시도해 주세요." };
    }
    // 모집 중인 반이 열렸다 — 받아 둔 다음 달 수강증을 다시 맞춰 예비등록생으로 배정한다 (2026-09-22, `rematchHeldVerifications`)
    if (inserts.some((r) => r.status === "open")) after(() => rematchHeldVerifications(createAdminClient(), { notify: true }));
  }

  revalidatePath("/admin/sections");
  revalidatePath("/admin");
  revalidatePath("/");
  return { ok: true, created: inserts.length, skipped };
}
