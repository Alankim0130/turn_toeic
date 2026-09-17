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

/**
 * 과정 (2026-09-16 Alan — 브로슈어의 두 과정). `courses.program` · `timetable_slots.program` 이 이 값을 담는다.
 * 같은 650 이라도 점수보장반(10:00~12:10)과 스파르타반(10:00~13:40)은 시간대가 달라 과정으로 나눈다.
 * 스파르타반은 `courses.includes_levels`(예: 850)의 점수보장반 권한을 함께 받는다 — DB 의 private.section_includes.
 */
export const PROGRAMS = ["score", "sparta"] as const;
export type Program = (typeof PROGRAMS)[number];

export const PROGRAM_LABEL: Record<Program, string> = { score: "한 달 점수보장반", sparta: "스파르타반" };

export const isProgram = (v: unknown): v is Program => typeof v === "string" && (PROGRAMS as readonly string[]).includes(v);

/**
 * 강좌 이름에서 랜딩 카드에 쓸 짧은 이름 — `스파르타 650+ 중급속성` → `중급속성`
 * (2026-09-17 Alan "이름을 스파르타라고 하지말고 중급속성과 실전속성으로 해줘").
 * 앞의 과정 이름(스파르타)과 레벨 토큰(`650+` · `650`)만 뗀다 — 이름은 `courses.name` 한곳이고 코드에 적지 않는다.
 * 떼고 나서 남는 글자가 없으면 원래 이름 그대로 돌려준다 (지어내지 않는다)
 */
export function courseShortName(name: string): string {
  const short = name.trim().replace(/^스파르타\s*/, "").replace(/^\d{3,4}\+?\s*/, "").trim();
  return short || name.trim();
}
