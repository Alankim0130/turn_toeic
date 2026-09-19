import "server-only";
import type { createAdminClient } from "./supabase/admin";
import type { Json, TablesInsert, TablesUpdate } from "./supabase/database.types";
import { promoteToStudent } from "./student-role";
import { todayKST } from "./utils";

type Admin = ReturnType<typeof createAdminClient>;

export type ApproveInput = {
  verificationId: number;
  userId: string;
  sectionIds: number[];
  mode: "onsite" | "live";
  /** 자동 승인이면 대조 기록·신뢰도를 함께 남긴다 */
  candidates?: Json;
  confidence?: number | null;
};

export type ApproveResult = { ok: true; orderId: number; status: "active" | "preliminary" } | { ok: false; error: string };

/**
 * 등업 승인의 본체 — **스태프 승인과 OCR 자동 승인이 같은 코드를 쓴다** (2026-09-18).
 *
 * 등록 1건(`enrollment_orders`, 개강일 = 고른 반 중 가장 이른 개강일, 시청 만료일 = 가장 늦은 종강일) +
 * 반마다 배정(`enrollments`) + 검증 기록 `approved` + 개강일이 지났으면 `student` 로 올린다.
 * 어느 단계가 실패하면 만든 등록을 지워 되돌린다. 권한 검사는 호출한 쪽이 한다 (service_role 로 쓴다).
 *
 * **권한 회수는 여기서 하지 않는다** — 종강일이 지나면 RLS(`private.has_term_access`)가 그날부터 막고,
 * 매일 00:05 KST 배치(`private.run_daily_status_transition`)가 등록을 `expired`, 등급을 `alumni` 로 바꾼다.
 */
export async function approveVerificationWith(admin: Admin, input: ApproveInput): Promise<ApproveResult> {
  const sectionIds = [...new Set(input.sectionIds)];
  if (sectionIds.length === 0) return { ok: false, error: "배정할 반이 없습니다." };

  const { data: sections } = await admin.from("class_sections").select("id, enrollment_opens_at, closes_at").in("id", sectionIds);
  if (!sections || sections.length !== sectionIds.length) return { ok: false, error: "선택한 반을 찾을 수 없습니다." };

  const today = todayKST();
  const activatesOn = sections.map((s) => s.enrollment_opens_at).sort()[0];
  const accessUntil = sections.map((s) => s.closes_at).sort().at(-1)!;
  const status = activatesOn <= today ? "active" : "preliminary";

  const { data: order, error: orderErr } = await admin
    .from("enrollment_orders")
    .insert({ user_id: input.userId, verification_id: input.verificationId, months: 1, status, activates_on: activatesOn, access_until: accessUntil })
    .select("id")
    .single();
  if (orderErr || !order) return { ok: false, error: `등록 생성에 실패했습니다. ${orderErr?.message ?? ""}` };

  const rows: TablesInsert<"enrollments">[] = sections.map((s) => ({
    order_id: order.id,
    student_id: input.userId,
    section_id: s.id,
    status: "active",
    mode: input.mode,
  }));
  const { error: enrErr } = await admin.from("enrollments").insert(rows);
  if (enrErr) {
    await admin.from("enrollment_orders").delete().eq("id", order.id);
    return { ok: false, error: enrErr.code === "23505" ? "이미 같은 반에 배정된 수강생입니다." : `반 배정에 실패했습니다. ${enrErr.message}` };
  }

  const patch: TablesUpdate<"enrollment_verifications"> = { result: "approved", matched_section: sections[0].id, reject_reason: null };
  if (input.candidates !== undefined) patch.candidates = input.candidates;
  if (input.confidence !== undefined) patch.confidence = input.confidence;
  const { error: verErr } = await admin.from("enrollment_verifications").update(patch).eq("id", input.verificationId);
  if (verErr) {
    await admin.from("enrollment_orders").delete().eq("id", order.id);
    return { ok: false, error: `승인 기록 저장에 실패했습니다. ${verErr.message}` };
  }

  if (status === "active") await promoteToStudent(admin, input.userId);

  return { ok: true, orderId: order.id, status };
}
