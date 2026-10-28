/**
 * 수강생 설문 (2026-10-28 Alan — OT 첫날 나눠 주던 종이 설문을 웹으로: "회원가입하고 등업신청하고 난 뒤에, 웹에서 바로 설문조사까지 마무리하고 싶어").
 *
 * Alan 이 정한 것: **등업 직후 바로 · 다 작성해야 진행 · 처음 한 번만 · 관리자 · 강사만 본다.** 질문은 종이 설문에서 가입 · 등업신청이 이미 받는 것
 * (이름 · 전화번호 · 학교 · 등록반 · 등록시간대)을 뺀 나머지다 — 신분 · 지금 점수와 목표 · 공부 이유 · 공부 이력 · 다음 달 수강 예정(들을 반은 클릭만) ·
 * 관리 방식(숙제 미제출 알림과 연동) · 수강 계기.
 *
 * **나이는 받지 않는다** (같은 날 Alan "나이는 개인정보보호법에 괜찮은거야? 만약 걸린다면 빼줘") — 이 설문은 다 써야 넘어가는데, 개인정보 보호법 제16조
 * 제3항은 필요한 최소한의 정보 밖의 것을 주지 않는다고 서비스를 막지 못하게 한다. 나이는 수업에 쓰이지 않는다. 같은 까닭으로 **직장명 · LC/RC 나눈 점수 ·
 * 소개해 준 지인 이름은 비워도 넘어간다** (지인 이름은 다른 사람의 정보다). 나머지는 다 답해야 넘어간다.
 *
 * 저장은 DB 한 줄(`student_surveys`, 마이그레이션 20261028110000) — 설문 답은 바뀌지 않고, 지금 점수 · 목표 점수(`now_*`)만 학생이 마이페이지에서 고친다.
 * 넣기는 DB 함수 `submit_student_survey` 하나로만 — 관리 방식을 숙제 미제출 알림 스위치(`homework_missing_optouts`)로 같은 트랜잭션에서 옮긴다.
 *
 * 이 파일은 **화면과 서버가 함께 쓴다** — 고르는 값 · 이름 · 글자 수 · 점수 규칙이 한곳이고, 같은 규칙이 DB check 에도 있다 (`student-survey.test.ts` 가 견준다).
 */

/** 설문 화면 — 수강생이 설문을 안 했으면 마이페이지의 다른 화면은 여기로 보낸다 (`SurveyGate`) */
export const SURVEY_PATH = "/my/survey";

/**
 * 설문 전에도 열리는 학생 화면 — 등업신청(이름 · 전화번호 확인 · 계정 합치기가 거기 있다) · 내 계정(합치기 확인) · 내 정보(이름 고치기) ·
 * **출석 찍기**(첫 수업에 설문 때문에 늦게 찍으면 지각이 된다 — 휴대폰 카메라로 찍는 `/attend` 는 처음부터 마이페이지 밖이다).
 */
const FREE_PREFIXES = ["/my/survey", "/my/verify", "/my/account", "/my/profile"];
const FREE_EXACT = ["/my/attendance"];

export function isSurveyFreePath(path: string | null | undefined): boolean {
  if (!path) return true;
  const clean = path.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  return FREE_EXACT.includes(clean) || FREE_PREFIXES.some((p) => clean === p || clean.startsWith(`${p}/`));
}

/* ─── 고르는 값 (DB check 와 같은 목록 — 바꾸면 마이그레이션도) ───────────────────── */

export const OCCUPATIONS = [
  { key: "student", label: "학생" },
  { key: "jobseeker", label: "취준생" },
  { key: "worker", label: "직장인" },
  { key: "leave", label: "휴학생" },
  { key: "other", label: "기타" },
] as const;
export type Occupation = (typeof OCCUPATIONS)[number]["key"];

/** 목표를 이룰 기간 — 6 은 "6개월 이상" */
export const GOAL_MONTHS = [1, 2, 3, 4, 5, 6] as const;
export const goalMonthsLabel = (n: number) => (n >= 6 ? "6개월 이상" : `${n}개월`);

