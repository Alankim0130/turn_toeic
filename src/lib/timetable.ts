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
 * 과정 (2026-09-16 Alan — 브로슈어의 두 과정 → 2026-10-05 2주완성). `courses.program` · `timetable_slots.program` 이 이 값을 담는다.
 * 같은 650 이라도 점수보장반(10:00~12:10)과 스파르타반(10:00~13:40)은 시간대가 달라 과정으로 나눈다.
 * 스파르타반은 `courses.includes_levels`(예: 850)의 점수보장반 권한을 함께 받는다 — DB 의 private.section_includes.
 * 2주완성반(`twoweek`, 2026-10-05 Alan "850반 2주완성반이 있어 … 절반만 수업을 듣는거야")은 같은 레벨 점수보장반 수업의
 * **앞 절반**만 듣는다 — `src/lib/two-week.ts`. DB check(courses_program_check · timetable_slots_program_check)와 값이 같아야 한다.
 */
export const PROGRAMS = ["score", "sparta", "twoweek"] as const;
export type Program = (typeof PROGRAMS)[number];

export const PROGRAM_LABEL: Record<Program, string> = { score: "한 달 점수보장반", sparta: "스파르타반", twoweek: "2주완성반" };

/**
 * 랜딩 수업시간표에 카드로 세우는 과정 — 점수보장반 → 스파르타반 → 2주완성반 (2026-10-05 Alan "랜딩 수업시간표에도 넣어줘").
 * 카드는 그 달 시간표에 그 과정 줄이 있는 레벨만 선다 (지금 2주완성은 850 하나)
 */
export const LANDING_PROGRAMS: readonly Program[] = ["score", "sparta", "twoweek"];

export const isProgram = (v: unknown): v is Program => typeof v === "string" && (PROGRAMS as readonly string[]).includes(v);

/** 과정 순서 — 점수보장반 → 스파르타반 → 2주완성반 (`PROGRAMS` 순서). 모르는 값은 맨 뒤. 목록 정렬에 쓴다 */
export const programRank = (p: string | null | undefined): number => {
  const i = (PROGRAMS as readonly string[]).indexOf(p ?? "");
  return i < 0 ? PROGRAMS.length : i;
};

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

/** 레벨 이름표의 재료 — `courses` 의 세 칸 */
export type LevelCourse = { name: string; program?: string | null; target_score?: number | null };

/**
 * 학생 레벨 이름표 — 점수보장반 `650`, 속성반 `650 중급속성`, 2주완성 `850 2주완성`
 * (2026-10-16 Alan — "특강 신청자 목록중에서 지금 이름과 전화번호가 나와있는데, 전화번호말고, 학생 본인의 레벨이 나오도록해줘").
 * 레벨 숫자는 `courses.target_score`, 과정 이름은 `courseShortName` — 코드에 레벨을 적지 않는다 (작업 원칙 4).
 * 속성반 · 2주완성은 같은 숫자의 점수보장반과 다른 수업이라 과정 이름을 붙인다 (관리자 시간표 카드 제목과 같은 모양).
 * 레벨을 모르면 강좌 이름 그대로 — 지어내지 않는다.
 */
export function courseLevelLabel(c: LevelCourse): string {
  const name = c.name.trim();
  if (c.target_score == null) return name;
  const program = c.program ?? "score";
  if (program === "score") return String(c.target_score);
  const short = courseShortName(name);
  // 레벨 토큰을 떼고 남는 글자가 없던 이름(`스파르타 650+`)은 과정 이름으로 — `650 스파르타 650+` 처럼 레벨을 두 번 적지 않는다
  const kind = short === name ? (isProgram(program) ? PROGRAM_LABEL[program] : name) : short;
  return `${c.target_score} ${kind}`;
}

/**
 * 학생 한 명의 레벨들 — 그 기수에 배정된 반의 강좌로. 같은 이름표는 한 번(주5일 · 120분은 한 강좌라 하나),
 * 레벨 → 과정 순 (650 RC 단과 + 750 LC 단과면 `650` · `750`). `level` 은 레벨 숫자(색을 고를 때) — 모르면 null.
 */
export function studentLevels(courses: readonly LevelCourse[]): { label: string; level: number | null }[] {
  const seen = new Map<string, { label: string; level: number | null; rank: number }>();
  for (const c of courses) {
    const label = courseLevelLabel(c);
    if (!seen.has(label)) seen.set(label, { label, level: c.target_score ?? null, rank: programRank(c.program) });
  }
  return [...seen.values()]
    .sort((a, b) => (a.level ?? Infinity) - (b.level ?? Infinity) || a.rank - b.rank || a.label.localeCompare(b.label, "ko"))
    .map(({ label, level }) => ({ label, level }));
}
