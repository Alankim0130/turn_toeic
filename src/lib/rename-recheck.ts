import { autoApproveBlockers, type AutoApproveBlocker, type AutoApproveFlags } from "./auto-approve";
import type { StoredParsed } from "./held-receipt";
import { receiptHasName } from "./receipt";

/**
 * 학생이 이름을 고친 뒤, **이름 때문에 멈춰 있던 수강증을 다시 본다** (2026-10-02 Alan — "수정의 기회").
 *
 * 수강증은 이미 읽어 두었다(`ocr_raw.text` · `parsed` · `candidates`). 다시 OCR 하지 않고 저장해 둔 결과에
 * 새 이름만 대어 본다. 이름이 맞고 다른 막는 이유가 하나도 없으면 — 올릴 때 자동 승인됐을 그 조건 그대로
 * (`autoApproveBlockers`, 한곳) — 승인한다. 그 밖에는 검토 대기로 남기고 스태프에게 "이름을 고쳤다" 고 적어 준다.
 * 순수 함수라 테스트로 굳힌다 (`rename-recheck.test.ts`). DB 를 만지는 쪽은 `src/app/my/account/recheck.ts`.
 */

/** `enrollment_verifications.candidates` 에 남긴 대조 기록 (actions.ts 의 submitVerification). 예전 기록은 칸이 빠져 있을 수 있다 */
export type StoredCandidates = {
  result?: { kind: string; sectionIds?: number[] } | null;
  nameMatches?: boolean | null;
  flags?: Partial<AutoApproveFlags> | null;
  blockers?: AutoApproveBlocker[] | null;
  /** 다음 달 수강증으로 받아 둔 것 — 그 달 반이 열릴 때 `rematchHeldVerifications` 가 맞춘다. 여기서는 승인하지 않는다 */
  hold?: number | null;
} & Record<string, unknown>;

export type StoredVerification = {
  ocrText: string | null;
  parsed: StoredParsed | null;
  candidates: StoredCandidates | null;
};

export type RenameRecheck =
  /** 손대지 않는다 — 이름 때문에 멈춘 것이 아니거나, 원문이 없거나, 고친 이름도 수강증과 다르다 */
  | { kind: "skip"; why: "no_name_blocker" | "no_text" | "still_mismatch" }
  /** 이름은 맞지만 다른 이유가 남았다 — 검토 대기로 두고 기록만 고친다 */
  | { kind: "review"; blockers: AutoApproveBlocker[] }
  /** 이름이 유일한 이유였다 — 올릴 때 찾아 둔 반으로 승인한다 */
  | { kind: "approve"; sectionIds: number[]; mode: "onsite" | "live" };

export function planRenameRecheck(row: StoredVerification, newName: string): RenameRecheck {
  const c = row.candidates;
  if (!c?.blockers?.includes("name")) return { kind: "skip", why: "no_name_blocker" };
  if (!row.ocrText) return { kind: "skip", why: "no_text" };
  if (!receiptHasName(row.ocrText, newName)) return { kind: "skip", why: "still_mismatch" };

  const sectionIds = c.result?.kind === "match" ? (c.result.sectionIds ?? []) : [];
  const matched = sectionIds.length > 0;

  // 위조 신호를 안 남긴 옛 기록은 다시 잴 수 없다 — 이름만 풀고 사람이 본다
  if (!c.flags) return { kind: "review", blockers: c.blockers.filter((b) => b !== "name") };

  const flags: AutoApproveFlags = {
    duplicateImage: c.flags.duplicateImage === true,
    staleCapture: c.flags.staleCapture === true,
    sameCapture: c.flags.sameCapture === true,
    paletteOff: c.flags.paletteOff === true,
    alreadyEnrolled: c.flags.alreadyEnrolled ?? [],
    decidedBefore: c.flags.decidedBefore ?? null,
  };
  const blockers = autoApproveBlockers({ parsed: row.parsed ?? {}, nameMatches: true, flags, matched });
  const mode = row.parsed?.mode;

  if (blockers.length === 0 && c.hold == null && matched && (mode === "onsite" || mode === "live")) {
    return { kind: "approve", sectionIds, mode };
  }
  return { kind: "review", blockers };
}
