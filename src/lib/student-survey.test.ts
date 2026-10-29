import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  checkSurvey,
  goalMonthsLabel,
  goalPercent,
  HISTORY,
  isSurveyFreePath,
  MANAGE_STYLES,
  NEXT_PLANS,
  nextMonthLabel,
  OCCUPATIONS,
  parseScore,
  pointsToGo,
  REASONS,
  scoreLine,
  scoreProblem,
  SOURCES,
  STORY_MIN,
  SURVEY_MAX,
  targetProblem,
  type SurveyInput,
} from "./student-survey";
import type { EnrollSection } from "./enroll-options";
import { nextClassSections, nextMonthOf, resolveNextClass } from "@/app/my/survey/_lib/next-class";

/**
 * 수강생 설문 (2026-10-28 Alan — "등업직후 바로 진행. 다 작성해야지 진행할 수 있도록 해줘. 설문조사는 처음 한번만 진행. 볼 수 있는사람은 관리자, 강사만").
 * 규칙 함수(화면과 서버가 함께 쓴다)와 **마이그레이션의 check · 정책 · 함수 모양**을 같이 본다 — 한쪽만 고치면 화면은 넘어가는데 저장이 막히거나,
 * 막아야 할 사람(조교)에게 학생 답이 열린다.
 */

const read = (f: string) => readFileSync(f, "utf8");
const DIR = "supabase/migrations";
const FILES = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
const stripComments = (sql: string) =>
  sql
    .split("\n")
    .map((l) => (l.trim().startsWith("--") ? "" : l))
    .join("\n");
const flat = (s: string) => s.replace(/\s+/g, " ").trim();
const SURVEY_SQL = flat(stripComments(read(join(DIR, "20261028110000_student_survey.sql"))));

/** 다 채운 설문 — 테스트마다 한 칸씩 바꾼다 */
const FULL: SurveyInput = {
  occupation: "worker",
  workplace: "  부산 어느 회사 ",
  hasScore: true,
  scoreTotal: "650",
  scoreLc: "330",
  scoreRc: "320",
  target: "850",
  goalMonths: 3,
  reasons: ["promotion", "job", "job"],
  reasonOther: "적어도 버린다",
  history: ["c750", "break2y"],
  historyWhere: " 다른 학원 750반 ",
  nextPlan: "yes",
  nextClass: { courseId: 1, kind: "full", track: "week5", timeBlock: "10:00~12:10" },
  nextReason: "버린다",
  manage: "strict",
  sources: ["naver", "referral"],
  referrer: " 김 ",
  story: "  네이버에서 서면 토익을 찾다가 왔어요  ",
};

