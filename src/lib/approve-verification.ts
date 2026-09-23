import "server-only";
import type { createAdminClient } from "./supabase/admin";
import { assignableError, orderWindow } from "./enrollment-window";
import { planManualApproval, type AssignmentPlan } from "./final-assignment";
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
  /**
   * **스태프 수동 승인만 true** (2026-09-23 Alan — "직접 지정한 등급으로 최종 등급으로 저장"). 체크한 반이 그 달의 **최종 배정**이 된다 —
   * 이미 있던 배정은 이 등록으로 옮겨 오고, 승인 화면에 떠 있었는데 체크를 뺀 같은 달 배정은 뺀다 (`planManualApproval`).
   * OCR 자동 승인 · 받아 둔 수강증 다시 맞추기는 false(기본) — 기존 배정이 있으면 멈추고 검토로 넘긴다 (기계는 사람의 배정을 바꾸지 않는다).
   */
  final?: boolean;
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
 * 매일 00:00 KST 배치(`private.run_daily_status_transition`)가 등록을 `expired`, 등급을 `alumni` 로 바꾼다.
 * 기간·상태 규칙은 `enrollment-window.ts` 한곳 — 한 달의 반만, 종강 전 반만 (스태프 반 배정과 같다).
 */
export async function approveVerificationWith(admin: Admin, input: ApproveInput): Promise<ApproveResult> {
  const sectionIds = [...new Set(input.sectionIds)];
  if (sectionIds.length === 0) return { ok: false, error: "배정할 반이 없습니다." };

  const { data: sections } = await admin.from("class_sections").select("id, term_id, enrollment_opens_at, closes_at").in("id", sectionIds);
  if (!sections || sections.length !== sectionIds.length) return { ok: false, error: "선택한 반을 찾을 수 없습니다." };

  const today = todayKST();
  const invalid = assignableError(sections, today);
  if (invalid) return { ok: false, error: invalid };
  const { activatesOn, accessUntil, status } = orderWindow(sections, today);

  // 수동 승인이면 같은 달 기존 배정을 읽어 무엇을 옮기고 · 넣고 · 뺄지 정한다. 자동 승인은 늘 전부 새로 넣는다
  let plan: AssignmentPlan = { absorb: [], insert: sections.map((s) => s.id), remove: [] };
  const oldMode = new Map<number, string>();
  if (input.final) {
    const [{ data: mine, error: mineErr }, { data: open, error: openErr }] = await Promise.all([
      admin
        .from("enrollments")
        .select("id, order_id, section_id, mode, section:class_sections!enrollments_section_id_fkey(term_id)")
        .eq("student_id", input.userId),
      // 승인 화면의 반 고르기와 같은 조건 — 화면에 뜰 수 없던 반은 체크가 없어도 빼지 않는다
      admin.from("class_sections").select("id").eq("status", "open").gte("closes_at", today),
    ]);
    if (mineErr || openErr) return { ok: false, error: `지금 배정을 읽지 못했습니다. ${(mineErr ?? openErr)?.message ?? ""}` };
    const existing = (mine ?? []).flatMap((e) =>
      e.section && e.section_id != null && e.order_id != null ? [{ id: e.id, order_id: e.order_id, section_id: e.section_id, term_id: e.section.term_id }] : [],
    );
    for (const e of mine ?? []) oldMode.set(e.id, e.mode);
    plan = planManualApproval({ chosen: sections, existing, selectable: new Set((open ?? []).map((s) => s.id)) });
  }

  const { data: order, error: orderErr } = await admin
    .from("enrollment_orders")
    .insert({ user_id: input.userId, verification_id: input.verificationId, months: 1, status, activates_on: activatesOn, access_until: accessUntil })
    .select("id")
    .single();
  if (orderErr || !order) return { ok: false, error: `등록 생성에 실패했습니다. ${orderErr?.message ?? ""}` };

  // 순서가 중요하다 — 실패하면 되돌릴 수 있는 것부터 한다. 새 등록을 지우면 그 안의 배정이 cascade 로 함께 지워지므로,
  // 옮겨 온 기존 배정은 등록을 지우기 **전에** 제자리로 돌려놓는다
  if (plan.insert.length > 0) {
    const rows: TablesInsert<"enrollments">[] = plan.insert.map((sectionId) => ({
      order_id: order.id,
      student_id: input.userId,
      section_id: sectionId,
      status: "active",
      mode: input.mode,
    }));
    const { error: enrErr } = await admin.from("enrollments").insert(rows);
    if (enrErr) {
      await admin.from("enrollment_orders").delete().eq("id", order.id);
      return { ok: false, error: enrErr.code === "23505" ? "이미 같은 반에 배정된 수강생입니다." : `반 배정에 실패했습니다. ${enrErr.message}` };
    }
  }
  if (plan.absorb.length > 0) {
    // 한 문장이라 전부 옮겨지거나 하나도 안 옮겨진다
    const { error: moveErr } = await admin
      .from("enrollments")
      .update({ order_id: order.id, mode: input.mode, status: "active" })
      .in("id", plan.absorb.map((e) => e.id));
    if (moveErr) {
      await admin.from("enrollment_orders").delete().eq("id", order.id);
      return { ok: false, error: `기존 배정을 옮기지 못했습니다. ${moveErr.message}` };
    }
  }

  const patch: TablesUpdate<"enrollment_verifications"> = { result: "approved", matched_section: sections[0].id, reject_reason: null };
  if (input.candidates !== undefined) patch.candidates = input.candidates;
  if (input.confidence !== undefined) patch.confidence = input.confidence;
  const { error: verErr } = await admin.from("enrollment_verifications").update(patch).eq("id", input.verificationId);
  if (verErr) {
    for (const e of plan.absorb) await admin.from("enrollments").update({ order_id: e.order_id, mode: oldMode.get(e.id) ?? input.mode }).eq("id", e.id);
    await admin.from("enrollment_orders").delete().eq("id", order.id);
    return { ok: false, error: `승인 기록 저장에 실패했습니다. ${verErr.message}` };
  }

  // 승인은 끝났다 — 체크를 뺀 같은 달 배정을 빼고, 비게 된 옛 등록을 지운다.
  // 여기서 실패해도 되돌리지 않는다: 학생은 반을 잃지 않고(옛 반이 남을 뿐) 승인은 그대로다
  if (plan.remove.length > 0) {
    const { error } = await admin.from("enrollments").delete().in("id", plan.remove.map((e) => e.id));
    if (error) console.error("[approve] 체크를 뺀 기존 배정을 빼지 못했어요", error.message);
  }
  const oldOrders = [...new Set([...plan.absorb, ...plan.remove].map((e) => e.order_id))].filter((id) => id !== order.id);
  if (oldOrders.length > 0) {
    const { data: still } = await admin.from("enrollments").select("order_id").in("order_id", oldOrders);
    const emptied = oldOrders.filter((id) => !(still ?? []).some((r) => r.order_id === id));
    if (emptied.length > 0) {
      const { error } = await admin.from("enrollment_orders").delete().in("id", emptied);
      if (error) console.error("[approve] 비게 된 옛 등록을 지우지 못했어요", error.message);
    }
  }

  if (status === "active") await promoteToStudent(admin, input.userId);

  return { ok: true, orderId: order.id, status };
}
