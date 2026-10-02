import { lectureKindLabel, sortLectureKinds } from "@/lib/utils";

/**
 * 특강 신청 상태. DB(private.lecture_signup_open)와 같은 규칙으로 화면에서도 판정한다.
 * 화면 안내일 뿐 실제 판단은 RLS·트리거가 한다.
 */
export type LectureSignupRow = {
  id: number;
  date: string;
  signup: boolean;
  capacity: number | null;
  signup_opens_at: string | null;
  applied_count: number;
};

export type LectureState = "none" | "not_open" | "open" | "full" | "closed";

/**
 * 신청 시작의 기본값 — **특강 7일 전 자정(KST)** (2026-10-02 Alan "특강신청도 지금 전부다 열려있는데, 일주일전부터 하나씩 열어주면").
 * 강사가 /admin/lectures 에서 신청 시작을 따로 적으면 그 값이 먼저다. DB `private.lecture_signup_open` 과 같은 규칙 — 바꾸면 둘 다.
 */
export const LECTURE_SIGNUP_LEAD_DAYS = 7;

const DAY_MS = 86_400_000;
const dateToUtc = (date: string) => Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));

/** 'YYYY-MM-DD' 에서 days 만큼 옮긴 날짜 (음수면 앞으로) */
export const shiftDate = (date: string, days: number) => new Date(dateToUtc(date) + days * DAY_MS).toISOString().slice(0, 10);

/** ISO 시각 → 한국 날짜 'YYYY-MM-DD' */
export const kstDateOf = (iso: string) => new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

/** 신청이 열리는 시각(ISO). 따로 정한 값이 없으면 특강 7일 전 자정(KST) */
export function lectureOpensAt(l: Pick<LectureSignupRow, "date" | "signup_opens_at">): string {
  return l.signup_opens_at ?? new Date(`${shiftDate(l.date, -LECTURE_SIGNUP_LEAD_DAYS)}T00:00:00+09:00`).toISOString();
}

/** todayKst: 'YYYY-MM-DD', now: 지금(ms). 신청은 신청 시작(비우면 7일 전 자정)부터 특강 당일까지 */
export function lectureState(l: LectureSignupRow, todayKst: string, now = Date.now()): LectureState {
  if (!l.signup) return "none";
  if (todayKst > l.date) return "closed";
  if (new Date(lectureOpensAt(l)).getTime() > now) return "not_open";
  if (l.capacity !== null && l.applied_count >= l.capacity) return "full";
  return "open";
}

/**
 * 신청 시작까지 **D-day** (한국 날짜 기준 날수 — 0 이면 오늘 열린다 = D-DAY). 이미 열렸으면 null.
 * 잠긴 특강 카드에 크게 적는다 (2026-10-02 Alan "잠겨있는거는 카운트다운 D-day").
 */
export function signupDday(l: Pick<LectureSignupRow, "date" | "signup_opens_at">, todayKst: string, now = Date.now()): number | null {
  const opens = lectureOpensAt(l);
  if (new Date(opens).getTime() <= now) return null;
  return Math.max(0, Math.round((dateToUtc(kstDateOf(opens)) - dateToUtc(todayKst)) / DAY_MS));
}

export const ddayLabel = (dday: number) => (dday === 0 ? "D-DAY" : `D-${dday}`);

/**
 * 특강 카드의 강사 캐리커처와 한마디 (2026-10-02 Alan "강사에 맞춰서 케릭커쳐도 같이 웃기게"). 자세는 종류를 따른다 —
 * 이혜영 LC특강 = 헤드폰 건 노트 컷, 모의고사만이면 윙크 가리키기 · 이영수 RC특강 = 태블릿 설명 컷, 모의고사만이면 엄지척.
 * 그림은 site.instructors[].caricatures (InstructorCameo) — 새 자세를 지어내지 않는다. 이름이 두 강사가 아니면 그리지 않는다.
 */
export function lectureCameo(
  lecturer: string | null | undefined,
  kinds: string[] | null | undefined,
): { name: "이혜영" | "이영수"; pose: "point" | "notebook" | "thumbsup" | "tablet"; line: string } | null {
  const k = new Set(kinds ?? []);
  if (lecturer === "이혜영") {
    return k.has("lc")
      ? { name: "이혜영", pose: "notebook", line: "귀가 뚫리는 날이에요. 헤드폰 챙기세요!" }
      : { name: "이혜영", pose: "point", line: "실전처럼 풀어요. 점수는 제가 올려 드릴게요!" };
  }
  if (lecturer === "이영수") {
    return k.has("rc")
      ? { name: "이영수", pose: "tablet", line: "버릴 문제까지 알려 드려요. 오기만 하세요!" }
      : { name: "이영수", pose: "thumbsup", line: "찍지 말고 풀어요. 제가 다 보고 있어요!" };
  }
  return null;
}

export const LECTURE_STATE_LABEL: Record<LectureState, string> = {
  none: "",
  not_open: "곧 시작",
  open: "신청 받는 중",
  full: "정원 마감",
  closed: "신청 마감",
};

export const LECTURE_STATE_CLASS: Record<LectureState, string> = {
  none: "",
  not_open: "bg-violet-100 text-violet-800",
  open: "bg-brand-100 text-brand-700",
  full: "bg-amber-100 text-amber-800",
  closed: "bg-line text-slate",
};

/** "RC특강 · 1차 모의고사 — 파트5 집중" */
export function lectureTitle(l: { kinds: string[] | null; content: string | null }) {
  const kinds = sortLectureKinds(l.kinds ?? []).map(lectureKindLabel);
  const memo = l.content?.trim();
  if (kinds.length === 0) return memo || "특강";
  return memo ? `${kinds.join(" · ")} — ${memo}` : kinds.join(" · ");
}

/** 신청 시작 일시를 "9/17 00:05" 로 (한국 시간) */
export function formatKstDateTime(iso: string) {
  const kst = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
  const m = kst.getUTCMonth() + 1;
  const d = kst.getUTCDate();
  const hh = String(kst.getUTCHours()).padStart(2, "0");
  const mm = String(kst.getUTCMinutes()).padStart(2, "0");
  return `${m}/${d} ${hh}:${mm}`;
}

/** 남은 자리. 정원이 없으면 null */
export const seatsLeft = (l: LectureSignupRow) => (l.capacity === null ? null : Math.max(0, l.capacity - l.applied_count));