describe("checkSurvey — 다 써야 넘어간다 (화면 · 서버 같은 함수)", () => {
  it("다 채우면 통과 — 고른 것은 목록 순서로, 쓸 필요 없는 칸은 버린다", () => {
    const r = checkSurvey(FULL);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toEqual({
      occupation: "worker",
      workplace: "부산 어느 회사",
      score_total: 650,
      score_lc: 330,
      score_rc: 320,
      target_score: 850,
      goal_months: 3,
      reasons: ["job", "promotion"],
      reason_other: null,
      history: ["break2y", "c750"],
      history_where: "다른 학원 750반",
      next_plan: "yes",
      next_reason: null,
      manage_style: "strict",
      sources: ["referral", "naver"],
      referrer_name: "김",
      source_story: "네이버에서 서면 토익을 찾다가 왔어요",
    });
  });

  it("직장명 · LC/RC · 소개해 준 분 이름은 비워도 넘어간다 (개인정보 보호법 제16조 제3항 — 필요 최소한 밖은 선택)", () => {
    const r = checkSurvey({ ...FULL, workplace: "", scoreLc: "", scoreRc: "", referrer: "" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.workplace).toBeNull();
      expect(r.value.score_lc).toBeNull();
      expect(r.value.referrer_name).toBeNull();
    }
  });

  it("직장인이 아니면 직장명을 버리고, 지인 소개가 아니면 이름을 버린다", () => {
    const r = checkSurvey({ ...FULL, occupation: "student", sources: ["naver"] });
    expect(r.ok && r.value.workplace).toBeNull();
    expect(r.ok && r.value.referrer_name).toBeNull();
  });

  it.each<[string, Partial<SurveyInput>, string, string]>([
    ["신분 없음", { occupation: null }, "occupation", "지금 하고 있는 일을 골라 주세요."],
    ["모르는 신분", { occupation: "ceo" }, "occupation", "지금 하고 있는 일을 골라 주세요."],
    ["점수 유무 안 고름", { hasScore: null }, "score", "토익 점수가 있는지 골라 주세요."],
    ["점수 있는데 총점 없음", { scoreTotal: "", scoreLc: "", scoreRc: "" }, "score", "지금 토익 점수(총점)를 적어 주세요."],
    ["5점 단위 아님", { scoreTotal: "652", scoreLc: "", scoreRc: "" }, "score", "토익 점수는 10 ~ 990 사이 5점 단위예요."],
    ["LC 만", { scoreRc: "" }, "score", "LC 와 RC 를 둘 다 적거나 둘 다 비워 주세요."],
    ["합이 다름", { scoreLc: "300" }, "score", "LC 와 RC 를 더하면 총점이 돼야 해요 (지금 620점)."],
    ["목표 없음", { target: "" }, "target", "목표 점수를 적어 주세요."],
    ["목표 1000", { target: "1000" }, "target", "목표 점수는 10 ~ 990 사이 5점 단위예요."],
    ["기간 없음", { goalMonths: null }, "target", "목표를 이룰 기간을 골라 주세요."],
    ["이유 없음", { reasons: [] }, "reasons", "토익을 공부하는 이유를 하나 이상 골라 주세요."],
    ["기타 이유 빈칸", { reasons: ["other"], reasonOther: "  " }, "reasons", "기타 이유를 적어 주세요."],
    ["이력 없음", { history: [] }, "history", "지금까지의 공부를 하나 이상 골라 주세요."],
    ["처음 + 들어 봄", { history: ["first", "basic"] }, "history", "'토익 수업은 처음이에요' 와 '들어 봤어요' 는 함께 고를 수 없어요."],
    ["들은 수업 빈칸", { historyWhere: "" }, "history", "어디서 무슨 수업을 들었는지 적어 주세요."],
    ["다음 달 안 고름", { nextPlan: null }, "next", "다음 달에도 들을지 골라 주세요."],
    ["안 듣는 이유 빈칸", { nextPlan: "no", nextReason: " " }, "next", "안 듣는 이유를 적어 주세요."],
    ["관리 방식 없음", { manage: null }, "manage", "숙제 관리 방식을 골라 주세요."],
    ["계기 없음", { sources: [] }, "sources", "역전토익을 어떻게 알게 됐는지 하나 이상 골라 주세요."],
    ["이야기 한 글자", { story: " 네 " }, "sources", "어떻게 알고 오게 됐는지 적어 주세요."],
  ])("%s → 그 질문에서 멈춘다", (_name, patch, field, error) => {
    expect(checkSurvey({ ...FULL, ...patch })).toEqual({ ok: false, field, error });
  });

  it("처음 걸린 질문이 먼저다 (화면이 그 질문으로 옮긴다)", () => {
    const r = checkSurvey({ ...FULL, target: "", manage: null, occupation: null });
    expect(r.ok === false && r.field).toBe("occupation");
  });

  it("글자 수 상한 — DB check 와 같은 값", () => {
    const long = (n: number) => "가".repeat(n);
    expect(checkSurvey({ ...FULL, workplace: long(SURVEY_MAX.workplace + 1) }).ok).toBe(false);
    expect(checkSurvey({ ...FULL, workplace: long(SURVEY_MAX.workplace) }).ok).toBe(true);
    expect(checkSurvey({ ...FULL, historyWhere: long(SURVEY_MAX.historyWhere + 1) }).ok).toBe(false);
    expect(checkSurvey({ ...FULL, nextPlan: "no", nextReason: long(SURVEY_MAX.nextReason + 1) }).ok).toBe(false);
    expect(checkSurvey({ ...FULL, referrer: long(SURVEY_MAX.referrer + 1) }).ok).toBe(false);
    expect(checkSurvey({ ...FULL, story: long(SURVEY_MAX.story + 1) }).ok).toBe(false);
    expect(checkSurvey({ ...FULL, story: long(SURVEY_MAX.story) }).ok).toBe(true);
    expect(checkSurvey({ ...FULL, reasons: ["other"], reasonOther: long(SURVEY_MAX.reasonOther + 1) }).ok).toBe(false);
    expect(checkSurvey({ ...FULL, story: long(STORY_MIN) }).ok).toBe(true);
  });

  it("모르는 값은 버린다 — 고른 것이 그것뿐이면 고르지 않은 것", () => {
    expect(checkSurvey({ ...FULL, reasons: ["hack"] }).ok).toBe(false);
    const r = checkSurvey({ ...FULL, sources: ["naver", "evil"] as string[] });
    expect(r.ok && r.value.sources).toEqual(["naver"]);
  });

  it("다음 달 반은 여기서 보지 않는다 (서버가 시간표로 다시 푼다)", () => {
    expect(checkSurvey({ ...FULL, nextClass: null }).ok).toBe(true);
  });
});