/** 토익을 공부하는 이유 — 여러 개. 종이에 두 번 적힌 승진은 하나로 */
export const REASONS = [
  { key: "job", label: "취업" },
  { key: "promotion", label: "승진" },
  { key: "self", label: "자기계발" },
  { key: "transfer", label: "편입" },
  { key: "peet", label: "PEET" },
  { key: "katusa", label: "카투사" },
  { key: "other", label: "기타" },
] as const;

/**
 * 지금까지의 공부 — 종이의 "나의 최근 영어공부 상태" 와 "역전토익 수강 전 다른 강의를 수강한 적 있나요 · 어떤 학원의 무슨 수업" 을 한 질문으로 합쳤다
 * (2026-10-28 — 두 질문이 겹쳤다). 여러 개. `took` 을 고르면 어디서 무슨 수업을 들었는지 적는다. `first` 는 `took` 과 함께 고를 수 없다
 */
export const HISTORY = [
  { key: "quit", label: "중학교 때 이후로 영어를 놓았어요", took: false },
  { key: "break2y", label: "토익 공부를 쉰 지 2년이 넘었어요", took: false },
  { key: "basic", label: "토익 기초반을 들어 봤어요", took: true },
  { key: "c750", label: "토익 750반을 들어 봤어요", took: true },
  { key: "c850", label: "토익 850반을 들어 봤어요", took: true },
  { key: "first", label: "토익 수업은 처음이에요", took: false },
] as const;
export const HISTORY_TOOK = HISTORY.filter((h) => h.took).map((h) => h.key) as readonly string[];

export const NEXT_PLANS = [
  { key: "yes", label: "들을 거예요" },
  { key: "no", label: "안 들을 거예요" },
  { key: "unsure", label: "아직 모르겠어요" },
] as const;

/**
 * 숙제 관리 방식 — **숙제 미제출 알림 스위치와 같은 것이다** (2026-10-28 Alan "관리방식은 기존의 숙제알림을 받을 수 있는 시스템이랑 연동시켜주면 좋겠어").
 * 빡센 관리 = 알림 받기(켜짐), 알아서 = 알림 안 받기(꺼짐). 설문을 내는 순간 스위치가 그렇게 맞춰지고, 그 뒤에는 숙제제출 화면의 스위치로 바꾼다
 */
export const MANAGE_STYLES = [
  {
    key: "strict",
    title: "저는 안 시키면 안 해요",
    desc: "빡센 관리 부탁드려요. 숙제를 안 내면 선생님이 숙제 미제출 알림으로 챙겨 드려요.",
    alerts: true,
  },
  {
    key: "self",
    title: "제가 알아서 할게요",
    desc: "숙제는 제가 챙길게요. 숙제를 안 내도 숙제 미제출 알림을 보내지 않아요.",
    alerts: false,
  },
] as const;
export type ManageStyle = (typeof MANAGE_STYLES)[number]["key"];

/** 역전토익을 어떻게 알게 됐나 — 여러 개. 마케팅 분석의 수강 계기 차트가 이 이름으로 센다 */
export const SOURCES = [
  { key: "referral", label: "지인 소개" },
  { key: "naver", label: "네이버 검색" },
  { key: "blog", label: "블로그" },
  { key: "kin", label: "지식인" },
  { key: "cafe", label: "카페" },
  { key: "instagram", label: "인스타그램" },
  { key: "youtube", label: "유튜브" },
  { key: "ybm", label: "YBM 홈페이지" },
  { key: "visit", label: "학원 방문" },
  { key: "brochure", label: "학원 책자" },
  { key: "counsel", label: "강사 상담" },
  { key: "other", label: "기타" },
] as const;

/** 글자 수 상한 (DB check 와 같다) */
export const SURVEY_MAX = { workplace: 60, reasonOther: 40, historyWhere: 100, nextReason: 200, referrer: 20, story: 1000 } as const;
/** 수강 계기 이야기의 최소 글자 (DB check 와 같다) */
export const STORY_MIN = 2;

