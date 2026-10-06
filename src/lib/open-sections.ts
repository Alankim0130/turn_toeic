import "server-only";
import type { createAdminClient } from "./supabase/admin";
import type { EnrollSection } from "./enroll-options";
import type { TwoWeekSlot } from "./match-sections";
import { todayKST } from "./utils";

type Client = Pick<ReturnType<typeof createAdminClient>, "from">;

/**
 * 지금 등업신청을 받는 반 — 아직 종강하지 않은 공개(`open`) 반.
 * **스태프가 승인할 수 있는 집합과 같아야 한다** (`/admin/verifications/[id]` 와 같은 조건) —
 * 학생이 고를 수 있는데 스태프가 승인 못 하는 반이 있으면 신청이 막힌다.
 * 학생 화면(세션)과 예비 접수 다시 맞추기(서버)가 **같은 조회**를 쓴다 — 조건이 갈라지면 학생이 본 반과 자동 배정이 어긋난다.
 */
export async function fetchOpenEnrollSections(client: Client): Promise<EnrollSection[]> {
  const { data } = await client
    .from("class_sections")
    // subject · course_type = 종합 · 단과를 가린다 (2026-10-06 — 수동 등업신청의 단과 고르기 · 승인 팝업의 RC단과 이름표)
    .select("id, track, time_block, subject, term:terms(year, month), course:courses(id, name, program, target_score, course_type)")
    .eq("status", "open")
    .gte("closes_at", todayKST())
    .order("enrollment_opens_at")
    .order("time_block");
  return data ?? [];
}

/**
 * 시간표의 2주완성 줄 — 달 줄 · 기본 줄 모두 (2026-10-05). 반 대조가 `twoWeekSpots(반, 이것)` 으로 2주완성이 열리는 자리를 센다 —
 * 그 달 2주완성 반을 아직 안 열었어도 2주완성 수강증은 먼저 온다. 읽지 못하면 빈 목록 (열린 반에서 센 것만 쓴다)
 */
export async function fetchTwoWeekSlots(client: Client): Promise<TwoWeekSlot[]> {
  const { data, error } = await client.from("timetable_slots").select("level, start_time, end_time").eq("program", "twoweek");
  if (error) console.error(`[verify] 2주완성 시간표를 읽지 못했어요: ${error.message}`);
  return data ?? [];
}