describe("점수 규칙", () => {
  it("총점 10 ~ 990 · LC/RC 5 ~ 495, 5점 단위 · LC + RC = 총점", () => {
    expect(scoreProblem({ total: 990, lc: 495, rc: 495 })).toBeNull();
    expect(scoreProblem({ total: 10, lc: 5, rc: 5 })).toBeNull();
    expect(scoreProblem({ total: null, lc: null, rc: null })).toBeNull();
    expect(scoreProblem({ total: null, lc: 300, rc: null })).toBe("총점을 적어 주세요.");
    expect(scoreProblem({ total: 995, lc: null, rc: null })).toBe("토익 점수는 10 ~ 990 사이 5점 단위예요.");
    expect(scoreProblem({ total: 500, lc: 0, rc: 500 })).toBe("LC · RC 는 5 ~ 495 사이 5점 단위예요.");
    expect(scoreProblem({ total: NaN, lc: null, rc: null })).toBe("토익 점수는 10 ~ 990 사이 5점 단위예요.");
    expect(targetProblem(null)).toBe("목표 점수를 적어 주세요.");
    expect(targetProblem(855)).toBeNull();
  });

  it("입력칸 글자 → 점수 (쉼표 · 빈칸은 떼고, 숫자가 아니면 NaN)", () => {
    expect(parseScore(" 650 ")).toBe(650);
    expect(parseScore("1,000")).toBe(1000);
    expect(parseScore("")).toBeNull();
    expect(parseScore(null)).toBeNull();
    expect(Number.isNaN(parseScore("육백"))).toBe(true);
    expect(Number.isNaN(parseScore("6.5e2"))).toBe(true);
  });

  it("보여 주기 — 남은 점수 · 막대 · 한 줄", () => {
    expect(pointsToGo(650, 850)).toBe(200);
    expect(pointsToGo(900, 850)).toBe(0);
    expect(pointsToGo(null, 850)).toBeNull();
    expect(goalPercent(425, 850)).toBe(50);
    expect(goalPercent(990, 850)).toBe(100);
    expect(goalPercent(null, 850)).toBe(0);
    expect(scoreLine(650, 330, 320)).toBe("650점 (LC 330 · RC 320)");
    expect(scoreLine(650, null, null)).toBe("650점");
    expect(scoreLine(null)).toBe("아직 없음");
    expect(goalMonthsLabel(6)).toBe("6개월 이상");
    expect(goalMonthsLabel(2)).toBe("2개월");
  });
});

describe("설문 전에도 열리는 화면 — isSurveyFreePath", () => {
  it.each([
    ["/my/survey", true],
    ["/my/verify", true],
    ["/my/verify?x=1", true],
    ["/my/account", true],
    ["/my/profile", true],
    ["/my/attendance", true],
    ["/my/attendance/", true],
    ["/my", false],
    ["/my/homework", false],
    ["/my/attendance/record", false],
    ["/my/surveys", false],
    ["/my/verifyx", false],
  ])("%s → %s", (path, free) => expect(isSurveyFreePath(path)).toBe(free));
});

describe("다음 달 이름 · 다음 달", () => {
  it("해가 같으면 달만, 바뀌면 해까지", () => {
    expect(nextMonthLabel({ y: 2026, m: 12 }, "2026-10-28")).toBe("12월");
    expect(nextMonthLabel({ y: 2027, m: 1 }, "2026-12-03")).toBe("2027년 1월");
  });
  it("학생이 듣는 마지막 달의 다음 달 — 등록이 없으면 이번 달의 다음 달", () => {
    expect(nextMonthOf({ latest: { y: 2026, m: 11 } }, "2026-10-28")).toEqual({ y: 2026, m: 12 });
    expect(nextMonthOf({ latest: { y: 2026, m: 12 } }, "2026-12-02")).toEqual({ y: 2027, m: 1 });
    expect(nextMonthOf(null, "2026-10-28")).toEqual({ y: 2026, m: 11 });
  });
});