const keysOf = (list: readonly { key: string }[]) => list.map((o) => o.key) as readonly string[];
export const labelOf = (list: readonly { key: string; label?: string; title?: string }[], key: string) => {
  const o = list.find((x) => x.key === key);
  return o ? (o.label ?? o.title ?? key) : key;
};

/* ─── 점수 ───────────────────────────────────────────────────────────────── */

/** 토익 총점 — 10 ~ 990, 5점 단위. LC · RC 는 각각 5 ~ 495, 5점 단위 */
export const isToeicTotal = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 10 && (n as number) <= 990 && (n as number) % 5 === 0;
export const isToeicPart = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 5 && (n as number) <= 495 && (n as number) % 5 === 0;

export type ScoreInput = { total: number | null; lc: number | null; rc: number | null };

/** 지금 점수 한 묶음의 문제 — 없으면 null. 점수가 없으면(아직 시험 전) 셋 다 null 이다 */
export function scoreProblem({ total, lc, rc }: ScoreInput): string | null {
  if (total == null) return lc != null || rc != null ? "총점을 적어 주세요." : null;
  if (!isToeicTotal(total)) return "토익 점수는 10 ~ 990 사이 5점 단위예요.";
  if ((lc == null) !== (rc == null)) return "LC 와 RC 를 둘 다 적거나 둘 다 비워 주세요.";
  if (lc != null && rc != null) {
    if (!isToeicPart(lc) || !isToeicPart(rc)) return "LC · RC 는 5 ~ 495 사이 5점 단위예요.";
    if (lc + rc !== total) return `LC 와 RC 를 더하면 총점이 돼야 해요 (지금 ${lc + rc}점).`;
  }
  return null;
}

export const targetProblem = (n: number | null): string | null =>
  n == null ? "목표 점수를 적어 주세요." : isToeicTotal(n) ? null : "목표 점수는 10 ~ 990 사이 5점 단위예요.";

/** 입력칸의 글자 → 점수 (비었으면 null, 숫자가 아니면 NaN — 검사에서 걸린다) */
export function parseScore(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
  const s = String(v).replace(/[,\s]/g, "");
  if (s === "") return null;
  return /^\d+$/.test(s) ? Number(s) : NaN;
}

/* ─── 설문 한 벌 ─────────────────────────────────────────────────────────── */

/** 화면이 보내는 값 (서버 액션의 인자) */
export type SurveyInput = {
  occupation: string | null;
  workplace?: string | null;
  /** 토익을 본 적 있다 · 아직 없다 · 안 고름 */
  hasScore: boolean | null;
  scoreTotal?: number | string | null;
  scoreLc?: number | string | null;
  scoreRc?: number | string | null;
  target?: number | string | null;
  goalMonths: number | null;
  reasons: string[];
  reasonOther?: string | null;
  history: string[];
  historyWhere?: string | null;
  nextPlan: string | null;
  /** 들을 반 — 서버가 다음 달 시간표로 다시 풀어 이름을 붙인다 (`next-class` 서버 조각) */
  nextClass?: { courseId: number | null; kind?: string | null; track: string | null; timeBlock: string | null } | null;
  nextReason?: string | null;
  manage: string | null;
  sources: string[];
  referrer?: string | null;
  story?: string | null;
};

/** DB 한 줄의 설문 답 칸 (next_class · term · next 달은 서버가 붙인다) */
export type SurveyAnswers = {
  occupation: Occupation;
  workplace: string | null;
  score_total: number | null;
  score_lc: number | null;
  score_rc: number | null;
  target_score: number;
  goal_months: number;
  reasons: string[];
  reason_other: string | null;
  history: string[];
  history_where: string | null;
  next_plan: "yes" | "no" | "unsure";
  next_reason: string | null;
  manage_style: ManageStyle;
  sources: string[];
  referrer_name: string | null;
  source_story: string;
};

