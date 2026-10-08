import { normalizeLinkUrl } from "@/lib/class-materials";
import { site } from "@/lib/site";
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
 *
 * **말풍선은 응원만이다** (2026-10-07 Alan — "헤드폰 가져오세요 라고 적혀있는데 진짜 가져올 수 있어! 이거 아닌데 말이야. 오해를 불러일으키는 문구는 빼줘").
 * 강사님이 하신 말이 아니라 지어낸 한마디라, 학생이 그대로 따라 할 말(준비물 · "오기만 하세요")이나 강의 내용 · 점수 약속은 넣지 않는다.
 * 그날 바꾼 것: "헤드폰 챙기세요!" · "버릴 문제까지 알려 드려요. 오기만 하세요!" · "점수는 제가 올려 드릴게요!"
 */
export function lectureCameo(
  lecturer: string | null | undefined,
  kinds: string[] | null | undefined,
): { name: "이혜영" | "이영수"; pose: "point" | "notebook" | "thumbsup" | "tablet"; line: string } | null {
  const k = new Set(kinds ?? []);
  if (lecturer === "이혜영") {
    return k.has("lc")
      ? { name: "이혜영", pose: "notebook", line: "귀가 뻥 뚫리는 날이에요. 기대하세요!" }
      : { name: "이혜영", pose: "point", line: "실전처럼 풀어 봐요. 끝까지 응원할게요!" };
  }
  if (lecturer === "이영수") {
    return k.has("rc")
      ? { name: "이영수", pose: "tablet", line: "지문이 술술 읽히는 날이에요. 놓치지 마세요!" }
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

/**
 * **3주차 모의고사 특강은 YBM 수강후기 링크를 올려야 신청된다** (2026-10-08 Alan — "3주차 특강에서 모의고사 특강을 신청할때,
 * ybm홈페이지에서 수강후기를 작성해서 올리는것이 신청조건이야. 학생이 후기를 적고 난 뒤에 이미지처럼 링크를 올리면 신청이 되는걸로 해줘").
 * 주차는 그 달 개강일(terms.enrollment_opens_at)이 든 주(월요일 시작)가 1주차 — 10월(10/6 개강)이면 10/24 RC특강 + 2차 모의고사.
 * DB `private.lecture_needs_review`(마이그레이션 20261008100000 — 신청을 넣을 때 트리거가 막는다)와 같은 규칙 — 바꾸면 둘 다 (lecture.test.ts 가 SQL 도 본다).
 */
export const REVIEW_LECTURE_WEEK = 3;
export const REVIEW_LECTURE_KINDS = ["mock1", "mock2"] as const;

/** 그 날짜가 든 주의 월요일 (UTC ms) */
const mondayOf = (date: string) => {
  const t = dateToUtc(date);
  const isodow = new Date(t).getUTCDay() || 7; // 월 1 … 일 7
  return t - (isodow - 1) * DAY_MS;
};

/** 개강일이 든 주(월요일 시작)를 1주차로 센 그 날짜의 주차. 개강 전 주는 0 이하 */
export const lectureWeek = (date: string, termOpens: string) => Math.round((mondayOf(date) - mondayOf(termOpens)) / (7 * DAY_MS)) + 1;

/** 후기 링크를 올려야 신청되는 특강인가 — 모의고사가 든 3주차 특강. 개강일을 모르면 아니다 (DB 도 같다) */
export function needsReviewLink(l: { date: string; kinds: readonly string[] | null }, termOpens: string | null | undefined): boolean {
  if (!termOpens) return false;
  if (!(l.kinds ?? []).some((k) => (REVIEW_LECTURE_KINDS as readonly string[]).includes(k))) return false;
  return lectureWeek(l.date, termOpens) === REVIEW_LECTURE_WEEK;
}

/** ybmedu.com(과 그 아래 주소)인가 — 강사 화면이 아닌 주소에 표시를 붙인다. 신청을 막지는 않는다 (마이그레이션 머리말) */
export function isYbmUrl(url: string) {
  try {
    return /(^|\.)ybmedu\.com$/i.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** 주소 비교용 — www. · m. 을 떼고, 경로 끝의 / 를 뗀다 */
const addressKey = (url: string) => {
  const u = new URL(url);
  return `${u.hostname.replace(/^(www|m)\./i, "").toLowerCase()}${u.pathname.replace(/\/+$/, "")}${u.search}${u.hash}`;
};

/** 누구나 같은 YBM 주소 — 첫 화면 · 역전토익 페이지 · 그 후기 탭. 내 후기를 가리키지 않는다 */
const YBM_LIST_KEYS = new Set([site.academy.ybmHomeUrl, site.academy.ybmUrl, site.academy.ybmReviewUrl].map(addressKey));

/**
 * 학생이 붙여 넣은 후기 링크를 저장할 주소로 — **화면과 서버 액션이 같은 것을 쓴다**.
 * 주소 규칙은 수업자료실 링크와 같다(`normalizeLinkUrl` — https:// 붙이기 · http(s) 만 · 2,000자 = DB check).
 * 휴대폰 '공유' 로 복사하면 `[YBM] 수강후기 https://…` 처럼 글이 붙어 와서, 글 속의 첫 주소를 꺼낸다.
 * YBM 첫 화면 · 역전토익 후기 목록 주소는 받지 않는다 — 랜딩의 "후기 바로보기" 주소를 그대로 붙여 넣는 실수가 가장 쉽다.
 */
export function parseReviewLink(raw: string | null | undefined): { ok: true; url: string } | { ok: false; error: string } {
  const s = String(raw ?? "").trim();
  if (!s) return { ok: false, error: "YBM 수강후기 링크를 붙여 넣어 주세요." };
  const found = s.match(/https?:\/\/[^\s<>"']+/i)?.[0].replace(/[.,;:!?]+$/, "");
  const url = normalizeLinkUrl(found ?? s);
  if (!url) return { ok: false, error: "후기 링크를 확인해 주세요 — 내가 쓴 후기의 주소(https://…)를 그대로 붙여 넣어 주세요." };
  if (YBM_LIST_KEYS.has(addressKey(url))) {
    return { ok: false, error: "YBM 홈페이지 첫 화면이나 역전토익 후기 목록 주소예요. 내가 쓴 후기를 열고 그 주소를 붙여 넣어 주세요." };
  }
  return { ok: true, url };
}