/* ─── 다음 달 반 — 시간표로 만든 흉내 반 ───────────────────────────────────── */

const C650 = { id: 1, name: "650+ 왕기초반", program: "score", target_score: 650, course_type: "full" };
const TERM = { year: 2026, month: 12 };
const sec = (id: number, track: string, time_block: string, subject: string | null): EnrollSection => ({ id, track, time_block, subject, term: TERM, course: C650 });
const SECTIONS: EnrollSection[] = [
  sec(1, "mwf", "10:00~11:00", "rc"),
  sec(2, "ttf", "10:00~11:00", "lc"),
  sec(3, "mwf", "11:10~12:10", "lc"),
  sec(4, "ttf", "11:10~12:10", "rc"),
  sec(5, "mwf", "10:00~12:10", null),
  sec(6, "ttf", "10:00~12:10", null),
];
const YM12 = { y: 2026, m: 12 };

describe("resolveNextClass — 고른 반을 서버가 다시 푼다", () => {
  it("종합 주5일 120분 → 글자로 남긴다", () => {
    const r = resolveNextClass(SECTIONS, [C650], YM12, { courseId: 1, kind: "full", track: "week5", timeBlock: "10:00~12:10" });
    expect(r).toEqual({
      ok: true,
      value: {
        courseId: 1,
        course: "650+ 왕기초반",
        level: 650,
        program: "score",
        kind: "full",
        track: "week5",
        timeBlock: "10:00~12:10",
        minutes: 120,
        label: "650+ 왕기초반 · 주5일 · 10:00~12:10 · 120분",
      },
    });
  });

  it("단과는 이름표를 붙인다 (종합은 붙이지 않는다)", () => {
    const r = resolveNextClass(SECTIONS, [C650], YM12, { courseId: 1, kind: "rc", track: "mwf", timeBlock: "10:00~11:00" });
    expect(r.ok && (r.value as { label: string }).label).toBe("650+ 왕기초반 · RC단과 · 월수금 · 10:00~11:00 · 60분");
  });

  it("빠졌거나 맞지 않으면 까닭", () => {
    expect(resolveNextClass(SECTIONS, [C650], YM12, null)).toEqual({ ok: false, error: "다음 달에 들을 반의 레벨을 골라 주세요." });
    expect(resolveNextClass(SECTIONS, [C650], YM12, { courseId: 1, track: "mwf", timeBlock: "10:00~11:00" })).toEqual({
      ok: false,
      error: "종합반인지 단과인지 골라 주세요.",
    });
    expect(resolveNextClass(SECTIONS, [C650], YM12, { courseId: 1, kind: "rc", track: "mwf", timeBlock: null }).ok).toBe(false);
    // RC단과를 골라 놓고 LC 시간
    expect(resolveNextClass(SECTIONS, [C650], YM12, { courseId: 1, kind: "rc", track: "mwf", timeBlock: "11:10~12:10" })).toEqual({
      ok: false,
      error: "고르신 시간대는 RC단과 수업이 아니에요. 시간대를 다시 골라 주세요.",
    });
    // 반이 아직 없어서 "열린" 이라고 말하지 않는다
    const none = resolveNextClass(SECTIONS, [C650], YM12, { courseId: 1, kind: "full", track: "mwf", timeBlock: "18:30~20:40" });
    expect(none.ok === false && none.error).not.toContain("열린");
  });

  it("다음 달 시간표가 하나도 없으면 레벨만", () => {
    expect(resolveNextClass([], [C650], YM12, { courseId: 1, track: null, timeBlock: null })).toEqual({
      ok: true,
      value: { courseId: 1, course: "650+ 왕기초반", label: "650+ 왕기초반" },
    });
    expect(resolveNextClass([], [C650], YM12, { courseId: 9, track: null, timeBlock: null }).ok).toBe(false);
  });
});

