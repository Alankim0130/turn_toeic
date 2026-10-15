import { CLASS_MATERIAL_LINK_URL_MAX, normalizeLinkUrl } from "@/lib/class-materials";
import { isSubject, SUBJECT_LABEL, type Subject } from "@/lib/instructor-subject";
import { isContainerProgram } from "@/lib/two-week";
import { lectureKindRank, lectureKindSubject, lectureKindLabel, sortLectureKinds } from "@/lib/utils";

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
 * 이혜영 LC특강(현강 · 녹화영상) = 헤드폰 건 노트 컷, 모의고사(현강 · 시험지 수령)면 윙크 가리키기 · 이영수 RC특강 = 태블릿 설명 컷, 모의고사면 엄지척.
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
  // 녹화영상 신청도 그 과목 특강이다 (2026-10-15 — rc_video · lc_video)
  const k = new Set((kinds ?? []).map(lectureKindSubject));
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

/** "RC특강 (녹화영상신청) — 파트5 집중" — 2026-10-15 부터 특강 하나에 종류 하나 (그 전 특강은 마이그레이션이 나눴다) */
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
 * **신청 조건 — 강사가 특강마다 고른다** (2026-10-15 Alan — "특강마다 신청조건을 선택할 수 있으면 좋겠어. 1. 수업후기작성 2. 이미지참고 3. 조건없음").
 * - `review` — YBM 수강후기 링크를 올려야 신청된다 (2026-10-08 의 3주차 모의고사 조건 — 그때는 날짜로 저절로 정했고, 있던 특강은 마이그레이션 20261015130000 이 그 규칙대로 채웠다).
 * - `sns` — **역전토익 유튜브 구독 · 인스타그램 팔로우** (Alan 이 보낸 그림 — "댓글달기전 1) 역전토익 유튜브 구독을 눌러주세요 2) 역전토익 인스타그램을 팔로우 해주세요
 *   (기존 팔로우는 "기존"으로 표기 해주세요)"). 학생이 유튜브 구독을 체크하고 인스타그램 새로 팔로우 · 기존 팔로우 중 하나를 골라야 신청된다 — 이 사이트가 확인할 길은 없어
 *   학생이 한 것을 믿는다 (그림의 댓글 신청과 같다). 새로 · 기존만 `lecture_signups.sns_follow` 에 남는다. 그림의 `번호/이름/수강반` 댓글은 신청 자체가 대신한다.
 * - `none` — 조건 없음. **새로 만드는 특강은 조건 없음으로 시작한다** — 3주차라고 저절로 후기 조건이 걸리지 않는다.
 * DB check `special_lectures_signup_condition_check` · 신청 트리거 `private.lecture_signups_review_check` 와 같은 값 — 바꾸면 둘 다 (lecture.test.ts 가 SQL 도 본다).
 */
export const LECTURE_CONDITIONS = [
  { value: "review", label: "YBM 수강후기 작성", short: "후기 작성", hint: "학생이 YBM 홈페이지에 쓴 수강후기 링크를 올려야 신청돼요." },
  { value: "sns", label: "유튜브 구독 · 인스타그램 팔로우", short: "구독 · 팔로우", hint: "학생이 역전토익 유튜브 구독 · 인스타그램 팔로우(새로 · 기존)를 체크해야 신청돼요." },
  { value: "none", label: "조건 없음", short: "조건 없음", hint: "누르기만 하면 신청돼요." },
] as const;
export type LectureCondition = (typeof LECTURE_CONDITIONS)[number]["value"];
export const isLectureCondition = (v: unknown): v is LectureCondition =>
  typeof v === "string" && LECTURE_CONDITIONS.some((c) => c.value === v);
/** 모르는 값(옛 화면 · 배포 사이)은 조건 없음으로 본다 — 막는 것은 DB 트리거다 */
export const lectureCondition = (v: unknown): LectureCondition => (isLectureCondition(v) ? v : "none");
export const lectureConditionLabel = (v: unknown) => LECTURE_CONDITIONS.find((c) => c.value === lectureCondition(v))!.label;

/** 인스타그램 팔로우 — 새로 · 기존 (그림의 "기존 팔로우는 기존으로 표기") */
export const SNS_FOLLOWS = [
  { value: "new", label: "새로 팔로우했어요", short: "새로 팔로우" },
  { value: "existing", label: "원래 팔로우하고 있었어요 (기존)", short: "기존 팔로우" },
] as const;
export type SnsFollow = (typeof SNS_FOLLOWS)[number]["value"];
export const isSnsFollow = (v: unknown): v is SnsFollow => typeof v === "string" && SNS_FOLLOWS.some((f) => f.value === v);
export const snsFollowShort = (v: string | null | undefined) => SNS_FOLLOWS.find((f) => f.value === v)?.short ?? null;

/** 신청을 넣을 때 DB 가 낸 `sns_follow_required` → 학생에게 보일 말. 다른 오류면 null */
export function snsFollowError(message: string | null | undefined): string | null {
  if (message === "sns_follow_required") return "역전토익 유튜브 구독과 인스타그램 팔로우를 하고, 아래에서 체크한 뒤 신청해 주세요.";
  return null;
}

/** 같은 날 특강 순서 — 날짜 → 종류(RC 현강 · 녹화 · LC … · 2차 시험지) → 먼저 만든 것. 학생 · 관리자 특강 신청이 함께 쓴다 */
export function sortLectures<T extends { id: number; date: string; kinds: readonly string[] | null }>(list: readonly T[]): T[] {
  return [...list].sort((a, b) => a.date.localeCompare(b.date) || lectureKindRank(a.kinds) - lectureKindRank(b.kinds) || a.id - b.id);
}

/**
 * 반 편성 달력의 특강 붓 — 날짜를 누르면 **고른 종류마다 특강을 하나씩** 만든다 (2026-10-15 — 특강 하나 = 종류 하나).
 * 고른 종류가 그 날 · 그 강사 · 그 내용으로 이미 다 있으면 다시 누른 것이라 **모두 뺀다** (예전 "같은 특강을 다시 누르면 빠져요").
 * 일부만 있으면 없는 것만 더한다. 종류를 안 골랐으면 내용만 있는 특강 하나다.
 */
export function brushLectures<T extends { date: string; lecturerId: number; content: string; kinds: string[] }>(
  lectures: readonly T[],
  brush: { date: string; lecturerId: number; content: string; kinds: readonly string[] },
  make: (kinds: string[]) => T,
): { lectures: T[]; added: number; removed: number } {
  const content = brush.content.trim();
  const targets: string[][] = brush.kinds.length > 0 ? sortLectureKinds([...brush.kinds]).map((k) => [k]) : [[]];
  const same = (l: T, kinds: string[]) =>
    l.date === brush.date && l.lecturerId === brush.lecturerId && l.content.trim() === content && sortLectureKinds(l.kinds).join("+") === kinds.join("+");
  const missing = targets.filter((kinds) => !lectures.some((l) => same(l, kinds)));
  if (missing.length === 0) {
    const next = lectures.filter((l) => !targets.some((kinds) => same(l, kinds)));
    return { lectures: next, added: 0, removed: lectures.length - next.length };
  }
  return { lectures: [...lectures, ...missing.map((kinds) => make(kinds))], added: missing.length, removed: 0 };
}

/**
 * **YBM 수강후기 링크의 꼴** (2026-10-08 Alan 이 7월 3주차 모의고사 특강 때 학생들이 올린 링크 화면을 보내 줬다 — 일곱 개가 전부
 * `https://www.ybmedu.com/mypage/lessonView/<토큰>`). ybmedu.com(www. · m. 같은 앞자리 포함)의 경로 끝이 `lessonView/<토큰>` 이고
 * 뒤에 ? # / 꼬리만 붙을 수 있다. 앞의 경로(`/mypage/`)는 정하지 않는다 — 앱 화면에서 열면 앞자리가 다를 수 있다. 대소문자는 가리지 않는다.
 * DB check `lecture_signups_review_url_check`(마이그레이션 20261008110000)와 같은 정규식 — 바꾸면 둘 다 (lecture.test.ts 가 두 정규식에 같은 주소를 넣어 본다).
 */
export const YBM_REVIEW_LINK_RE = /^https?:\/\/([a-z0-9-]+\.)*ybmedu\.com\/([^\s?#]*\/)?lessonview\/[a-z0-9_=-]{10,}([/?#]\S*)?$/i;

/** YBM 수강후기 링크 꼴인가 — 강사 화면이 아닌 것(꼴을 좁히기 전에 들어온 신청)에 표시를 붙인다 */
export const isYbmReviewUrl = (url: string) => url.length <= CLASS_MATERIAL_LINK_URL_MAX && YBM_REVIEW_LINK_RE.test(url);

/** 주소 모양을 알려 주는 말 — 학생 칸 · 안내 · 오류에 같은 꼴을 적는다 */
export const YBM_REVIEW_LINK_HINT = "https://www.ybmedu.com/mypage/lessonView/…";

/**
 * 학생이 붙여 넣은 후기 링크를 저장할 주소로 — **화면과 서버 액션이 같은 것을 쓴다**.
 * 먼저 수업자료실 링크와 같은 규칙으로 정리하고(`normalizeLinkUrl` — https:// 붙이기 · http(s) 만 · 2,000자),
 * **YBM 수강후기 링크 꼴(`YBM_REVIEW_LINK_RE`)만 받는다** — YBM 첫 화면 · 역전토익 후기 목록 · 다른 사이트 주소는 돌려보낸다.
 * 글이 붙어 와도 글 속의 첫 주소를 꺼낸다 — 7월에는 학생들이 `번호/이름/반/주소` 로 올렸고, 휴대폰 '공유' 도 제목을 붙여 온다.
 */
export function parseReviewLink(raw: string | null | undefined): { ok: true; url: string } | { ok: false; error: string } {
  const s = String(raw ?? "").trim();
  if (!s) return { ok: false, error: "YBM 수강후기 링크를 붙여 넣어 주세요." };
  const found = s.match(/https?:\/\/[^\s<>"']+/i)?.[0].replace(/[.,;:!?]+$/, "");
  const url = normalizeLinkUrl(found ?? s);
  if (!url || !isYbmReviewUrl(url)) {
    return { ok: false, error: `YBM 수강후기 링크가 아니에요. 마이페이지에서 내가 쓴 후기를 열고 그 주소(${YBM_REVIEW_LINK_HINT})를 붙여 넣어 주세요.` };
  }
  return { ok: true, url };
}

/**
 * **후기 한 편을 가리키는 키** — `lessonView/` 뒤 토큰(첫 번째)을 소문자로, 끝의 `=` 는 뗀다. 토큰이 없으면 null.
 * 같은 키 = 같은 후기다 — 주소 앞자리(www. · m.) · `?` `#` 꼬리 · 대소문자가 달라도 같은 후기로 본다.
 * **후기 링크는 한 번만 쓴다** (2026-10-08 Alan — "다른학생 링크를 넣은건지도 파악가능할까?" → "후기막기 진행해주고"):
 * 신청을 넣을 때 DB 트리거(`private.lecture_signups_review_check`, 마이그레이션 20261008130000)가 이 키로 견주어
 * 다른 학생이 쓴 링크(`review_link_taken`) · 다른 달 특강에 쓴 내 링크(`review_link_reused`)를 막는다.
 * DB `private.review_link_key` 와 같은 규칙 — 바꾸면 둘 다 (lecture.test.ts 가 SQL 의 정규식으로 같은 답을 내는지 본다).
 */
export function reviewLinkKey(url: string | null | undefined): string | null {
  const token = String(url ?? "").match(/lessonview\/([a-z0-9_=-]{10,})/i)?.[1];
  return token?.replace(/=+$/, "").toLowerCase() || null;
}

/** 신청을 넣을 때 DB 가 낸 후기 링크 오류 → 학생에게 보일 말. 다른 오류면 null */
export function reviewLinkError(message: string | null | undefined): string | null {
  if (message === "review_link_required") return "이 특강은 YBM 수강후기를 쓰고 그 링크를 올려야 신청할 수 있어요.";
  if (message === "review_link_taken") return "이미 다른 학생이 신청에 쓴 후기 링크예요. 내가 쓴 후기의 링크를 올려 주세요 — 내 후기가 맞다면 선생님께 말씀해 주세요.";
  if (message === "review_link_reused") return "예전 달 특강 신청에 쓴 후기 링크예요. 이번 달 후기를 새로 써서 그 링크를 올려 주세요.";
  return null;
}

/**
 * **단과 학생은 제 과목 특강만** (2026-10-12 Alan — "특강신청에서 RC 단과반은 LC특강신청이 안되고, LC단과는 RC특강신청이 안되도록 설정이 되어야해").
 *
 * 반 하나가 주는 과목 — 단과 상품(`courses.course_type` lc · rc) = 그 과목 · 그릇 반(속성반 · 2주완성 — 품은 반이 두 과목) · **과목 칸이 빈 반**
 * (묶음 120 · 140분 · 방학달 통짜 — 두 과목을 이어 듣는다. 아직 안 고른 반도 짐작해 막지 않는다) = 두 과목 · 시간 단위 반 = 그 반의 과목 칸(`class_sections.subject`).
 * 학생명단 이름표 `RC단과` · `LC단과`(`singleSubjectOf`, section-type.ts)와 같은 읽기다. 반이 여럿이면 합집합 — 650 RC 단과 + 750 LC 단과면 두 과목 다.
 * DB `private.lecture_subjects_of`(마이그레이션 20261012110000 — 신청을 넣을 때 트리거 `lecture_signups_eligible_subject` 가 막는다)와 같은 규칙 — 바꾸면 둘 다 (lecture.test.ts 가 SQL 도 본다).
 */
export function sectionSubjects(s: { subject?: string | null; course?: { course_type?: string | null; program?: string | null } | null }): Subject[] {
  const type = s.course?.course_type;
  if (isSubject(type)) return [type];
  if (isContainerProgram(s.course?.program)) return ["lc", "rc"];
  return isSubject(s.subject) ? [s.subject] : ["lc", "rc"];
}

/**
 * 특강 종류(kinds) 중 내가 듣지 않는 과목 — 비어 있으면 신청할 수 있다. 모의고사(현강 · 시험지 수령)는 늘 비고(누구나), RC특강 · LC특강은
 * 현강이든 녹화영상이든 그 과목을 들어야 한다. 내 과목을 모르면(빈 집합 — 그 달 수강생이 아님) 막지 않는다 — DB 도 그때는 정책(lecture_signup_open)이 막는다.
 */
export function lectureSubjectBlock(kinds: readonly string[] | null | undefined, mine: ReadonlySet<string>): Subject[] {
  if (mine.size === 0) return [];
  // 녹화영상 신청도 그 과목이다 (2026-10-15 — rc_video = RC · lc_video = LC). 종류마다 과목은 lectureKindSubject 한곳
  const subjects = new Set((kinds ?? []).map(lectureKindSubject).filter((s): s is Subject => s !== null && !mine.has(s)));
  return [...subjects];
}

/** 막힌 특강 카드에 적는 말 — "RC 단과 수강생은 LC특강을 신청할 수 없어요" */
export function lectureSubjectNote(blocked: readonly Subject[], mine: ReadonlySet<string>): string {
  const me = [...mine].filter(isSubject).map((s) => SUBJECT_LABEL[s]).join(" · ");
  const kinds = (["rc", "lc"] as const).filter((s) => blocked.includes(s)).map((s) => `${SUBJECT_LABEL[s]}특강`).join(" · ");
  return `${me} 단과 수강생은 ${kinds}을 신청할 수 없어요.`;
}

/** 신청을 넣을 때 DB 트리거가 낸 `lecture_subject_mismatch` → 학생에게 보일 말 (주소를 직접 불러 넣는 길도 같은 규칙이다) */
export const LECTURE_SUBJECT_ERROR = "내 수업 과목이 아닌 특강이에요. RC 단과는 RC 특강, LC 단과는 LC 특강만 신청할 수 있어요.";