/** 질문 번호 — 화면이 그 질문으로 화면을 옮긴다 */
export type SurveyField = "occupation" | "score" | "target" | "reasons" | "history" | "next" | "manage" | "sources";

export type SurveyCheck = { ok: true; value: SurveyAnswers } | { ok: false; field: SurveyField; error: string };

/** 한 줄 글 — 앞뒤 빈칸을 떼고 줄바꿈을 빈칸으로 */
const line = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");
const uniq = (list: unknown, allowed: readonly string[]) =>
  Array.isArray(list) ? [...new Set(list.filter((x): x is string => typeof x === "string" && allowed.includes(x)))] : [];
const tooLong = (s: string, max: number) => [...s].length > max;

/**
 * 설문 한 벌을 검사한다 — **화면(넘어가기 전)과 서버(저장 전)가 같은 함수를 쓴다.** 순서는 화면의 질문 순서와 같아서,
 * 처음 걸린 질문으로 화면을 옮긴다. 다음 달에 들을 반은 여기서 보지 않는다 — 서버가 그 달 시간표로 따로 푼다 (`resolveNextClass`).
 */
export function checkSurvey(input: SurveyInput): SurveyCheck {
  const fail = (field: SurveyField, error: string): SurveyCheck => ({ ok: false, field, error });

  // 1. 신분
  const occupation = keysOf(OCCUPATIONS).includes(input.occupation ?? "") ? (input.occupation as Occupation) : null;
  if (!occupation) return fail("occupation", "지금 하고 있는 일을 골라 주세요.");
  const workplace = occupation === "worker" ? line(input.workplace) : "";
  if (tooLong(workplace, SURVEY_MAX.workplace)) return fail("occupation", `직장명은 ${SURVEY_MAX.workplace}자까지 적을 수 있어요.`);

  // 2. 지금 점수
  if (input.hasScore !== true && input.hasScore !== false) return fail("score", "토익 점수가 있는지 골라 주세요.");
  let score: ScoreInput = { total: null, lc: null, rc: null };
  if (input.hasScore) {
    score = { total: parseScore(input.scoreTotal), lc: parseScore(input.scoreLc), rc: parseScore(input.scoreRc) };
    if (score.total == null) return fail("score", "지금 토익 점수(총점)를 적어 주세요.");
    const problem = scoreProblem(score);
    if (problem) return fail("score", problem);
  }

  // 3. 목표 점수 · 기간
  const target = parseScore(input.target);
  const tp = targetProblem(target);
  if (tp) return fail("target", tp);
  const goalMonths = (GOAL_MONTHS as readonly number[]).includes(input.goalMonths ?? 0) ? input.goalMonths! : null;
  if (!goalMonths) return fail("target", "목표를 이룰 기간을 골라 주세요.");

  // 4. 공부 이유
  const reasons = uniq(input.reasons, keysOf(REASONS));
  if (reasons.length === 0) return fail("reasons", "토익을 공부하는 이유를 하나 이상 골라 주세요.");
  const reasonOther = reasons.includes("other") ? line(input.reasonOther) : "";
  if (reasons.includes("other") && !reasonOther) return fail("reasons", "기타 이유를 적어 주세요.");
  if (tooLong(reasonOther, SURVEY_MAX.reasonOther)) return fail("reasons", `기타 이유는 ${SURVEY_MAX.reasonOther}자까지 적을 수 있어요.`);

  // 5. 공부 이력
  const history = uniq(input.history, keysOf(HISTORY));
  if (history.length === 0) return fail("history", "지금까지의 공부를 하나 이상 골라 주세요.");
  const took = history.some((h) => HISTORY_TOOK.includes(h));
  if (took && history.includes("first")) return fail("history", "'토익 수업은 처음이에요' 와 '들어 봤어요' 는 함께 고를 수 없어요.");
  const historyWhere = took ? line(input.historyWhere) : "";
  if (took && !historyWhere) return fail("history", "어디서 무슨 수업을 들었는지 적어 주세요.");
  if (tooLong(historyWhere, SURVEY_MAX.historyWhere)) return fail("history", `수업 이름은 ${SURVEY_MAX.historyWhere}자까지 적을 수 있어요.`);

  // 6. 다음 달 수강 예정 (들을 반은 서버가 따로 본다)
  const nextPlan = keysOf(NEXT_PLANS).includes(input.nextPlan ?? "") ? (input.nextPlan as SurveyAnswers["next_plan"]) : null;
  if (!nextPlan) return fail("next", "다음 달에도 들을지 골라 주세요.");
  const nextReason = nextPlan === "no" ? line(input.nextReason) : "";
  if (nextPlan === "no" && !nextReason) return fail("next", "안 듣는 이유를 적어 주세요.");
  if (tooLong(nextReason, SURVEY_MAX.nextReason)) return fail("next", `이유는 ${SURVEY_MAX.nextReason}자까지 적을 수 있어요.`);

  // 7. 관리 방식
  const manage = keysOf(MANAGE_STYLES).includes(input.manage ?? "") ? (input.manage as ManageStyle) : null;
  if (!manage) return fail("manage", "숙제 관리 방식을 골라 주세요.");

  // 8. 수강 계기
  const sources = uniq(input.sources, keysOf(SOURCES));
  if (sources.length === 0) return fail("sources", "역전토익을 어떻게 알게 됐는지 하나 이상 골라 주세요.");
  const referrer = sources.includes("referral") ? line(input.referrer) : "";
  if (tooLong(referrer, SURVEY_MAX.referrer)) return fail("sources", `지인 이름은 ${SURVEY_MAX.referrer}자까지 적을 수 있어요.`);
  const story = typeof input.story === "string" ? input.story.trim() : "";
  if ([...story].length < STORY_MIN) return fail("sources", "어떻게 알고 오게 됐는지 적어 주세요.");
  if (tooLong(story, SURVEY_MAX.story)) return fail("sources", `수강 계기는 ${SURVEY_MAX.story}자까지 적을 수 있어요.`);

  return {
    ok: true,
    value: {
      occupation,
      workplace: workplace || null,
      score_total: score.total,
      score_lc: score.lc,
      score_rc: score.rc,
      target_score: target!,
      goal_months: goalMonths,
      // 고른 순서가 아니라 목록 순서로 — 같은 답이면 같은 줄이 된다
      reasons: keysOf(REASONS).filter((k) => reasons.includes(k)),
      reason_other: reasonOther || null,
      history: keysOf(HISTORY).filter((k) => history.includes(k)),
      history_where: historyWhere || null,
      next_plan: nextPlan,
      next_reason: nextReason || null,
      manage_style: manage,
      sources: keysOf(SOURCES).filter((k) => sources.includes(k)),
      referrer_name: referrer || null,
      source_story: story,
    },
  };
}

/* ─── 보여 주기 ───────────────────────────────────────────────────────────── */

/** 점수 한 줄 — `650점 (LC 330 · RC 320)` · 없으면 `아직 없음` */
export function scoreLine(total: number | null | undefined, lc?: number | null, rc?: number | null): string {
  if (total == null) return "아직 없음";
  return lc != null && rc != null ? `${total}점 (LC ${lc} · RC ${rc})` : `${total}점`;
}

/** 목표까지 남은 점수 — 넘었으면 0, 지금 점수가 없으면 null */
export const pointsToGo = (now: number | null | undefined, target: number) => (now == null ? null : Math.max(0, target - now));

/** 막대 길이 (0 ~ 100) — 지금 ÷ 목표 */
export const goalPercent = (now: number | null | undefined, target: number) =>
  now == null || target <= 0 ? 0 : Math.max(0, Math.min(100, Math.round((now / target) * 100)));

/** 다음 달(학생이 듣는 마지막 달의 다음 달) 이름 — `12월` · 해가 바뀌면 `2027년 1월` */
export function nextMonthLabel(next: { y: number; m: number }, today: string): string {
  const year = Number(today.slice(0, 4));
  return next.y === year ? `${next.m}월` : `${next.y}년 ${next.m}월`;
}