/** 아주 작은 가짜 Supabase — 고르기 · eq · is · not 만 */
function fakeClient(tables: Record<string, Record<string, unknown>[]>) {
  return {
    from(table: string) {
      let rows = [...(tables[table] ?? [])];
      const q = {
        select: () => q,
        eq: (col: string, v: unknown) => ((rows = rows.filter((r) => r[col] === v)), q),
        is: (col: string, v: unknown) => ((rows = rows.filter((r) => (r[col] ?? null) === v)), q),
        not: (col: string) => ((rows = rows.filter((r) => r[col] != null)), q),
        order: () => q,
        limit: () => q,
        then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(ok, bad),
      };
      return q;
    },
  };
}

const slot = (y: number | null, m: number | null, start: string, end: string, book: string | null, mwf: string | null, ttf: string | null) => ({
  year: y,
  month: m,
  season: y == null ? "regular" : null,
  level: 650,
  program: "score",
  start_time: `${start}:00`,
  end_time: `${end}:00`,
  ttf_recorded: false,
  book_set: book,
  subject_mwf: mwf,
  subject_ttf: ttf,
});

describe("nextClassSections — 다음 달 시간표 줄 → 월수금 · 화목금 반", () => {
  const courses = [C650, { id: 2, name: "안 쓰는 강좌", program: "score", target_score: 750, course_type: "full", is_active: false }].map((c) => ({
    is_active: true,
    ...c,
  }));

  it("그 달 줄이 있으면 그것으로 — 줄마다 두 트랙, 과목은 트랙별 칸", async () => {
    const client = fakeClient({ timetable_slots: [slot(2026, 12, "10:00", "11:00", "A", "rc", "lc"), slot(2026, 11, "10:00", "11:00", "B", "lc", "rc")], courses });
    const out = await nextClassSections(client as never, YM12);
    expect(out.map((s) => [s.track, s.time_block, s.subject, s.course?.id])).toEqual([
      ["mwf", "10:00~11:00", "rc", 1],
      ["ttf", "10:00~11:00", "lc", 1],
    ]);
  });

  it("그 달 줄이 없으면 앞선 달에서 만든 초안으로 (시간표 설정의 'N월 시간표 만들기' 와 같은 출발점)", async () => {
    const client = fakeClient({ timetable_slots: [slot(2026, 11, "10:00", "11:00", "B", "lc", "rc")], courses });
    const out = await nextClassSections(client as never, YM12);
    expect(out.map((s) => [s.track, s.time_block, s.subject])).toEqual([
      ["mwf", "10:00~11:00", "lc"],
      ["ttf", "10:00~11:00", "rc"],
    ]);
  });

  it("맞는 강좌가 없는 줄은 뺀다", async () => {
    const client = fakeClient({ timetable_slots: [{ ...slot(2026, 12, "10:00", "11:00", "A", "rc", "lc"), level: 990 }], courses });
    expect(await nextClassSections(client as never, YM12)).toEqual([]);
  });
});

/* ─── DB 와 같은 목록 · 정책 · 함수 ─────────────────────────────────────────── */

/** check 안의 array['a', 'b'] 목록 */
const arrayAfter = (col: string) => {
  const m = SURVEY_SQL.match(new RegExp(`${col} <@ array\\[([^\\]]+)\\]`));
  return m ? [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) : null;
};
const inList = (col: string) => {
  const m = SURVEY_SQL.match(new RegExp(`${col} in \\(([^)]+)\\)`));
  return m ? [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) : null;
};

