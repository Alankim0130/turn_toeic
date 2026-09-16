/**
 * 수업 시간표의 두 계절 (2026-09-16 Alan 확정).
 *
 * 9·10월처럼 평소에 돌아가는 **평달**과 7·8월 같은 **방학달**의 시간대가 다르고,
 * **1·2월도 방학달과 같은 세팅**이다. `timetable_slots.season` 이 이 값을 담는다.
 *
 * 방학달 시간대는 해마다·달마다 달라서 (같은 방학이어도 7월 850 은 80분 15:30,
 * 8월 850 은 120분 12:30 이었다) 코드에 넣지 않는다 — 그 해 값을 DB 에 넣어 쓴다.
 */

export const SEASONS = ["regular", "vacation"] as const;
export type Season = (typeof SEASONS)[number];

/** 방학달. 바뀌면 여기만 고친다 */
export const VACATION_MONTHS = [1, 2, 7, 8];

export const SEASON_LABEL: Record<Season, string> = { regular: "평달", vacation: "방학달" };

/** 이 달이 평달인지 방학달인지 */
export const seasonOfMonth = (month: number): Season => (VACATION_MONTHS.includes(month) ? "vacation" : "regular");

export const isSeason = (v: unknown): v is Season => typeof v === "string" && (SEASONS as readonly string[]).includes(v);
