import "server-only";
import type { createAdminClient } from "./supabase/admin";
import type { Json } from "./supabase/database.types";
import { closedByApproval, replacedByUpload, seatOfRow, seatSectionIds, type ReceiptSeat, type SeatSection } from "./receipt-seat";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * 한 학생의 **확인 중인 등업신청**을 새 수강증 · 승인과 견줘 지우거나 닫는다 (2026-10-06 Alan — 한 학생이 RC단과를 두 개 등록했다).
 * 무엇이 "같은 등록" 인지는 순수 함수 한곳(`receipt-seat.ts`)이 정한다 — 같은 그림 · 같은 반 · 같은 달 같은 트랙에 시간이 겹침.
 * 함께 들을 수 있는 다른 강좌의 수강증(단과 두 개)은 지우지도 닫지도 않는다.
 * 서버 액션 파일(`"use server"`)에 두면 내보낸 함수가 모두 호출 가능한 액션이 되므로 여기 따로 둔다.
 */

type PendingRow = {
  id: number;
  file_path: string;
  file_hash: string | null;
  requested_section_ids: number[] | null;
  candidates: Json | null;
  parsed: Json | null;
};

/** 반 id → 트랙 · 시간대 · 기수 달 (자리를 재는 데 쓴다). 읽지 못하면 빈 표 — 그때는 수강증에서 읽은 시간으로 견준다 */
export async function seatSections(admin: Admin, ids: readonly number[]): Promise<Map<number, SeatSection & { id: number }>> {
  if (ids.length === 0) return new Map();
  const { data } = await admin.from("class_sections").select("id, track, time_block, term:terms(month)").in("id", [...new Set(ids)]);
  return new Map((data ?? []).map((s) => [s.id, { id: s.id, track: s.track, time_block: s.time_block, term: s.term }]));
}

/** 이 학생의 확인 중(result null) 등업신청과 각자의 자리. 읽지 못하면 null — 그때는 아무것도 지우거나 닫지 않는다 */
async function pendingSeats(admin: Admin, userId: string, exceptId?: number): Promise<{ row: PendingRow; seat: ReceiptSeat }[] | null> {
  let query = admin
    .from("enrollment_verifications")
    .select("id, file_path, file_hash, requested_section_ids, candidates, parsed")
    .eq("user_id", userId)
    .is("result", null);
  if (exceptId != null) query = query.neq("id", exceptId);
  const { data, error } = await query;
  if (error) {
    console.error(`[verify] 확인 중인 등업신청을 읽지 못했어요: ${error.message}`);
    return null;
  }
  const rows = data ?? [];
  const sections = await seatSections(admin, rows.flatMap((r) => seatSectionIds(r)));
  return rows.map((row) => ({ row, seat: seatOfRow(row, sections) }));
}

/**
 * 새 수강증을 넣기 **직전에** 바꿔 넣을 옛 수강증(확인 중)을 지운다 (2026-09-18 Alan "새로 올리면 예전 기록이 새 정보로 자동 교체").
 * **같은 등록일 때만이다** (`replacedByUpload`) — 같은 그림 · 같은 반 · 같은 시간, 또는 무엇인지 모르는 옛 수강증.
 * 단과 두 개처럼 함께 들을 수 있는 다른 강좌의 수강증은 남긴다 (2026-10-06 — 그전에는 둘째를 올리면 확인 중이던 첫째가 지워졌다).
 *
 * **다른 신청이 아직 가리키는 파일은 지우지 않는다** (2026-09-22). 수동 등업신청은 거절·승인된 신청의 파일을 그대로 다시 쓴다
 * (거절 뒤 수동으로 내기 · 자동 승인 뒤 "반이 달라요"). 그 대기 건을 지우며 파일까지 지우면 승인·거절 기록의 수강증 그림이 사라진다.
 * 확인 조회가 실패하면 파일을 지우지 않는다 — 고아 파일이 남는 편이 기록의 그림을 지우는 것보다 낫다.
 */
export async function replacePendingReceipts(admin: Admin, userId: string, filePath: string, next: ReceiptSeat): Promise<void> {
  const pending = await pendingSeats(admin, userId);
  if (!pending) return;
  const replaced = pending.filter((p) => replacedByUpload(p.seat, next)).map((p) => p.row);
  if (replaced.length === 0) return;
  const replacedIds = replaced.map((r) => r.id);

  const oldPaths = [...new Set(replaced.map((r) => r.file_path).filter((p) => !!p && p !== filePath))];
  let removable: string[] = [];
  if (oldPaths.length > 0) {
    const { data: refs, error: refError } = await admin.from("enrollment_verifications").select("id, file_path").in("file_path", oldPaths);
    if (!refError) {
      const stillUsed = new Set((refs ?? []).filter((r) => !replacedIds.includes(r.id)).map((r) => r.file_path));
      removable = oldPaths.filter((p) => !stillUsed.has(p));
    }
  }
  if (removable.length > 0) await admin.storage.from("receipts").remove(removable);
  await admin.from("enrollment_verifications").delete().in("id", replacedIds).is("result", null);
}

/** 받아 둔 다음 달 수강증(hold) · "반이 달라요" 정정 요청(correctionOf) — 아직 할 일이라 승인으로 닫지 않는다 (2026-10-02) */
function stillToDo(candidates: Json | null): boolean {
  if (!candidates || typeof candidates !== "object" || Array.isArray(candidates)) return false;
  const c = candidates as { hold?: unknown; correctionOf?: unknown };
  return c.hold != null || c.correctionOf != null;
}

/**
 * 수강증 하나를 승인한 뒤 **같은 등록을 다시 낸** 확인 중 수강증을 닫는다 (2026-10-02 Alan "다시 제대로 올려서 승인이 되고 나면 수동처리 목록에서 빼주면").
 * 같은 그림 · 승인한 반과 같은 반 · 같은 달 같은 트랙에 시간이 겹치는 것만 (`closedByApproval`).
 * **다른 강좌의 수강증은 그대로 둔다** (2026-10-06 — 그전에는 같은 학생의 확인 중 수강증을 모두 닫아, 단과 둘째 수강증이 닫혔다).
 * 무엇인지 모르는 수강증(못 읽음)도 닫지 않는다 — 스태프가 보고 승인하거나 반려한다.
 */
export async function closeSamePendingReceipts(admin: Admin, userId: string, approvedId: number, approved: ReceiptSeat): Promise<void> {
  const pending = await pendingSeats(admin, userId, approvedId);
  if (!pending) return;
  const ids = pending.filter((p) => !stillToDo(p.row.candidates) && closedByApproval(p.seat, approved)).map((p) => p.row.id);
  if (ids.length === 0) return;
  const { error } = await admin
    .from("enrollment_verifications")
    .update({ result: "closed", reject_reason: "다른 수강증이 승인돼 닫았어요" })
    .in("id", ids)
    .is("result", null);
  if (error) console.error("[approve] 남은 검토 대기 건을 닫지 못했어요", error.message);
}
