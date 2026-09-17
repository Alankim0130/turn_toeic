export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

/** 한국 시간 기준 오늘 (YYYY-MM-DD) */
export function todayKST(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
}

export function formatDate(d: string | Date, opts: Intl.DateTimeFormatOptions = { month: "long", day: "numeric", weekday: "short" }) {
  const date = typeof d === "string" ? new Date(d + (d.length === 10 ? "T00:00:00+09:00" : "")) : d;
  // Node 24(ICU 78)는 한국어 오전·오후를 "AM·PM"으로 내보내서 되돌린다
  return date
    .toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", ...opts })
    .replace(/\bAM\b/g, "오전")
    .replace(/\bPM\b/g, "오후");
}

export function formatTime(t: string | null | undefined) {
  // "09:30:00" → "09:30". 반 편성에서 수업 시간을 받지 않으므로 반·회차 시간은 비어 있을 수 있다
  return t ? t.slice(0, 5) : "";
}

/** "09:30–11:50". 시작·종료 중 하나라도 없으면 빈 문자열 */
export function formatTimeRange(start: string | null | undefined, end: string | null | undefined) {
  return start && end ? `${formatTime(start)}–${formatTime(end)}` : "";
}

export function formatWon(n: number) {
  return n.toLocaleString("ko-KR") + "원";
}

export const TRACK_LABEL: Record<string, string> = { mwf: "월수금", ttf: "화목금" };
/** 인강 반 — 교실에 나오지 않고 그 날 오전 수업 녹화본을 본다 (2026-09-17 Alan: 저녁반 화목금).
 *  불라방(라이브방송)과 다르다 — `enrollments.mode` 는 그대로 onsite 다 */
export const RECORDED_LABEL = "인강";
export const RECORDED_NOTE = "교실에 나오지 않고 그 날 오전 수업 녹화본을 봐요.";
export const MODE_LABEL: Record<string, string> = { onsite: "현장", live: "불라방" };
export const COURSE_TYPE_LABEL: Record<string, string> = { full: "종합", lc: "단과 LC", rc: "단과 RC" };

/**
 * 특강 종류 (2026-09-15 Alan 요청). 하나의 특강에 여러 개를 고를 수 있다 (`special_lectures.kinds`).
 * short 는 달력 칸에 들어가는 짧은 이름. DB 의 check 제약과 값이 같아야 한다.
 */
export const LECTURE_KINDS = [
  { value: "rc", label: "RC특강", short: "RC", tiny: "RC" },
  { value: "lc", label: "LC특강", short: "LC", tiny: "LC" },
  { value: "mock1", label: "1차 모의고사", short: "1차 모의고사", tiny: "1차" },
  { value: "mock2", label: "2차 모의고사", short: "2차 모의고사", tiny: "2차" },
] as const;

export type LectureKind = (typeof LECTURE_KINDS)[number]["value"];
export const LECTURE_KIND_VALUES: LectureKind[] = LECTURE_KINDS.map((k) => k.value);
const KIND_BY_VALUE = new Map(LECTURE_KINDS.map((k) => [k.value as string, k]));

export const isLectureKind = (v: unknown): v is LectureKind => typeof v === "string" && KIND_BY_VALUE.has(v);
/** 알 수 없는 값이 들어와도 화면이 깨지지 않게 값 자체를 보여 준다 */
export const lectureKindLabel = (v: string) => KIND_BY_VALUE.get(v)?.label ?? v;
export const lectureKindShort = (v: string) => KIND_BY_VALUE.get(v)?.short ?? v;
/** 좁은 화면(달력 칸)용 더 짧은 이름 */
export const lectureKindTiny = (v: string) => KIND_BY_VALUE.get(v)?.tiny ?? v;
/** 정해진 순서(RC · LC · 1차 · 2차)대로 정리하고 중복을 없앤다 */
export const sortLectureKinds = (kinds: string[]) =>
  LECTURE_KIND_VALUES.filter((k) => kinds.includes(k)) as string[];
