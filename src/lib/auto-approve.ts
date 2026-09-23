import type { ParsedReceipt } from "./receipt";

/**
 * 수강증 **자동 승인** 조건 — 한곳에서 정한다 (2026-09-22).
 *
 * 수강증을 올린 그 자리(`submitVerification`)와, 다음 달 반이 열린 뒤 맡겨 둔 예비 접수를 다시 맞출 때
 * (`rematchHeldVerifications`) **같은 조건**을 본다. 두 곳에 조건을 베껴 두면 한쪽만 고쳐져 갈라진다
 * (firsttoeic 사고 7 "판독 로직을 두 벌로 두었더니 한쪽만 고쳐졌다").
 *
 * 하나라도 걸리면 자동 승인하지 않고 스태프 검토로 보낸다. **거절 사유가 아니다** — 진짜 학생도 걸릴 수 있다.
 * 긴급 스위치(`feature_flags.verification_auto`)는 여기 들지 않는다 — 수강증 한 장의 성질이 아니라 사이트 전체의 상태다.
 */

export type AutoApproveBlocker =
  /** 열린 반 중 딱 맞는 반을 못 찾았다 (`matchSections`) */
  | "no_match"
  /** 우리 센터 · 역전토익 게이트 (G1 · G2) */
  | "gate"
  /** `역전토익` 글자를 그대로 못 읽었다 — 한 글자 다른 과정·강사명만으로 게이트를 지난 것 (firsttoeic 사고 3) */
  | "brand_word"
  /** 수강증 카드의 칸 라벨이 다 보이지 않는다 — 카드 밖 글자(광고 배너)로 반을 정하지 않는다 (firsttoeic 사고 2) */
  | "card"
  /** `수강생` 칸 이름 ≠ 가입 실명 (G3) */
  | "name"
  /** 수강 방식을 강의실 칸에서 읽지 못했다 — 기본값(현장)·칸 밖 글자로 정한 것은 짐작이다 */
  | "mode"
  | "duplicate_image"
  | "stale_capture"
  | "same_capture"
  | "palette"
  /** 그 달 반에 이미 배정돼 있다 — 새로 넣으면 등록이 두 건 */
  | "already_enrolled"
  /** 같은 캡처를 전에 사람이 판정했다 (firsttoeic 사고 5) */
  | "decided_before";

export type AutoApproveFlags = {
  duplicateImage: boolean;
  staleCapture: boolean;
  sameCapture: boolean;
  paletteOff: boolean;
  alreadyEnrolled: readonly number[];
  decidedBefore: "approved" | "rejected" | null;
};

export type AutoApproveInput = {
  /** 저장해 둔 판독 결과에서도 부른다 — 예전 기록에 칸이 없으면 **막는 쪽**으로 읽는다 */
  parsed: Partial<Pick<ParsedReceipt, "gates" | "brandExact" | "card" | "modeEvidence">>;
  nameMatches: boolean | null | undefined;
  flags: AutoApproveFlags;
  /** 반 대조가 딱 맞았나 */
  matched: boolean;
};

export function autoApproveBlockers({ parsed, nameMatches, flags, matched }: AutoApproveInput): AutoApproveBlocker[] {
  const out: AutoApproveBlocker[] = [];
  if (!matched) out.push("no_match");
  if (parsed.gates?.academy !== true || parsed.gates?.brand !== true) out.push("gate");
  if (parsed.brandExact !== true) out.push("brand_word");
  if (parsed.card !== true) out.push("card");
  if (nameMatches !== true) out.push("name");
  if (parsed.modeEvidence !== "online" && parsed.modeEvidence !== "room") out.push("mode");
  if (flags.duplicateImage) out.push("duplicate_image");
  if (flags.staleCapture) out.push("stale_capture");
  if (flags.sameCapture) out.push("same_capture");
  if (flags.paletteOff) out.push("palette");
  if (flags.alreadyEnrolled.length > 0) out.push("already_enrolled");
  if (flags.decidedBefore !== null) out.push("decided_before");
  return out;
}

/** 승인 화면에 적는 말 — "왜 자동 등업이 안 됐나" (candidates.blockers) */
export const BLOCKER_LABEL: Record<AutoApproveBlocker, string> = {
  no_match: "딱 맞는 반을 못 찾음",
  gate: "우리 센터·역전토익 표시를 못 읽음",
  brand_word: "‘역전토익’ 글자를 그대로 못 읽음",
  card: "수강증 카드의 칸이 다 보이지 않음",
  name: "수강생 이름이 가입 실명과 다르거나 못 읽음",
  mode: "강의실 칸(온라인 강의·호실)을 못 읽음",
  duplicate_image: "다른 계정과 같은 파일",
  stale_capture: "45일 넘은 캡처",
  same_capture: "다른 계정과 같은 초에 캡처",
  palette: "화면 색이 YBM 수강증과 다름",
  already_enrolled: "이미 그 달 반에 배정됨",
  decided_before: "같은 캡처를 전에 사람이 판정함",
};
