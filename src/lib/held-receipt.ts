import type { EnrollSection } from "./enroll-options";
import type { MatchInput } from "./match-sections";
import type { ParsedReceipt } from "./receipt";

/**
 * 받아 둔 예비 접수(다음 달 수강증 — `decideVerification` 의 `upcoming`)를 **다시 맞출 때가 됐나** (2026-09-22).
 * 순수 함수라 테스트로 굳힌다 (`held-receipt.test.ts`). DB 를 만지는 쪽은 `rematch-held.ts`.
 */

/** `enrollment_verifications.parsed` 에 남긴 판독 결과 (actions.ts 의 `parsedSummary`). 예전 기록은 칸이 빠져 있을 수 있다 */
export type StoredParsed = Partial<
  Pick<
    ParsedReceipt,
    "gates" | "mode" | "modeEvidence" | "card" | "brandExact" | "weekly" | "tracks" | "levels" | "level" | "courseLevel" | "program" | "time" | "courseMonth" | "startMonth" | "capturedOn" | "capturedAt"
  >
> & { nameMatches?: boolean | null };

/**
 * 그 달 · **이 수강증 레벨**의 반이 열렸나. 한 달의 반을 레벨마다 나눠 여는 날(650 부터 열고 750 은 나중에)이 있어,
 * 그 달 반이 하나라도 열렸다고 곧장 맞추면 750 수강증이 "맞는 반 없음" 으로 스태프에게 떨어진다 — 그래서 레벨 반을 기다린다.
 * 레벨을 못 읽은 수강증은 어차피 자동으로 맞출 수 없으니 그 달 반이 하나라도 열리면 스태프에게 넘긴다.
 */
export function heldReady(month: number, parsed: StoredParsed, sections: readonly EnrollSection[]): boolean {
  const inMonth = sections.filter((s) => s.term?.month === month);
  if (parsed.level == null) return inMonth.length > 0;
  return inMonth.some((s) => s.course?.target_score === parsed.level && s.course?.program === (parsed.program ?? "score"));
}

/** 남겨 둔 판독 결과 → 반 대조 입력. 빠진 칸은 "못 읽음" 으로 채운다 (대조가 알아서 멈춘다) */
export function toMatchInput(parsed: StoredParsed): MatchInput {
  return {
    level: parsed.level ?? null,
    levels: parsed.levels ?? [],
    courseLevel: parsed.courseLevel ?? null,
    program: parsed.program ?? "score",
    weekly: parsed.weekly ?? null,
    tracks: parsed.tracks ?? [],
    time: parsed.time ?? null,
    courseMonth: parsed.courseMonth ?? null,
    startMonth: parsed.startMonth ?? null,
  };
}