describe("마이그레이션 — 고르는 값 · 글자 수가 화면과 같다", () => {
  const keys = (list: readonly { key: string }[]) => list.map((o) => o.key);
  it("고르는 값", () => {
    expect(inList("occupation")).toEqual(keys(OCCUPATIONS));
    expect(arrayAfter("reasons")).toEqual(keys(REASONS));
    expect(arrayAfter("history")).toEqual(keys(HISTORY));
    expect(arrayAfter("sources")).toEqual(keys(SOURCES));
    expect(inList("next_plan")).toEqual(keys(NEXT_PLANS));
    expect(inList("manage_style")).toEqual(keys(MANAGE_STYLES));
    // '들어 봤어요' 묶음 — history_where 가 있어야 하는 것
    expect(SURVEY_SQL).toContain(`history && array[${HISTORY.filter((h) => h.took).map((h) => `'${h.key}'`).join(", ")}]::text[]`);
  });
  it("글자 수", () => {
    expect(SURVEY_SQL).toContain(`char_length(workplace) between 1 and ${SURVEY_MAX.workplace}`);
    expect(SURVEY_SQL).toContain(`char_length(reason_other) between 1 and ${SURVEY_MAX.reasonOther}`);
    expect(SURVEY_SQL).toContain(`char_length(history_where) between 1 and ${SURVEY_MAX.historyWhere}`);
    expect(SURVEY_SQL).toContain(`char_length(next_reason) between 1 and ${SURVEY_MAX.nextReason}`);
    expect(SURVEY_SQL).toContain(`char_length(referrer_name) between 1 and ${SURVEY_MAX.referrer}`);
    expect(SURVEY_SQL).toContain(`char_length(btrim(source_story)) between ${STORY_MIN} and ${SURVEY_MAX.story}`);
  });
  it("나이 칸은 없다 (2026-10-28 Alan — 개인정보 보호법에 걸리면 빼 달라)", () => {
    expect(SURVEY_SQL).not.toMatch(/\bage\b|birth/);
  });
});

describe("마이그레이션 — 누가 보나 · 누가 쓰나 (강사 · 관리자 · 본인만, 조교 아님)", () => {
  // 마이그레이션을 순서대로 재생해 마지막에 살아 있는 정책
  const live = new Map<string, string>();
  for (const f of FILES) {
    for (const [, verb, name, body] of stripComments(read(join(DIR, f))).matchAll(/(create|drop) policy (?:if exists )?"([^"]+)" on public\.student_surveys([^;]*);/g)) {
      if (verb === "create") live.set(name, flat(body));
      else live.delete(name);
    }
  }
  const of = (verb: string) => [...live.values()].filter((b) => b.includes(`for ${verb} `));

  it("조회는 강사 · 관리자(is_staff) 또는 본인 — 조교 갈래(is_crew · is_assistant)가 없다", () => {
    const selects = of("select");
    expect(selects).toHaveLength(1);
    expect(selects[0]).toContain("(select private.is_staff()) or user_id = (select auth.uid())");
    expect(selects.join(" ")).not.toMatch(/is_crew|is_assistant/);
  });

  it("고치기는 본인만 · 넣기 · 지우기 정책은 없다 (넣기는 함수로만)", () => {
    const updates = of("update");
    expect(updates).toHaveLength(1);
    expect(updates[0]).toContain("using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))");
    expect(of("insert")).toEqual([]);
    expect(of("delete")).toEqual([]);
  });

  it("학생이 고치는 칸은 지금 점수 · 목표뿐 (설문 답은 바뀌지 않는다)", () => {
    expect(SURVEY_SQL).toContain("grant update (now_total, now_lc, now_rc, now_target, now_updated_at) on public.student_surveys to authenticated");
    expect(SURVEY_SQL).not.toMatch(/grant (insert|delete|all)[^;]*on public\.student_surveys to (authenticated|anon)/);
    expect(SURVEY_SQL).toContain("alter table public.student_surveys enable row level security");
  });

  it("내기 함수 — 내 줄만 · 강사 · 관리자 · 조교 계정은 내지 않음 · 두 번째는 already_done · 관리 방식 = 숙제 미제출 알림 스위치", () => {
    const fn = SURVEY_SQL.match(/create or replace function public\.submit_student_survey\(p jsonb\)(.*?)\$\$;/)?.[1] ?? "";
    expect(fn).toContain("security definer set search_path = ''");
    expect(fn).toContain("v_uid uuid := auth.uid()");
    expect(fn).toContain("v_profile.role in ('instructor', 'admin', 'assistant')");
    expect(fn).toContain("raise exception 'staff_account'");
    expect(fn).toContain("on conflict (user_id) do nothing");
    expect(fn).toContain("raise exception 'already_done'");
    expect(fn).toContain("if p ->> 'manage_style' = 'self' then insert into public.homework_missing_optouts (user_id) values (v_uid)");
    expect(fn).toContain("else delete from public.homework_missing_optouts where user_id = v_uid");
    expect(SURVEY_SQL).toContain("revoke execute on function public.submit_student_survey(jsonb) from public, anon");
    expect(SURVEY_SQL).toContain("grant execute on function public.submit_student_survey(jsonb) to authenticated");
  });

  it("빡센 관리 = 알림 켜짐 · 알아서 = 꺼짐 (화면 글과 DB 가 같은 뜻)", () => {
    expect(MANAGE_STYLES.find((m) => m.key === "strict")?.alerts).toBe(true);
    expect(MANAGE_STYLES.find((m) => m.key === "self")?.alerts).toBe(false);
  });

  it("계정을 합치면 설문도 남길 계정으로 (남길 계정에 없을 때만)", () => {
    expect(SURVEY_SQL).toContain("create trigger profiles_student_surveys_follow_merge after update of merged_into on public.profiles");
    expect(SURVEY_SQL).toContain("not exists (select 1 from public.student_surveys t where t.user_id = new.merged_into)");
  });
});

