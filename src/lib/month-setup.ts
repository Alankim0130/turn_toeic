import { HOLD_MONTHS_AHEAD } from "./verify-decision";
import { autoOpensMonth } from "./month-open";

/**
 * 반 편성 달력을 저장했는데 그 달 반이 아직 없을 때 — 무엇을 더 해야 학생이 잡히나 (2026-10-22 Alan — 11월 달력 캡처와 함께
 * "11월 시간표 다 넣어놨는데 왜 안잡히는거야?").
 *
 * 달력(개강일 · 종강일 · 월수금 · 화목금 · 특강)은 **날짜만** 정한다 — 반은 생기지 않는다. 반의 시간 · 과정 A/B · 과목은 그 달
 * **시간표 설정**(`/admin/timetable`)이 정하고, 반은 **새 반 개설**에서 연다. 반이 없으면 받아 둔 그 달 수강증이 배정될 곳이 없어
 * 등업 로그 `반 개설 대기` 에 머물고, 학생 시간표 · 숙제 · 출석에도 그 달이 서지 않는다. 그래서 달력 화면 맨 위에 그 두 단계를 띄운다.
 * - 달력을 아직 저장하지 않았거나(개강일 · 종강일이 없다) 반이 하나라도 있으면 띄우지 않는다.
 * - 종강일이 지난 달도 띄우지 않는다 — 할 일이 아니다.
 * **평달은 달력을 저장하면 시간표 · 반이 저절로 생긴다** (2026-10-22 Alan "방학달 1,2,7,8월만 강사가 직접 반을 열어야하고 나머지는 자동으로",
 * `src/lib/month-open.ts`) — 그래도 이 카드가 서는 평달(그 전에 저장해 둔 달 · 그때 못 연 달)은 '한 번에 만들기' 버튼 하나다 (`auto`).
 * 방학달은 예전처럼 두 단계(시간표 만들기 → 새 반 개설)다.
 * 순수 함수 (`month-setup.test.ts`).
 */
export type MonthSetup = {
  /** 그 달 시간표(시간대)가 있나 — 없으면 ① 시간표 만들기부터 */
  timetableReady: boolean;
  /** 받아 둔 그 달 수강증 수 — 반이 열리면 저절로 배정된다 */
  held: number;
  /** 평달 — 한 번에 만들기 버튼 하나 (방학달은 강사가 직접 두 단계) */
  auto: boolean;
};

export function monthSetup(input: {
  /** 그 달 (1~12) — 평달인지 방학달인지 */
  month: number;
  /** 달력에 개강일 · 종강일을 저장했나 */
  hasSaved: boolean;
  /** 그 달 종강일 (`YYYY-MM-DD`) */
  closes: string | null;
  /** 오늘 (KST, `YYYY-MM-DD`) */
  today: string;
  /** 그 달 시간표 줄 수 */
  slots: number;
  /** 그 달 반 수 */
  sections: number;
  held: number;
}): MonthSetup | null {
  if (!input.hasSaved || input.sections > 0) return null;
  if (input.closes != null && input.closes < input.today) return null;
  return { timetableReady: input.slots > 0, held: Math.max(0, input.held), auto: autoOpensMonth(input.month) };
}

/**
 * 받아 둔 수강증의 달(`enrollment_verifications.hold_month` — 연도 없이 1~12)로 그 달을 셀 수 있나.
 * 수강증은 오늘부터 0~2달 뒤만 받아 둔다(`HOLD_MONTHS_AHEAD`) — 그 밖의 달(내년 같은 달 · 지난 달)을 같은 숫자로 세지 않게
 */
export function heldCountable(year: number, month: number, today: string): boolean {
  const ahead = year * 12 + month - (Number(today.slice(0, 4)) * 12 + Number(today.slice(5, 7)));
  return ahead >= 0 && ahead <= HOLD_MONTHS_AHEAD;
}
