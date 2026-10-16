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
 * 특강 = **무슨 특강 하나 + 신청 방식** (2026-10-16 Alan — "1. 모의고사 신청을 클릭하면, 신청방식을 고를 수 있게 해줘. 버튼형식으로 현장 / 시험지수령 / pdf수령 …
 * 2. RC특강과 LC특강도 클릭하면 신청방식을 고를 수 있도록 해줘. 현장 / 수업영상받기 …", 마이그레이션 20261016120000).
 *
 * - **무슨 특강(`LECTURE_KINDS`)** — RC특강 · LC특강 · 1차 · 2차 모의고사. `special_lectures.kinds` 에 하나(비우면 메모만 있는 특강).
 *   반 편성 달력이 이것만 정한다 — 신청 받기 · 방식 · 조건 · 정원 · 안내는 특강 신청 → 특강 설정에서.
 * - **신청 방식(`LECTURE_WAYS`)** — 현장 · 수업영상 받기 · 시험지 수령 · PDF 수령. 특강마다 정해진 방식 줄(`special_lecture_ways`)이 있고(`lectureWaysOf`)
 *   학생은 그중 하나를 골라 신청한다(`lecture_signups.way` — 한 특강에 한 방식).
 * - 2026-10-15 ~ 10-16 에는 방식마다 특강이 따로였다(`rc_video` · `mock1_paper` · `mock1_pdf` …) — 마이그레이션이 같은 날 같은 특강을 하나로 합치고 신청을 방식으로 옮겼다.
 * DB 의 check(`special_lectures_kinds_check` · `special_lecture_ways_way_check`) · `private.lecture_kinds` 순서 · `private.lecture_ways_of` · `private.lecture_kind_subject`
 * 와 값이 같아야 한다 — 바꾸면 모두 (lecture.test.ts 가 SQL 도 본다).
 */
export const LECTURE_KINDS = [
  { value: "rc", label: "RC특강", short: "RC", subject: "rc" },
  { value: "lc", label: "LC특강", short: "LC", subject: "lc" },
  { value: "mock1", label: "1차 모의고사", short: "1차", subject: null },
  { value: "mock2", label: "2차 모의고사", short: "2차", subject: null },
] as const;
export type LectureKind = (typeof LECTURE_KINDS)[number]["value"];
export const LECTURE_KIND_VALUES: LectureKind[] = LECTURE_KINDS.map((k) => k.value);
const KIND_BY_VALUE = new Map<string, (typeof LECTURE_KINDS)[number]>(LECTURE_KINDS.map((k) => [k.value, k]));

export const isLectureKind = (v: unknown): v is LectureKind => typeof v === "string" && KIND_BY_VALUE.has(v);
/** 알 수 없는 값이 들어와도 화면이 깨지지 않게 값 자체를 보여 준다 */
export const lectureKindLabel = (v: string) => KIND_BY_VALUE.get(v)?.label ?? v;
/** 특강의 과목 — RC특강 = rc, LC특강 = lc, 모의고사 = null (현장이든 수업영상 받기든 그 과목이다). DB `private.lecture_kind_subject` 와 같다 */
export const lectureKindSubject = (v: string): "rc" | "lc" | null => KIND_BY_VALUE.get(v)?.subject ?? null;
/** 정해진 순서(RC · LC · 1차 · 2차)대로 정리하고 중복을 없앤다 */
export const sortLectureKinds = (kinds: readonly string[]) =>
  LECTURE_KIND_VALUES.filter((k) => kinds.includes(k)) as string[];
/** 정렬에 쓰는 순서 — 같은 날 특강을 RC · LC · 1차 · 2차 순으로 세운다. 메모만 있는 특강은 맨 뒤 */
export const lectureKindRank = (kinds: readonly string[] | null | undefined) => {
  const i = LECTURE_KIND_VALUES.indexOf((kinds ?? [])[0] as LectureKind);
  return i < 0 ? LECTURE_KIND_VALUES.length : i;
};

/** 신청 방식 — 이름은 Alan 이 적은 그대로 ("현장 / 시험지수령 / pdf수령" · "현장 / 수업영상받기"). DB check `special_lecture_ways_way_check` 와 같은 값 */
export const LECTURE_WAYS = [
  { value: "onsite", label: "현장" },
  { value: "video", label: "수업영상 받기" },
  { value: "paper", label: "시험지 수령" },
  { value: "pdf", label: "PDF 수령" },
] as const;
export type LectureWay = (typeof LECTURE_WAYS)[number]["value"];
export const LECTURE_WAY_VALUES: LectureWay[] = LECTURE_WAYS.map((w) => w.value);
export const isLectureWay = (v: unknown): v is LectureWay => typeof v === "string" && LECTURE_WAYS.some((w) => w.value === v);
export const lectureWayLabel = (v: string) => LECTURE_WAYS.find((w) => w.value === v)?.label ?? v;
/** 무슨 특강의 신청 방식 — RC · LC특강 = 현장 · 수업영상 받기, 모의고사 = 현장 · 시험지 수령 · PDF 수령, 메모만 = 현장. DB `private.lecture_ways_of` 와 같다 */
export function lectureWaysOf(kind: string | null | undefined): LectureWay[] {
  if (kind === "rc" || kind === "lc") return ["onsite", "video"];
  if (kind === "mock1" || kind === "mock2") return ["onsite", "paper", "pdf"];
  return ["onsite"];
}
/** 방식 순서(현장 · 수업영상 · 시험지 · PDF)대로 */
export const sortByWay = <T extends { way: string }>(list: readonly T[]): T[] =>
  [...list].sort((a, b) => LECTURE_WAY_VALUES.indexOf(a.way as LectureWay) - LECTURE_WAY_VALUES.indexOf(b.way as LectureWay));

/**
 * 반 편성 달력 칸에 적는 특강 표시 — 특강마다 하나, 순서는 RC · LC · 1차 · 2차 · 메모만(`특강`). 같은 것이 둘이면 한 번만.
 * 넓은 칸은 `short`(`RC특강` · `1차 모의고사` — 칸보다 길면 끝이 `…`), 좁은 칸은 `tiny`(`RC` · `1차`). `label` 은 화면을 못 보는 사람에게 읽어 줄 이름이다.
 */
export function lectureDayTags(kindsList: readonly (readonly string[])[]): { key: string; short: string; tiny: string; label: string }[] {
  const have = new Set<string>();
  let plain = false;
  for (const kinds of kindsList) {
    const known = (kinds ?? []).filter(isLectureKind);
    if (known.length === 0) plain = true;
    for (const k of known) have.add(k);
  }
  const tags: { key: string; short: string; tiny: string; label: string }[] = LECTURE_KINDS.filter((k) => have.has(k.value)).map((k) => ({
    key: k.value,
    short: k.label,
    tiny: k.short,
    label: k.label,
  }));
  if (plain) tags.push({ key: "plain", short: "특강", tiny: "특강", label: "특강" });
  return tags;
}
