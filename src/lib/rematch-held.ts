import "server-only";
import type { createAdminClient } from "./supabase/admin";
import type { Json } from "./supabase/database.types";
import { matchSections } from "./match-sections";
import { fetchOpenEnrollSections } from "./open-sections";
import { receiptFlags } from "./verify-flags";
import { autoApproveBlockers } from "./auto-approve";
import { approveVerificationWith } from "./approve-verification";
import { readAutoVerify } from "./auto-verify";
import { assignedLabels } from "./assigned-label";
import { heldReady, toMatchInput, type StoredParsed } from "./held-receipt";
import { heldMonth } from "./verify-decision";
import type { PaletteShares } from "./receipt-forensics";
import { notifyStaff } from "./push";

type Admin = ReturnType<typeof createAdminClient>;

export type RematchSummary = { waiting: number; approved: number; review: number };

const asRecord = (v: Json | null): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/**
 * **받아 둔 다음 달 수강증을 다시 맞춘다** (2026-09-22 Alan — "다음달 수강증을 올리는경우는 미리 등록한 경우이니 예비등록생으로 받아준다.
 * 그리고 다음달 개강일에 맞춰서 권한부여가 자동으로").
 *
 * 수강증을 올린 날에는 그 달 반이 없어 배정할 곳이 없었다 (`decideVerification` → `upcoming`, `candidates.hold = 달`).
 * 강사가 그 달 반을 열면(반 편성의 일괄 개설 · 하나씩 만들기 · 상태를 '모집 중' 으로) 여기서 **올릴 때와 같은 조건**으로 다시 맞춘다 —
 * 반 대조(`matchSections`) · 위조 신호(`receiptFlags`, 오늘 기준으로 다시 잰다) · 자동 승인 조건(`autoApproveBlockers`) · 긴급 스위치.
 * 딱 맞으면 스태프 승인과 같은 `approveVerificationWith` 로 배정한다 → 개강 전이라 예비등록생 → 개강일에 수강생 (DB 트리거·배치).
 *
 * - **다시 맞추기는 한 번뿐이다** — 맞든 안 맞든 `hold` 를 지우고 `heldFor` 로 남긴다. 안 맞은 것은 그때부터 스태프 검토 대기다
 *   (반이 열릴 때마다 되풀이하면 같은 건으로 알림이 여러 번 간다).
 * - 그 달 · 그 레벨 반이 아직 없으면 손대지 않고 계속 기다린다 (`heldReady`).
 * - 긴급 스위치가 꺼져 있으면 배정하지 않고 스태프에게 넘긴다 — 찾은 반은 승인 화면에 미리 골라져 있다.
 * - 같은 건을 두 번 배정하지 않는다 — 두 호출이 겹쳐도 반 배정의 중복 검사(23505)가 한쪽을 되돌린다.
 *
 * 실패해도 던지지 않는다 — 반 개설 뒤(`after()`)에 도는 일이라 반 개설 자체를 망치면 안 된다.
 */
