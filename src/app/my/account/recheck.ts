import "server-only";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { approveVerificationWith } from "@/lib/approve-verification";
import { readAutoVerify } from "@/lib/auto-verify";
import { assignedLabels } from "@/lib/assigned-label";
import { notifyStaff } from "@/lib/push";
import { planRenameRecheck, type StoredCandidates } from "@/lib/rename-recheck";
import type { StoredParsed } from "@/lib/held-receipt";
import type { Json } from "@/lib/supabase/database.types";
import { getOpenEnrollSections } from "../_lib/queries";

export type RenameRecheckResult =
  | { approved: true; preliminary: boolean; assigned: string[] }
  /** 승인하지 못했다 — pending 은 아직 선생님 확인을 기다리는 수강증 수 */
  | { approved: false; pending: number };

/**
 * 이름을 고친 뒤 **이름 때문에 멈춰 있던 수강증을 다시 본다** (2026-10-02 Alan — "수정의 기회").
 * 판정은 `planRenameRecheck`(순수) 한곳. 여기서는 읽고 · 고쳐 쓰고 · 승인만 한다.
 * 긴급 스위치(`verification_auto`)가 꺼져 있으면 승인하지 않고 기록만 고친다 — 올릴 때와 같은 규칙.
 */
export async function recheckAfterRename(userId: string, from: string, to: string): Promise<RenameRecheckResult> {
  const admin = createAdminClient();
  const [{ data: rows }, auto] = await Promise.all([
    admin
      .from("enrollment_verifications")
      .select("id, ocr_raw, parsed, candidates")
      .eq("user_id", userId)
      .is("result", null)
      .eq("source", "auto")
      .order("id", { ascending: false }),
    readAutoVerify(admin),
  ]);

  let pending = 0;
  for (const row of rows ?? []) {
    const ocrText = (row.ocr_raw as { text?: unknown } | null)?.text;
    const candidates = (row.candidates ?? null) as StoredCandidates | null;
    const plan = planRenameRecheck(
      { ocrText: typeof ocrText === "string" ? ocrText : null, parsed: (row.parsed ?? null) as StoredParsed | null, candidates },
      to,
    );
    if (plan.kind === "skip") {
      pending++;
      continue;
    }

    // 스태프 승인 화면이 "왜 자동 등업이 안 됐나 / 누가 언제 이름을 고쳤나" 를 보도록 기록을 고친다
    const renamed = { from, to, at: new Date().toISOString() };
    const parsedNext = { ...((row.parsed as Record<string, unknown> | null) ?? {}), nameMatches: true } as Json;
    const base = (candidates ?? {}) as Record<string, unknown>;

    if (plan.kind === "approve" && auto.on) {
      const approved = await approveVerificationWith(admin, {
        verificationId: row.id,
        userId,
        sectionIds: plan.sectionIds,
        mode: plan.mode,
        confidence: 100,
        candidates: { ...base, nameMatches: true, blockers: [], renamed } as Json,
      });
      if (approved.ok) {
        await admin.from("enrollment_verifications").update({ parsed: parsedNext }).eq("id", row.id);
        after(async () => {
          await notifyStaff("verification", {
            title: "자동 등업 완료 (이름 고침)",
            body: `${to}님이 가입 이름을 '${from}' → '${to}' 로 고쳐 수강증이 맞아 반을 배정했어요${approved.status === "preliminary" ? " (개강 전 — 예비등록생)" : ""}. 잘못됐으면 승인 화면에서 정정해 주세요.`,
            url: "/admin/verifications?status=approved",
          });
        });
        const sections = await getOpenEnrollSections();
        return { approved: true, preliminary: approved.status === "preliminary", assigned: assignedLabels(sections, plan.sectionIds, plan.mode) };
      }
      // 승인이 막혔다(반이 닫혔거나 이미 배정) — 검토 대기로 남긴다
    }

    const blockers = plan.kind === "review" ? plan.blockers : ((base.blockers as string[] | undefined) ?? []).filter((b) => b !== "name");
    await admin
      .from("enrollment_verifications")
      .update({ parsed: parsedNext, candidates: { ...base, nameMatches: true, blockers, renamed } as Json })
      .eq("id", row.id);
    pending++;
  }

  return { approved: false, pending };
}
