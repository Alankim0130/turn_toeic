/**
 * 비대면 자료 회차 (2026-09-22 Alan — "1회차, 2회차... 이렇게 설정하고 매달 강사들이 설정한 일정표에 따라 적용").
 *
 * 자료는 회차마다 한 번 올리고(`study_material_items`) 매달 다시 쓴다. **N회차 = 그 달(기수) 비대면 시작일부터 N번째 수업일** —
 * 반 편성 달력의 월수금 + 화목금 수업일을 합쳐 날짜순으로 센다 (평일마다 하나, 시작일~종강일 안만).
 * **비대면 스터디는 개강일부터 달력 3일 동안 신청을 받고 4일째(개강일+3)부터 시작한다** (2026-10-05 Alan — "비대면 스터디는
 * 개강후 3일동안만 신청받고 4일째부터 시작! … 개강은 강사가 지정한 날짜로") — 개강일은 강사가 달력에서 정한 그 달 개강일이다.
 * DB 가 같은 규칙으로 그 달에 붙이고 신청을 막는다 (`private.online_study_days` · `private.sync_online_materials` ·
 * `private.study_signup_open`, 마이그레이션 20261005120000). 이 파일은 화면이 신청 기간과 "이 달엔 N회차가 몇 월 며칠" 을
 * 미리 보여 주는 데 쓴다 — 규칙을 바꾸면 SQL 과 함께 고친다. 순수 함수 (`study-rounds.test.ts`).
 */
import { shiftDate } from "./term-window";

/** 회차 수의 끝 — DB check(seq between 1 and 60) 와 같다 */
export const MATERIAL_ROUND_MAX = 60;

/**
 * 회차 안내 길이 끝 — DB check(char_length(note) <= 50000) 와 같다 (2026-09-30 Alan "각 회차마다 안내문구" — 처음엔 500자 →
 * 2026-10-05 Alan "비대면자료 설정하는곳에 안내 부분도 같은설정으로" — 서식 · 사진 태그까지 글자로 세므로 수업자료실 안내 · 공지와 같은 5만 자, 마이그레이션 20261005180000)
 */
export const MATERIAL_NOTE_MAX = 50_000;

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

/** 10/6(화) — 신청 기간 · 시작일을 적을 때 */
export function shortDay(d: string): string {
  const [y, m, day] = d.split("-").map(Number);
  return `${m}/${day}(${WEEKDAY[new Date(Date.UTC(y, m - 1, day)).getUTCDay()]})`;
}

/** 신청 기간 일수 — 개강일 · +1 · +2 (달력 날짜, 주말도 센다) */
export const ONLINE_SIGNUP_DAYS = 3;

export type OnlineStudyWindow = {
  /** 신청 첫날 = 개강일 */
  signupFrom: string;
  /** 신청 마지막 날 = 개강일 + 2 */
  signupUntil: string;
  /** 비대면 스터디 시작일 = 개강일 + 3 — 1회차는 이날부터의 첫 수업일 */
  startsOn: string;
};

/** 개강일 → 비대면 신청 기간 · 시작일. DB `private.study_signup_open` · `private.online_study_starts_on` 과 같은 규칙 */
export function onlineStudyWindow(opens: string): OnlineStudyWindow {
  return { signupFrom: opens, signupUntil: shiftDate(opens, ONLINE_SIGNUP_DAYS - 1), startsOn: shiftDate(opens, ONLINE_SIGNUP_DAYS) };
}

/** 오늘이 신청 기간의 어디인가 — 전 · 받는 중 · 끝 */
export function onlineSignupPhase(opens: string | null | undefined, today: string): "before" | "open" | "after" | null {
  if (!opens) return null;
  const w = onlineStudyWindow(opens);
  if (today < w.signupFrom) return "before";
  if (today > w.signupUntil) return "after";
  return "open";
}

/** 그 달 수업일(트랙 섞여도 됨) → 회차별 날짜. 같은 날이 두 트랙에 있어도 하루로 센다. 시작일~종강일이 있으면 그 안만
 *  (비대면 회차는 `opens` 에 시작일 `onlineStudyWindow(개강일).startsOn` 을 넣는다) */
export function classDayRounds(dates: readonly string[], window: { opens?: string | null; closes?: string | null } = {}): string[] {
  return [...new Set(dates)]
    .filter((d) => (!window.opens || d >= window.opens) && (!window.closes || d <= window.closes))
    .sort();
}

/** 관리자 화면에 보일 회차 줄 수: 이 달 수업일 수와 올린 회차 중 큰 쪽 + 다음에 올릴 빈 줄 하나 */
export function roundRowCount(classDays: number, maxUploadedSeq: number): number {
  return Math.min(MATERIAL_ROUND_MAX, Math.max(classDays, maxUploadedSeq) + 1);
}
