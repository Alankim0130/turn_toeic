import "server-only";
import type { createAdminClient } from "./supabase/admin";
import type { EnrollSection } from "./enroll-options";
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
    .select("id, track, time_block, term:terms(year, month), course:courses(id, name, program, target_score)")
    .eq("status", "open")
    .gte("closes_at", todayKST())
    .order("enrollment_opens_at")
    .order("time_block");
  return data ?? [];
}
