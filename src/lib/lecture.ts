import { CLASS_MATERIAL_LINK_URL_MAX, normalizeLinkUrl } from "@/lib/class-materials";
import { isSubject, SUBJECT_LABEL, type Subject } from "@/lib/instructor-subject";
import { isContainerProgram } from "@/lib/two-week";
import { lectureKindRank, lectureKindSubject, lectureKindLabel, sortLectureKinds } from "@/lib/utils";

/** 특강의 신청 방식 줄 (`special_lecture_ways` — 2026-10-16). 받기 · 조건 · 정원은 강사가 특강 신청 → 특강 설정에서 고른다 */
export type LectureWayRow = {
  way: string;
  enabled: boolean;
  capacity: number | null;
  signup_condition: string;
  applied_count: number;
};

export type LectureState = "none" | "open" | "full" | "closed";

/** 이 방식의 정원이 찼나 */
export const wayFull = (w: Pick<LectureWayRow, "capacity" | "applied_count">) => w.capacity !== null && w.applied_count >= w.capacity;
/** 남은 자리. 정원이 없으면 null */
export const seatsLeft = (w: Pick<LectureWayRow, "capacity" | "applied_count">) =>
  w.capacity === null ? null : Math.max(0, w.capacity - w.applied_count);

/**
 * 특강 신청 상태 — DB `private.lecture_signup_open` · `private.lecture_way_open` 과 같은 규칙.
 * **강사가 '신청 받기' 를 누른 특강(signup)만, 특강 당일까지** (2026-10-16 Alan — "지금은 7일전부터 오픈인데 이 기능을 없애고 강사가 직접 '신청받기' 버튼을
 * 누르면 바로 오픈되면서 신청을 받을 수 있도록"). 2026-10-02 ~ 10-16 의 7일 전 자정 자동 열림 · 신청 시작 시각은 없앴다.
 * - `none` — 신청 받기 전(받는 방식이 하나도 없어도). 학생 특강 신청 화면에 서지 않는다 (반 편성 달력 · 내 시간표에는 선다)
 * - `open` — 신청 받는 중 · `full` — 받는 방식이 모두 정원이 찼다 · `closed` — 특강 날이 지났다
 * 화면 안내일 뿐 실제 판단은 RLS · 트리거가 한다.
 */
export function lectureState(l: { date: string; signup: boolean }, ways: readonly LectureWayRow[], todayKst: string): LectureState {
  if (todayKst > l.date) return "closed";
  const open = ways.filter((w) => w.enabled);
  if (!l.signup || open.length === 0) return "none";
  return open.every(wayFull) ? "full" : "open";
}

/** 학생 특강 신청 화면에 세우나 — 신청 받는 중(정원 마감 포함)인 특강만. 그 밖(신청 받기 전 · 지난 특강)은 내가 신청한 것만 기록으로 선다 */
export const lectureListed = (l: { date: string; signup: boolean; ways: readonly LectureWayRow[] }, todayKst: string) => {
  const state = lectureState(l, l.ways, todayKst);
  return state === "open" || state === "full";
};

/** D-day 표기 — 다시보기 종강 띠가 쓴다 */
export const ddayLabel = (dday: number) => (dday === 0 ? "D-DAY" : `D-${dday}`);

/**
 * 특강 카드의 강사 캐리커처와 한마디 (2026-10-02 Alan "강사에 맞춰서 케릭커쳐도 같이 웃기게"). 자세는 무슨 특강인가를 따른다 —
 * 이혜영 LC특강 = 헤드폰 건 노트 컷, 모의고사면 윙크 가리키기 · 이영수 RC특강 = 태블릿 설명 컷, 모의고사면 엄지척.
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
  none: "신청 받기 전",
  open: "신청 받는 중",
  full: "정원 마감",
  closed: "신청 마감",
};

export const LECTURE_STATE_CLASS: Record<LectureState, string> = {
  none: "bg-violet-100 text-violet-800",
  open: "bg-brand-100 text-brand-700",
  full: "bg-amber-100 text-amber-800",
  closed: "bg-line text-slate",
};

/** "1차 모의고사 — 오후 2시" — 무슨 특강(없으면 메모만) */
export function lectureTitle(l: { kinds: string[] | null; content: string | null }) {
  const kinds = sortLectureKinds(l.kinds ?? []).map(lectureKindLabel);
  const memo = l.content?.trim();
  if (kinds.length === 0) return memo || "특강";
  return memo ? `${kinds.join(" · ")} — ${memo}` : kinds.join(" · ");
}

