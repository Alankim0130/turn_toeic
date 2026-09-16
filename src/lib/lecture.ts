import { lectureKindLabel, sortLectureKinds } from "@/lib/utils";

/**
 * 특강 신청 상태. DB(private.lecture_signup_open)와 같은 규칙으로 화면에서도 판정한다.
 * 화면 안내일 뿐 실제 판단은 RLS·트리거가 한다.
 */
export type LectureSignupRow = {
  id: number;
  date: string;
  signup: boolean;
  capacity: number | null;
  signup_opens_at: string | null;
  applied_count: number;
};

export type LectureState = "none" | "not_open" | "open" | "full" | "closed";

/** todayKst: 'YYYY-MM-DD', now: 지금(ms). 신청은 신청 시작부터 특강 당일까지 */
export function lectureState(l: LectureSignupRow, todayKst: string, now = Date.now()): LectureState {
  if (!l.signup) return "none";
  if (todayKst > l.date) return "closed";
  if (l.signup_opens_at && new Date(l.signup_opens_at).getTime() > now) return "not_open";
  if (l.capacity !== null && l.applied_count >= l.capacity) return "full";
  return "open";
}

export const LECTURE_STATE_LABEL: Record<LectureState, string> = {
  none: "",
  not_open: "곧 시작",
  open: "신청 받는 중",
  full: "정원 마감",
  closed: "신청 마감",
};

export const LECTURE_STATE_CLASS: Record<LectureState, string> = {
  none: "",
  not_open: "bg-violet-100 text-violet-800",
  open: "bg-brand-100 text-brand-700",
  full: "bg-amber-100 text-amber-800",
  closed: "bg-line text-slate",
};

/** "RC특강 · 1차 모의고사 — 파트5 집중" */
export function lectureTitle(l: { kinds: string[] | null; content: string | null }) {
  const kinds = sortLectureKinds(l.kinds ?? []).map(lectureKindLabel);
  const memo = l.content?.trim();
  if (kinds.length === 0) return memo || "특강";
  return memo ? `${kinds.join(" · ")} — ${memo}` : kinds.join(" · ");
}

/** 신청 시작 일시를 "9/17 00:05" 로 (한국 시간) */
export function formatKstDateTime(iso: string) {
  const kst = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
  const m = kst.getUTCMonth() + 1;
  const d = kst.getUTCDate();
  const hh = String(kst.getUTCHours()).padStart(2, "0");
  const mm = String(kst.getUTCMinutes()).padStart(2, "0");
  return `${m}/${d} ${hh}:${mm}`;
}

/** 남은 자리. 정원이 없으면 null */
export const seatsLeft = (l: LectureSignupRow) => (l.capacity === null ? null : Math.max(0, l.capacity - l.applied_count));
