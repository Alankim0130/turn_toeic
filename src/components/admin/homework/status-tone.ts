import type { MissingStatus } from "@/lib/homework-missing";

/**
 * 숙제 제출률 단계(개근 · 양호 · 주의 · 위험)의 색 — 구조는 첫토익, 색은 우리 토큰 (관리자 모드에서는 토스 파랑).
 * 숙제 미제출 알림(`MissingBoard`)과 학생 관리의 숙제 제출률(`StudentHomeworkRates`, 2026-10-30)이 함께 쓴다 — 두 화면의 같은 단계가 같은 색이게.
 * `"use client"` 파일 밖에 둔다 — 서버 컴포넌트가 클라이언트 모듈의 값을 가져오면 값이 아니라 참조가 온다.
 */
export const STATUS_DOT: Record<MissingStatus, string> = { perfect: "bg-brand-500", good: "bg-brand-300", warn: "bg-amber-400", risk: "bg-red-500", none: "bg-line" };
export const STATUS_BADGE: Record<MissingStatus, string> = {
  perfect: "bg-brand-500 text-white",
  good: "bg-brand-100 text-brand-700",
  warn: "bg-amber-100 text-amber-800",
  risk: "bg-red-100 text-red-700",
  none: "bg-surface text-mist",
};