/**
 * **신청 조건 — 강사가 신청 방식마다 고른다** (2026-10-15 Alan — "특강마다 신청조건을 선택할 수 있으면 좋겠어. 1. 수업후기작성 2. 이미지참고 3. 조건없음"
 * → 2026-10-16 방식마다 — `special_lecture_ways.signup_condition`. 현장은 후기 · 시험지 수령은 구독 · 팔로우처럼 고른다).
 * - `review` — YBM 수강후기 링크를 올려야 신청된다 (2026-10-08 의 3주차 모의고사 조건 — 그때는 날짜로 저절로 정했고, 있던 특강은 마이그레이션 20261015130000 이 그 규칙대로 채웠다).
 * - `sns` — **역전토익 유튜브 구독 · 인스타그램 팔로우** (Alan 이 보낸 그림 — "댓글달기전 1) 역전토익 유튜브 구독을 눌러주세요 2) 역전토익 인스타그램을 팔로우 해주세요
 *   (기존 팔로우는 "기존"으로 표기 해주세요)"). 학생이 유튜브 구독을 체크하고 인스타그램 새로 팔로우 · 기존 팔로우 중 하나를 골라야 신청된다 — 이 사이트가 확인할 길은 없어
 *   학생이 한 것을 믿는다 (그림의 댓글 신청과 같다). 새로 · 기존만 `lecture_signups.sns_follow` 에 남는다. 그림의 `번호/이름/수강반` 댓글은 신청 자체가 대신한다.
 * - `none` — 조건 없음. **새로 만드는 특강은 조건 없음으로 시작한다** — 3주차라고 저절로 후기 조건이 걸리지 않는다.
 * DB check `special_lecture_ways_condition_check` · 신청 트리거 `private.lecture_signups_review_check` 와 같은 값 — 바꾸면 둘 다 (lecture.test.ts 가 SQL 도 본다).
 * `hint` 는 강사 화면(특강 설정), `student` 는 학생이 방식을 고르면 뜨는 조건 상자의 말이다.
 */
export const LECTURE_CONDITIONS = [
  {
    value: "review",
    label: "YBM 수강후기 작성",
    short: "후기 작성",
    hint: "학생이 YBM 홈페이지에 쓴 수강후기 링크를 올려야 신청돼요.",
    student: "YBM 홈페이지에 수강후기를 쓰고, 그 후기의 링크를 아래 칸에 붙여 넣어 주세요.",
  },
  {
    value: "sns",
    label: "유튜브 구독 · 인스타그램 팔로우",
    short: "구독 · 팔로우",
    hint: "학생이 역전토익 유튜브 구독 · 인스타그램 팔로우(새로 · 기존)를 체크해야 신청돼요.",
    student: "역전토익 유튜브를 구독하고 인스타그램을 팔로우한 뒤, 아래에서 체크해 주세요.",
  },
  { value: "none", label: "조건 없음", short: "조건 없음", hint: "누르기만 하면 신청돼요.", student: "따로 할 일이 없어요. 바로 신청할 수 있어요." },
] as const;
export type LectureCondition = (typeof LECTURE_CONDITIONS)[number]["value"];
export const isLectureCondition = (v: unknown): v is LectureCondition =>
  typeof v === "string" && LECTURE_CONDITIONS.some((c) => c.value === v);
/** 모르는 값(옛 화면 · 배포 사이)은 조건 없음으로 본다 — 막는 것은 DB 트리거다 */
export const lectureCondition = (v: unknown): LectureCondition => (isLectureCondition(v) ? v : "none");
export const lectureConditionLabel = (v: unknown) => LECTURE_CONDITIONS.find((c) => c.value === lectureCondition(v))!.label;
export const lectureConditionOf = (v: unknown) => LECTURE_CONDITIONS.find((c) => c.value === lectureCondition(v))!;