export async function rematchHeldVerifications(admin: Admin, opts: { notify?: boolean } = {}): Promise<RematchSummary> {
  const summary: RematchSummary = { waiting: 0, approved: 0, review: 0 };
  try {
    const { data: held, error } = await admin
      .from("enrollment_verifications")
      .select("id, user_id, parsed, candidates, file_hash")
      .is("result", null)
      .not("candidates->hold", "is", null)
      .order("created_at")
      .limit(200);
    if (error) {
      console.error(`[verify] 받아 둔 예비 접수를 읽지 못했어요: ${error.message}`);
      return summary;
    }
    if (!held || held.length === 0) return summary;

    const [sections, auto] = await Promise.all([fetchOpenEnrollSections(admin), readAutoVerify(admin)]);

    for (const v of held) {
      const candidates = asRecord(v.candidates);
      const month = heldMonth(candidates.hold);
      if (month == null) continue;
      const parsed = asRecord(v.parsed) as StoredParsed;
      if (!heldReady(month, parsed, sections)) {
        summary.waiting++;
        continue;
      }

      // 수강월은 받아 둔 그 달로 못박는다 — 날짜로만 달을 읽은 수강증은 대조가 다른 달(열려 있는 이번 달) 반을 고를 수 있다
      const match = matchSections({ ...toMatchInput(parsed), courseMonth: month }, sections);
      const matched = match.result.kind === "match" ? match.result : null;
      const storedFlags = asRecord((candidates.flags ?? null) as Json);
      const flags = await receiptFlags(admin, {
        userId: v.user_id,
        hash: v.file_hash,
        capturedOn: parsed.capturedOn ?? null,
        capturedAt: parsed.capturedAt ?? null,
        palette: (storedFlags.palette ?? null) as PaletteShares | null,
        sectionIds: matched?.sectionIds ?? [],
      });
      const nameMatches = typeof candidates.nameMatches === "boolean" ? candidates.nameMatches : null;
      const blockers = autoApproveBlockers({ parsed, nameMatches, flags, matched: !!matched });

      // `hold` 는 지운다 (키째로 — JSON null 로 두면 `candidates->hold is null` 에 안 걸려 계속 기다리는 것으로 보인다)
      const rest = { ...candidates };
      delete rest.hold;
      const next = {
        ...rest,
        result: match.result,
        log: match.log,
        flags,
        blockers,
        heldFor: month,
        rematchedAt: new Date().toISOString(),
        ...(auto.on ? {} : { autoOff: auto.reason }),
      } as unknown as Json;

      if (auto.on && matched && blockers.length === 0) {
        const mode = parsed.mode === "live" ? "live" : "onsite";
        const approved = await approveVerificationWith(admin, {
          verificationId: v.id,
          userId: v.user_id,
          sectionIds: matched.sectionIds,
          mode,
          confidence: 100,
          candidates: next,
        });
        if (approved.ok) {
          summary.approved++;
          await tellStudent(admin, v.user_id, month, assignedLabels(sections, matched.sectionIds, mode), approved.status);
          continue;
        }
        // 막히면(이미 같은 반에 배정 등) 스태프에게 — 접수는 그대로 있다
        console.error(`[verify] 예비 접수 #${v.id} 를 배정하지 못해 검토로 넘겨요: ${approved.error}`);
      }

      const { error: upError } = await admin.from("enrollment_verifications").update({ candidates: next }).eq("id", v.id).is("result", null);
      if (upError) console.error(`[verify] 예비 접수 #${v.id} 대조 기록을 남기지 못했어요: ${upError.message}`);
      summary.review++;
    }

    // 반을 한꺼번에 열면 수십 건이 같이 풀린다 — 건마다 보내지 않고 한 번에 알린다 (firsttoeic "요약 푸시 1건")
    if (opts.notify && (summary.approved > 0 || summary.review > 0)) {
      await notifyStaff("verification", {
        title: "예비 접수를 반에 맞췄어요",
        body: `반이 열려 받아 둔 다음 달 수강증을 다시 맞췄어요 — 자동 배정 ${summary.approved}건${summary.review > 0 ? ` · 확인 필요 ${summary.review}건` : ""}.`,
        url: summary.review > 0 ? "/admin/verifications?status=pending" : "/admin/verifications?status=approved",
      });
    }
  } catch (err) {
    console.error("[verify] 예비 접수 다시 맞추기 실패", err);
  }
  return summary;
}

/**
 * 학생에게 알림함으로 알린다 — 올린 날에는 "받아 뒀어요" 까지만 봤으니, 배정된 것을 따로 알려야 한다.
 * 보낸 이가 사람이 아니므로 `sender_name` 을 비운다 (알림함은 이름이 비면 시각만 적는다). 실패해도 배정은 그대로다
 */
async function tellStudent(admin: Admin, userId: string, month: number, labels: string[], status: "active" | "preliminary") {
  const { error } = await admin.from("student_messages").insert({
    user_id: userId,
    sender_name: "",
    kind: "general",
    title: status === "preliminary" ? `${month}월 예비등록이 완료됐어요` : `${month}월 등업이 완료됐어요`,
    body: [
      `받아 둔 ${month}월 수강증으로 반을 배정했어요.`,
      ...labels,
      status === "preliminary" ? "개강일에 수강생으로 자동 전환되고, 그때부터 불라방·다시보기가 열려요." : "이제 불라방·다시보기·숙제업로드를 쓸 수 있어요.",
      "반이 다르면 등업신청에서 수동 등업신청으로 알려 주세요 — 강사가 바로 고쳐 드려요.",
    ].join("\n"),
  });
  if (error) console.error(`[verify] 예비등록 완료 알림을 남기지 못했어요: ${error.message}`);
}
