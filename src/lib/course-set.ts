/**
 * 과정 A/B 와 과목의 **다음 달 자동 채움** (2026-09-23 Alan).
 *
 * > "RC도 A과정 B과정에 따라서 움직이잖아." · "12월 달까지는 자동채움으로 가도 괜찮아.
 * >  1,2,7,8은 방학달이라서 시간표가 변경될테니 그것도 알고 있으면 좋겠어."
 *
 * 편성표의 규칙: **시간대가 과목을 고정하고, 과정 A/B 만 달마다 뒤바뀐다** — 9월 10:00 이 A 과정이면 10월 10:00 은 B 과정이고
 * 월수금 RC · 화목금 LC 배치는 그대로다. 그래서 다음 달 반을 열 때는 지난달 같은 자리(강좌 · 트랙 · 시간대)에서
 * **과목은 그대로 잇고 과정은 뒤집어** 미리 채운다. 강사는 확인만 하고 다르면 고친다.
 *
 * **계절이 바뀌는 달(평달 ↔ 방학달)은 채우지 않는다** — 방학달은 시간표가 달라 지난달 자리가 뜻이 없다.
 * 어느 달이 방학달인지는 `timetable.ts` 의 `VACATION_MONTHS` 한곳이 정한다. 그 달은 강사가 직접 고른다.
 * DB 의 한 번짜리 채우기(마이그레이션 20260923160000)도 같은 규칙이었다.
 */

import { isSubject, type Subject } from "./instructor-subject";
import { seasonOfMonth, SEASON_LABEL } from "./timetable";

export type CourseSet = "A" | "B";

export const COURSE_SETS: readonly CourseSet[] = ["A", "B"];

export const isCourseSet = (v: unknown): v is CourseSet => v === "A" || v === "B";

/** A ↔ B. 값이 없으면 null */
export const flipSet = (s: string | null | undefined): CourseSet | null => (s === "A" ? "B" : s === "B" ? "A" : null);

/** 지난달 반에서 읽는 칸 */
export type PrevSection = { course_id: number; track: string; time_block: string | null; subject: string | null; book_set: string | null };

export type SlotDefault = { subject: Subject | null; set: CourseSet | null };

/** (강좌 · 트랙 · 시간대) 자리 키 — 화면과 서버가 같은 키를 쓴다 */
export const slotKey = (courseId: number, track: string, timeBlock: string | null) => `${courseId}|${track}|${timeBlock ?? ""}`;

/** 같은 계절(평달끼리 · 방학달끼리)인가 — 다르면 시간표가 달라 지난달을 잇지 않는다 */
export const sameSeason = (prevMonth: number, month: number) => seasonOfMonth(prevMonth) === seasonOfMonth(month);

/**
 * 다음 달 기본값: 지난달 같은 자리의 **과목은 그대로, 과정은 뒤집어서**.
 * 계절이 바뀌면 빈 Map — 아무것도 미리 채우지 않는다.
 */
export function nextMonthDefaults(prev: PrevSection[], months: { prevMonth: number; month: number }): Map<string, SlotDefault> {
  const out = new Map<string, SlotDefault>();
  if (!sameSeason(months.prevMonth, months.month)) return out;
  for (const p of prev) {
    const subject = isSubject(p.subject) ? p.subject : null;
    const set = flipSet(p.book_set);
    if (!subject && !set) continue;
    out.set(slotKey(p.course_id, p.track, p.time_block), { subject, set });
  }
  return out;
}

/**
 * 표 위에 적는 한 줄. 지난달 반이 없으면 아무 말도 하지 않는다 (처음 여는 달).
 * 계절이 바뀌면 왜 안 채웠는지 말해 준다 — 안 그러면 "자동으로 채워진다더니" 가 된다.
 */
export function carryOverNote(months: { prevMonth: number; month: number }, hasPrev: boolean, filled: number): string | null {
  if (!hasPrev) return null;
  if (!sameSeason(months.prevMonth, months.month)) {
    return `${months.month}월은 ${SEASON_LABEL[seasonOfMonth(months.month)]}이라 시간표가 달라요 — ${months.prevMonth}월 편성을 이어받지 않았으니 과목과 과정을 직접 골라 주세요.`;
  }
  if (filled === 0) return null;
  return `${months.prevMonth}월 편성을 이어받았어요 — 과목은 그대로, 과정 A/B 는 뒤집었습니다. 확인만 하고 다르면 고치세요.`;
}
