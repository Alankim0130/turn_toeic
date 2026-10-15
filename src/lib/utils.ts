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
 * 특강 종류 — **여덟 가지, 특강 하나에 하나** (2026-10-15 Alan — "RC특강과 모의고사 특강이 두 개 있는데 이거 구분해서 받아야해. 그래서
 * 1. RC특강 (현강신청)/ RC 특강(녹화영상신청) 2. LC특강 (현강신청)/ LC 특강(녹화영상신청) 3. 1차 모의고사 (현강신청)/ 1차 모의고사 (시험지 수령 신청)
 * 4. 2차 모의고사 (현강신청)/ 2차 모의고사 (시험지 수령 신청) 이렇게 총 8개로"). 2026-09-15 ~ 10-15 에는 넷(rc · lc · mock1 · mock2)을 한 특강에 여러 개 골랐다 —
 * 그 넷이 그대로 **현강신청**이고, 이미 둘 이상 고른 특강은 마이그레이션 20261015130000 이 종류마다 나눴다.
 *
 * - `base` 는 무슨 특강인가(RC특강 · LC특강 · 1차 · 2차 모의고사), `way` 는 어떻게 받나(현강 · 녹화영상 · 시험지 수령). 같은 날 RC특강 현강과 녹화영상은 **특강 두 개**다 —
 *   신청 · 정원 · 신청 조건 · 안내가 따로다.
 * - `label` 은 Alan 이 적은 이름 그대로. 반 편성 달력 칸은 `base` 로 묶어 짧게 적는다 (`lectureDayTags`).
 * - 과목(`lectureKindSubject`) — 녹화영상도 그 과목이다 (RC 단과는 LC특강 녹화영상도 신청하지 못한다 — 2026-10-12 단과 규칙).
 * DB 의 check 제약(`special_lectures_kinds_check`) · `private.lecture_kinds` 순서 · `private.lecture_kind_subject` 와 값이 같아야 한다 — 바꾸면 모두 (lecture.test.ts).
 */
export const LECTURE_BASES = [
  { value: "rc", label: "RC특강", short: "RC", subject: "rc" },
  { value: "lc", label: "LC특강", short: "LC", subject: "lc" },
  { value: "mock1", label: "1차 모의고사", short: "1차", subject: null },
  { value: "mock2", label: "2차 모의고사", short: "2차", subject: null },
] as const;
export type LectureBase = (typeof LECTURE_BASES)[number]["value"];

export const LECTURE_KINDS = [
  { value: "rc", base: "rc", way: "onsite", label: "RC특강 (현강신청)", wayLabel: "현강신청", wayShort: "현강" },
  { value: "rc_video", base: "rc", way: "video", label: "RC특강 (녹화영상신청)", wayLabel: "녹화영상신청", wayShort: "녹화" },
  { value: "lc", base: "lc", way: "onsite", label: "LC특강 (현강신청)", wayLabel: "현강신청", wayShort: "현강" },
  { value: "lc_video", base: "lc", way: "video", label: "LC특강 (녹화영상신청)", wayLabel: "녹화영상신청", wayShort: "녹화" },
  { value: "mock1", base: "mock1", way: "onsite", label: "1차 모의고사 (현강신청)", wayLabel: "현강신청", wayShort: "현강" },
  { value: "mock1_paper", base: "mock1", way: "paper", label: "1차 모의고사 (시험지 수령 신청)", wayLabel: "시험지 수령 신청", wayShort: "시험지" },
  { value: "mock2", base: "mock2", way: "onsite", label: "2차 모의고사 (현강신청)", wayLabel: "현강신청", wayShort: "현강" },
  { value: "mock2_paper", base: "mock2", way: "paper", label: "2차 모의고사 (시험지 수령 신청)", wayLabel: "시험지 수령 신청", wayShort: "시험지" },
] as const;

export type LectureKind = (typeof LECTURE_KINDS)[number]["value"];
export const LECTURE_KIND_VALUES: LectureKind[] = LECTURE_KINDS.map((k) => k.value);
const KIND_BY_VALUE = new Map<string, (typeof LECTURE_KINDS)[number]>(LECTURE_KINDS.map((k) => [k.value, k]));
const BASE_BY_VALUE = new Map<string, (typeof LECTURE_BASES)[number]>(LECTURE_BASES.map((b) => [b.value, b]));

export const isLectureKind = (v: unknown): v is LectureKind => typeof v === "string" && KIND_BY_VALUE.has(v);
/** 알 수 없는 값이 들어와도 화면이 깨지지 않게 값 자체를 보여 준다 */
export const lectureKindLabel = (v: string) => KIND_BY_VALUE.get(v)?.label ?? v;
/** 종류가 듣는 과목 — RC특강(현강 · 녹화영상) = rc, LC특강 = lc, 모의고사 = null. DB `private.lecture_kind_subject` 와 같다 */
export const lectureKindSubject = (v: string): "rc" | "lc" | null => BASE_BY_VALUE.get(KIND_BY_VALUE.get(v)?.base ?? "")?.subject ?? null;
/** 같은 특강(base)의 종류들 — 반 편성 달력이 두 칸씩 묶어 보여 준다 */
export const lectureKindsOf = (base: string) => LECTURE_KINDS.filter((k) => k.base === base);
/** 정해진 순서(RC 현강 · 녹화 · LC 현강 · 녹화 · 1차 · 2차)대로 정리하고 중복을 없앤다 */
export const sortLectureKinds = (kinds: string[]) =>
  LECTURE_KIND_VALUES.filter((k) => kinds.includes(k)) as string[];
/** 정렬에 쓰는 종류 순서 — 같은 날 특강을 RC 현강 · 녹화 · … 순으로 세운다. 종류가 없으면 맨 뒤 */
export const lectureKindRank = (kinds: readonly string[] | null | undefined) => {
  const i = LECTURE_KIND_VALUES.indexOf((kinds ?? [])[0] as LectureKind);
  return i < 0 ? LECTURE_KIND_VALUES.length : i;
};

/**
 * 반 편성 달력 칸에 적는 특강 표시 — **무슨 특강인가(base)로 묶는다**. 하루에 RC특강 현강 · 녹화영상 · 2차 모의고사 현강 · 시험지가 함께 있으면
 * 칸이 넷으로 넘쳐서 `RC 현강·녹화` · `2차 현강·시험지` 둘로 적고, 좁은 칸(`tiny`)은 `RC` · `2차` 만 적는다. 종류가 없는 특강(내용만)은 `특강`.
 * `label` 은 화면을 못 보는 사람에게 읽어 줄 전체 이름이다.
 */
export function lectureDayTags(kindsList: readonly (readonly string[])[]): { key: string; short: string; tiny: string; label: string }[] {
  const byBase = new Map<string, Set<string>>();
  let plain = false;
  for (const kinds of kindsList) {
    const known = (kinds ?? []).filter(isLectureKind);
    if (known.length === 0) plain = true;
    for (const k of known) {
      const base = KIND_BY_VALUE.get(k)!.base;
      byBase.set(base, (byBase.get(base) ?? new Set()).add(k));
    }
  }
  const tags: { key: string; short: string; tiny: string; label: string }[] = LECTURE_BASES.filter((b) => byBase.has(b.value)).map((b) => {
    const kinds = lectureKindsOf(b.value).filter((k) => byBase.get(b.value)!.has(k.value));
    return {
      key: b.value,
      short: `${b.short} ${kinds.map((k) => k.wayShort).join("·")}`,
      tiny: b.short,
      label: kinds.map((k) => k.label).join(", "),
    };
  });
  if (plain) tags.push({ key: "plain", short: "특강", tiny: "특강", label: "특강" });
  return tags;
}