/** 조건이 있는 방식을 고르면 신청하기 버튼 위에 뜨는 안내 (2026-10-16 Alan "단, 조건을 이수완료하고 신청하기를 눌러달라는 안내문") */
export const LECTURE_CONDITION_NOTICE = "신청 조건을 다 마친 뒤에 신청하기를 눌러 주세요.";

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

/** 같은 날 특강 순서 — 날짜 → 무슨 특강(RC · LC · 1차 · 2차 · 메모만) → 먼저 만든 것. 학생 · 관리자 특강 신청이 함께 쓴다 */
export function sortLectures<T extends { id: number; date: string; kinds: readonly string[] | null }>(list: readonly T[]): T[] {
  return [...list].sort((a, b) => a.date.localeCompare(b.date) || lectureKindRank(a.kinds) - lectureKindRank(b.kinds) || a.id - b.id);
}

/** 특강을 가리는 값 — 날 · 강사 · 종류 · 내용 (id 는 DB 의 것, 화면에서 막 만든 특강은 null) */
export type LectureIdentity = { id: number | null; date: string; lecturerId: number; content: string; kinds: readonly string[] };
const lectureIdentity = (l: LectureIdentity) => `${l.date}|${l.lecturerId}|${sortLectureKinds([...l.kinds]).join("+")}|${l.content.trim()}`;

/**
 * id 가 빠진 특강에 **같은 특강의 저장된 id** 를 되살린다 (2026-10-16 점검).
 * 반 편성 달력에서 특강을 눌러 뺐다가 다시 누르면 화면은 그대로인데 id 없는 새 특강이 되고, 막 만든 특강도 저장한 뒤 화면의 id 가 비어 있었다.
 * 그대로 저장하면 DB(`save_term_schedule`)가 원래 특강을 지우고 새로 만들어 신청 받기 · 신청 방식 · 정원 · 신청 조건 · 안내가 처음으로 돌아간다
 * (신청자가 있으면 "신청자가 있는 특강은 뺄 수 없어요" 로 막힌다). 그래서 날 · 강사 · 종류 · 내용이 같고 목록에서 아직 안 쓰는 저장된 특강의 id 를 준다 —
 * 저장된 특강 하나는 한 번만. 바뀐 것이 없으면 받은 목록을 그대로 돌려준다. 서버 액션(`saveTermSchedule`)과 달력 화면이 함께 쓴다.
 */
export function restoreLectureIds<T extends LectureIdentity>(list: T[], saved: readonly LectureIdentity[]): T[] {
  if (!list.some((l) => l.id === null)) return list;
  const used = new Set(list.flatMap((l) => (l.id === null ? [] : [l.id])));
  const spare = saved.filter((s): s is LectureIdentity & { id: number } => s.id !== null && !used.has(s.id));
  if (spare.length === 0) return list;
  let changed = false;
  const out = list.map((l) => {
    if (l.id !== null) return l;
    const key = lectureIdentity(l);
    const i = spare.findIndex((s) => lectureIdentity(s) === key);
    if (i < 0) return l;
    const [match] = spare.splice(i, 1);
    changed = true;
    return { ...l, id: match.id };
  });
  return changed ? out : list;
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
 * 무슨 특강(kinds) 중 내가 듣지 않는 과목 — 비어 있으면 신청할 수 있다. 모의고사는 늘 비고(누구나), RC특강 · LC특강은
 * 현장이든 수업영상 받기든 그 과목을 들어야 한다. 내 과목을 모르면(빈 집합 — 그 달 수강생이 아님) 막지 않는다 — DB 도 그때는 정책(lecture_signup_open)이 막는다.
 */
export function lectureSubjectBlock(kinds: readonly string[] | null | undefined, mine: ReadonlySet<string>): Subject[] {
  if (mine.size === 0) return [];
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
