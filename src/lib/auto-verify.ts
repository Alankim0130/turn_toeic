import "server-only";
import type { createAdminClient } from "./supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * 수강증 자동 판정 **긴급 스위치** (2026-09-22 Alan "자동 승인 긴급 스위치", 마이그레이션 20260923000500).
 * 끄면 기계가 판정하지 않는다 — 자동 승인도 자동 거절도 멈추고 모든 수강증이 강사 검토 대기로 간다.
 * 켜고 끄는 곳은 `/admin/verifications` (강사·관리자).
 */
export const AUTO_VERIFY_KEY = "verification_auto";

export type AutoVerifyState = { on: true } | { on: false; reason: "off" | "unreadable"; note?: string | null };

/**
 * **읽지 못하면 꺼진 것으로 본다** — 멈추는 스위치라 모르면 사람이 보는 쪽이 안전하다 (최악이 "강사가 한 번 더 누른다" 다).
 * 배포와 마이그레이션 사이의 짧은 틈(표가 아직 없음)도 여기 든다. 조용히 넘어가지 않게 로그를 남긴다.
 */
export async function readAutoVerify(admin: Admin): Promise<AutoVerifyState> {
  const { data, error } = await admin.from("feature_flags").select("enabled, note").eq("key", AUTO_VERIFY_KEY).maybeSingle();
  if (error || !data) {
    console.error(`[verify] 자동 판정 스위치를 읽지 못해 꺼진 것으로 봐요: ${error?.message ?? "행이 없음"}`);
    return { on: false, reason: "unreadable" };
  }
  return data.enabled ? { on: true } : { on: false, reason: "off", note: data.note };
}
