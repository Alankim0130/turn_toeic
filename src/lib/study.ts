import type { IconName } from "@/components/ui/Icon";
import { formatTime } from "@/lib/utils";

/**
 * 스터디 공통 라벨·규칙. 시간대·일정 같은 운영 데이터는 DB(studies, study_slots)에서 읽는다.
 *
 * **종류는 둘이다** (2026-10-12 Alan — "대면스터디 명칭을 '단어 스터디'로 바꿔줘 … 기존 단어스터디를 없애자"):
 * `offline` = **단어 스터디**(옛 대면스터디 — 값은 그대로 두고 이름만 바꿨다. 시간대를 골라 신청) · `online` = 비대면스터디.
 * 옛 `vocab` 은 마이그레이션 20261012100000 이 지웠다 — 되살리지 말 것.
 *
 * **레벨** (같은 날 Alan — "레벨 1, 2, 3 이렇게 크게 3단계야. 단어스터디는 레벨1,2 / 비대면 스터디는 레벨1,2,3 … 레벨은 학생이 직접 고르는걸로 …
 * 시간대마다 레벨을 고를 수 있도록"): 단어 스터디는 **시간대마다** 강사가 레벨을 정하고(`study_slots.level`) 학생은 시간대를 고른다 —
 * 레벨은 그 시간대의 것(`study_signups.level` 로 복사). 비대면은 학생이 신청할 때 레벨을 고른다. 자료는 레벨마다(`study_material_items.level`,
 * 0 = 모든 레벨 공통) 올리고 학생은 **내 레벨과 공통 자료만** 본다 (DB 가 막는다). 레벨을 바꾸려면 **요청 → 조교 · 강사 승인**
 * (`set_study_level` · `decide_study_level`). DB `private.study_level_max(kind)` 와 `STUDY_LEVELS` 는 같은 값이다 — 바꾸면 둘 다 (`study.test.ts`).
 */

export const STUDY_KINDS = ["offline", "online"] as const;
export type StudyKind = (typeof STUDY_KINDS)[number];

export const STUDY_KIND_LABEL: Record<string, string> = {
  offline: "단어 스터디",
  online: "비대면스터디",
};

export const STUDY_KIND_ICON: Record<string, IconName> = {
  // 단어 스터디는 단어 아이콘 — 옛 대면 아이콘(사람들)은 더 쓰지 않는다
  offline: "vocab",
  online: "online",
};

export const STUDY_KIND_DESC: Record<string, string> = {
  offline: "강사가 정한 시간대 중 하나를 골라 학원에서 단어 점검을 받아요. 시간대마다 레벨(1 · 2)이 정해져 있어요.",
  // 풀이는 내 스터디에서 인증한다 — 숙제업로드(정규 수업 숙제)와 섞지 않는다 (2026-09-23 Alan)
  // 개강일부터 3일 신청 · 4일째 시작 (2026-10-05 Alan — onlineStudyWindow)
  online: "레벨(1 · 2 · 3)을 골라 개강일부터 3일 동안 신청하고, 4일째부터 수업이 있는 날마다 내 레벨의 스터디 자료를 받아요. 풀고 나면 내 스터디에서 풀이 사진으로 인증해요.",
};

/** 종류마다 고를 수 있는 레벨 — DB `private.study_level_max(kind)` 와 같다 (단어 1 · 2, 비대면 1 · 2 · 3) */
export const STUDY_LEVELS: Record<StudyKind, readonly number[]> = {
  offline: [1, 2],
  online: [1, 2, 3],
};
export const studyLevelsOf = (kind: string): readonly number[] => (isStudyKind(kind) ? STUDY_LEVELS[kind] : []);

/** 자료의 레벨 0 = 모든 레벨 공통 (`study_material_items.level`) */
export const STUDY_LEVEL_ALL = 0;
/** 자료를 올리는 칸 — 공통 + 레벨 셋 (비대면만 자료가 있다) */
export const MATERIAL_LEVELS = [STUDY_LEVEL_ALL, 1, 2, 3] as const;

/** 레벨 글자 — `레벨 1` · 공통(0) · 미정(null) */
export function studyLevelLabel(level: number | null | undefined): string {
  if (level == null) return "레벨 미정";
  if (level === STUDY_LEVEL_ALL) return "공통";
  return `레벨 ${level}`;
}

