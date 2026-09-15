import type { IconName } from "@/components/ui/Icon";
import { formatTime } from "@/lib/utils";

/** 스터디 공통 라벨·규칙. 시간대·일정 같은 운영 데이터는 DB(studies, study_slots)에서 읽는다. */

export const STUDY_KINDS = ["offline", "online", "vocab"] as const;
export type StudyKind = (typeof STUDY_KINDS)[number];

export const STUDY_KIND_LABEL: Record<string, string> = {
  offline: "대면스터디",
  online: "비대면스터디",
  vocab: "단어스터디",
};

export const STUDY_KIND_ICON: Record<string, IconName> = {
  offline: "offline",
  online: "online",
  vocab: "vocab",
};

export const STUDY_KIND_DESC: Record<string, string> = {
  offline: "강사가 정한 시간대 중 하나를 골라 학원에서 함께 공부해요.",
  online: "수업이 있는 날마다 그날의 스터디 자료를 받고, 풀이를 올려 숙제 점검을 받아요.",
  vocab: "정해진 시간에 강사에게 단어 점검을 받아요. 시간대를 골라 신청하세요.",
};

export const STUDY_STATUS_LABEL: Record<string, string> = {
  draft: "준비 중",
  open: "신청 받는 중",
  closed: "신청 마감",
};

/** 대면·단어 스터디는 시간대를 골라 신청한다 */
export const isSlotKind = (kind: string) => kind === "offline" || kind === "vocab";

export const isStudyKind = (kind: string): kind is StudyKind => (STUDY_KINDS as readonly string[]).includes(kind);

export type SlotLite = { id: number; start_time: string; end_time: string; capacity: number | null; applied_count: number };

/** 시작 시간순 정렬 */
export const sortSlots = <T extends { start_time: string }>(slots: T[]) => [...slots].sort((a, b) => a.start_time.localeCompare(b.start_time));

export const slotTime = (s: { start_time: string; end_time: string }) => `${formatTime(s.start_time)}–${formatTime(s.end_time)}`;

export const isSlotFull = (s: { capacity: number | null; applied_count: number }) => s.capacity !== null && s.applied_count >= s.capacity;

/**
 * "9/15 18:30" (한국 시간). 클라이언트 컴포넌트용 — Intl 출력은 서버(Node)와 브라우저가 달라
 * 하이드레이션 불일치가 나므로 UTC 계산만으로 만든다.
 */
export function shortDateTimeKST(iso: string) {
  const d = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${hh}:${mm}`;
}

export function formatBytes(n?: number | null) {
  if (n == null) return "";
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)}KB`;
  return `${(n / (1024 * 1024)).toFixed(1)}MB`;
}

/** YYYY-MM 기수 파라미터 */
export const termParam = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}`;

export function parseTermParam(term?: string | null): { y: number; m: number } | null {
  const match = term?.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  return m >= 1 && m <= 12 ? { y, m } : null;
}

/** 기수 비교용 정수 (연*12 + 월) */
export const termIndex = (t: { year: number; month: number }) => t.year * 12 + t.month;

/** 스터디·자료·숙제 DB 에러 → 안내 문구 (트리거 메시지 study_slot_full / study_slot_rule 포함) */
export function studyErrorMessage(error: { code?: string; message?: string } | null | undefined, fallback = "저장하지 못했어요. 잠시 후 다시 시도해 주세요.") {
  if (!error) return fallback;
  if (error.message?.includes("study_slot_full")) return "이 시간대는 정원이 찼어요. 다른 시간대를 골라 주세요.";
  if (error.message?.includes("study_slot_rule")) return "시간대를 다시 골라 주세요.";
  if (error.code === "42501") return "권한이 없어요.";
  if (error.code === "23505") return "이미 같은 값이 있어요.";
  if (error.code === "23503") return "연결된 신청·자료가 있어서 지울 수 없어요.";
  if (error.code === "23514") return "입력값이 규칙에 맞지 않아요.";
  return fallback;
}