describe("화면 · 서버 — 문 · 내기 · 점수 고치기", () => {
  it("마이페이지 레이아웃이 문을 세운다 — 강사 · 관리자 · 조교 계정은 진짜 등급으로 빼고, 설문을 못 읽으면 막지 않는다", () => {
    const layout = read("src/app/my/layout.tsx");
    expect(layout).toContain("const surveyPending = !isCrew(profile?.role) && access.enrollee && !survey.error && !survey.row;");
    expect(layout).toContain("<SurveyGate pending={surveyPending}>{children}</SurveyGate>");
  });

  it("내 설문은 내 줄만 읽는다", () => {
    const q = read("src/app/my/_lib/queries.ts");
    const fn = q.slice(q.indexOf("export const getMySurvey"), q.indexOf("export type MySurvey"));
    expect(fn).toContain('.from("student_surveys")');
    expect(fn).toContain('.eq("user_id", user.id)');
  });

  it("내기는 로그인 서버로 확인(getUser) · 강사 · 관리자 · 조교 계정 막음 · 등업한 학생만 · 같은 검사 · DB 함수 하나", () => {
    const a = read("src/app/my/survey/actions.ts");
    const submit = a.slice(a.indexOf("export async function submitStudentSurvey"), a.indexOf("export type ScoreResult"));
    expect(submit).toContain("supabase.auth.getUser()");
    expect(submit).toContain("if (isCrew(profile.role))");
    expect(submit).toContain("if (!access.enrollee)");
    expect(submit).toContain("checkSurvey(input)");
    expect(submit).toContain("resolveNextClass(");
    expect(submit).toContain('supabase.rpc("submit_student_survey"');
    expect(submit).not.toContain("createAdminClient");
  });

  it("점수 고치기는 내 줄의 지금 점수 · 목표만, 내 세션으로", () => {
    const a = read("src/app/my/survey/actions.ts");
    const save = a.slice(a.indexOf("export async function saveMyScores"));
    expect(save).toContain('.update({ now_total: score.total, now_lc: score.lc, now_rc: score.rc, now_target: target!, now_updated_at:');
    expect(save).toContain('.eq("user_id", user.id)');
    expect(save).not.toContain("createAdminClient");
  });

  it("마이페이지 맨 위 — 인사 바로 아래에 점수 카드 (설문을 한 학생만)", () => {
    const page = read("src/app/my/page.tsx");
    const h1 = page.indexOf("</h1>");
    const card = page.indexOf("{survey.row && <MyScoreCard scores={survey.row} />}");
    const orders = page.indexOf('aria-labelledby="orders-title"');
    expect(card).toBeGreaterThan(h1);
    expect(card).toBeLessThan(orders);
  });

  it("설문 답은 강사 · 관리자 화면에만 — 학생 관리(requireStaff) · 마케팅 분석(requireStaff). 조교 화면(requireCrew)에서는 읽지 않는다", () => {
    expect(read("src/app/admin/students/[id]/page.tsx")).toContain('supabase.from("student_surveys")');
    expect(read("src/app/admin/students/[id]/page.tsx")).toContain("requireStaff()");
    // 1,000줄씩 읽게 되며(2026-10-29 — readAll) 줄이 나뉘었다
    expect(read("src/app/admin/analytics/page.tsx")).toMatch(/supabase\s*\.from\("student_surveys"\)/);
    expect(read("src/app/admin/analytics/page.tsx")).toContain("requireStaff()");
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : []));
    const crewFiles = walk("src/app/admin").filter((f) => read(f).includes("requireCrew()") && read(f).includes("student_surveys"));
    expect(crewFiles).toEqual([]);
  });
});