/** 학생에게 보이는 자료인가 — 내 레벨이거나 공통. DB 조회 정책(study_materials)의 학생 갈래와 같은 규칙 */
export const materialVisibleTo = (materialLevel: number, myLevel: number | null | undefined) => materialLevel === STUDY_LEVEL_ALL || materialLevel === myLevel;

export const STUDY_STATUS_LABEL: Record<string, string> = {
  draft: "준비 중",
  open: "신청 받는 중",
  closed: "신청 마감",
};

/** 단어 스터디는 시간대를 골라 신청한다 (2026-10-12 전에는 대면 · 단어 둘) */
export const isSlotKind = (kind: string) => kind === "offline";

export const isStudyKind = (kind: string): kind is StudyKind => (STUDY_KINDS as readonly string[]).includes(kind);

export type SlotLite = { id: number; start_time: string; end_time: string; capacity: number | null; applied_count: number; level: number | null };

/** 시작 시간순 정렬 */
export const sortSlots = <T extends { start_time: string }>(slots: T[]) => [...slots].sort((a, b) => a.start_time.localeCompare(b.start_time));

/** 레벨별로 묶는다 — 레벨 1 · 2 · 미정(null, 맨 뒤) 순, 묶음 안은 시작 시간순 */
export function groupSlotsByLevel<T extends { start_time: string; level: number | null }>(slots: T[]): { level: number | null; slots: T[] }[] {
  const groups = new Map<number | null, T[]>();
  for (const s of sortSlots(slots)) groups.set(s.level, [...(groups.get(s.level) ?? []), s]);
  return [...groups.entries()].sort(([a], [b]) => (a == null ? 1 : b == null ? -1 : a - b)).map(([level, list]) => ({ level, slots: list }));
}

/**
 * 변경 요청 상태 — 학생 화면이 "레벨 2 로 변경 요청 중" · "바뀌었어요" · "거절됐어요" 를 가른다.
 * 요청이 있으면 결과는 비어 있다 (새 요청이 결과를 지운다 — set_study_level)
 */
export type LevelRequestLite = {
  level: number | null;
  requested_level: number | null;
  requested_slot_id: number | null;
  requested_at: string | null;
  request_result: string | null;
  request_decided_at: string | null;
};
export const hasLevelRequest = (s: Pick<LevelRequestLite, "requested_level">) => s.requested_level != null;

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

/** 스터디·자료·LC 음원 DB 에러 → 안내 문구 (트리거 메시지 study_slot_full / study_slot_rule 포함). 숙제업로드는 쓰지 않는다 */
export function studyErrorMessage(error: { code?: string; message?: string } | null | undefined, fallback = "저장하지 못했어요. 잠시 후 다시 시도해 주세요.") {
  if (!error) return fallback;
  if (error.message?.includes("study_slot_full")) return "이 시간대는 정원이 찼어요. 다른 시간대를 골라 주세요.";
  if (error.message?.includes("study_slot_level_missing")) return "이 시간대는 아직 레벨이 정해지지 않았어요. 강사에게 말씀해 주세요.";
  if (error.message?.includes("study_slot_gone")) return "요청한 시간대가 없어졌거나 레벨이 바뀌었어요. 학생이 다시 요청해야 해요.";
  if (error.message?.includes("study_slot_rule")) return "시간대를 다시 골라 주세요.";
  if (error.message?.includes("study_level_required")) return "레벨을 골라 주세요.";
  if (error.message?.includes("study_level_rule")) return "이 스터디에서 고를 수 있는 레벨이 아니에요.";
  if (error.message?.includes("study_level_locked")) return "레벨을 바꾸려면 변경 요청을 내고 조교 · 강사의 승인을 받아야 해요.";
  if (error.message?.includes("study_level_same")) return "지금 레벨과 같아요.";
  if (error.message?.includes("study_request_not_found")) return "변경 요청을 찾을 수 없어요. 화면을 새로고침해 주세요.";
  if (error.message?.includes("study_signup_not_found")) return "신청을 찾을 수 없어요. 화면을 새로고침해 주세요.";
  if (error.message?.includes("study_not_enrollee")) return "지금 수강 중인 달의 스터디만 바꿀 수 있어요.";
  if (error.message?.includes("crew_only")) return "강사 · 조교만 할 수 있어요.";
  if (error.code === "42501") return "권한이 없어요.";
  if (error.code === "23505") return "이미 같은 값이 있어요.";
  if (error.code === "23503") return "연결된 신청·자료가 있어서 지울 수 없어요.";
  if (error.code === "23514") return "입력값이 규칙에 맞지 않아요.";
  return fallback;
}
