import { PROGRAMS, PROGRAM_LABEL, type Program } from "./timetable";
import { TRACK_LABEL } from "./utils";

/**
 * 승인 화면 — **수강증에 적힌 반이 아직 열리지 않았나** (2026-10-06 Alan "850 2주 수강증 올라왔어. 근데 수동등업에서 선택란이 없어").
 *
 * 승인 화면의 반 고르기는 **열린 반만** 보여 준다. 2주완성은 10/5 에 생겨서 그 전에 연 10월 반 목록에 없었고, 첫 2주완성 수강증이 오자
 * 고를 칸이 없어 승인이 막혔다. 수강증은 제대로 읽혔고("850 2주완성 12:30~15:00 에 열린 반이 없어요") 고칠 것은 **반을 여는 일**이었는데
 * 화면이 그 길을 말해 주지 않았다. 그래서 수강증에서 읽은 반(레벨 · 과정 · 시간 · 트랙 · 수강월)이 열린 반 목록에 없으면 반 고르기 위에 적는다.
 *
 * 규칙은 반 대조(`matchSections`)의 키와 같다 — 레벨 = `target_score` · 과정 = `program` · 시간 = `time_block` 정확 일치 ·
 * 주5일이면 월수금 + 화목금 · 수강월(배지 → 수강요일 줄의 개강일)을 읽었으면 그 달. 판독이 비면(레벨 · 시간) 아무것도 말하지 않는다 —
 * 근거 없이 "안 열렸다" 고 하지 않는다. 저장된 판독(jsonb)을 그대로 받으므로 칸이 없는 예전 기록도 견딘다 (과정이 없으면 점수보장반).
 */
type Parsed = {
  level?: unknown;
  program?: unknown;
  weekly?: unknown;
  tracks?: unknown;
  time?: unknown;
  courseMonth?: unknown;
  startMonth?: unknown;
};

/** 승인 화면이 이미 읽는 열린 반 (`status = open` · 종강 전) */
export type OpenClass = {
  track: string;
  time_block: string | null;
  term: { year: number; month: number } | null;
  course: { program: string; target_score: number | null } | null;
};

/** 강좌 이름 — 안 열린 반은 열린 반 목록에 없어서 이름을 강좌 목록에서 찾는다 */
export type CourseName = { name: string; program: string; target_score: number | null };

export type MissingClass = {
  /** `10월 850+ 2주완성 · 주5일 · 12:30~15:00` */
  label: string;
  /** 새 반 개설로 가는 기수 `YYYY-MM` — 수강월을 못 읽었으면 null (새 반 개설이 이번 달을 연다) */
  term: string | null;
};

export function missingClassOf(
  parsed: Parsed | null | undefined,
  open: readonly OpenClass[],
  courses: readonly CourseName[],
  today: string,
): MissingClass | null {
  if (!parsed) return null;
  const level = typeof parsed.level === "number" ? parsed.level : null;
  const rawTime = parsed.time && typeof parsed.time === "object" ? (parsed.time as { timeBlock?: unknown }).timeBlock : null;
  const timeBlock = typeof rawTime === "string" && rawTime ? rawTime : null;
  if (level == null || !timeBlock) return null;

  const program: Program = (PROGRAMS as readonly unknown[]).includes(parsed.program) ? (parsed.program as Program) : "score";
  const tracks = Array.isArray(parsed.tracks) ? parsed.tracks.filter((t): t is string => t === "mwf" || t === "ttf") : [];
  // 주5일 = 월수금 + 화목금 (반 대조와 같다). 주3일이면 읽은 트랙 하나. 못 읽었으면 트랙은 따지지 않는다
  const want = parsed.weekly === 5 ? ["mwf", "ttf"] : tracks.length === 1 ? tracks : [];
  const month = typeof parsed.courseMonth === "number" ? parsed.courseMonth : typeof parsed.startMonth === "number" ? parsed.startMonth : null;

  const same = open.filter(
    (s) =>
      s.course?.target_score === level &&
      (s.course?.program ?? "score") === program &&
      s.time_block === timeBlock &&
      (month == null || s.term?.month === month),
  );
  const missing = want.filter((t) => !same.some((s) => s.track === t));
  if (want.length > 0 ? missing.length === 0 : same.length > 0) return null;

  const name = courses.find((c) => c.target_score === level && c.program === program)?.name ?? `${level} ${PROGRAM_LABEL[program]}`;
  // 주5일인데 둘 다 없으면 `주5일`, 한쪽만 없으면 그 트랙 — 이미 열린 쪽까지 적으면 무엇을 열지 헷갈린다
  const trackLabel = want.length === 2 && missing.length === 2 ? "주5일" : missing.map((t) => TRACK_LABEL[t] ?? t).join(" · ") || null;
  return {
    label: [month != null ? `${month}월 ${name}` : name, trackLabel, timeBlock].filter(Boolean).join(" · "),
    term: month != null ? termKeyOf(month, open, today) : null,
  };
}

/**
 * 수강증의 달(연도 없음) → `YYYY-MM`. 그 달 반이 하나라도 열려 있으면 그 기수의 연도, 아니면 오늘에서 가장 가까운 해
 * (12월에 올린 1월 수강증은 다음 해 1월, 1월에 본 12월 수강증은 지난해 12월).
 */
function termKeyOf(month: number, open: readonly OpenClass[], today: string): string {
  const known = open.find((s) => s.term?.month === month)?.term?.year;
  const [ty, tm] = today.split("-").map(Number);
  const year = known ?? (month - tm > 6 ? ty - 1 : tm - month > 6 ? ty + 1 : ty);
  return `${year}-${String(month).padStart(2, "0")}`;
}
