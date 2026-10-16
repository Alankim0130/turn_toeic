import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CLASS_MATERIAL_LINK_URL_MAX } from "./class-materials";
import {
  brushLectures,
  restoreLectureIds,
  ddayLabel,
  isSnsFollow,
  isYbmReviewUrl,
  kstDateOf,
  lectureCameo,
  lectureCondition,
  LECTURE_CONDITIONS,
  LECTURE_SUBJECT_ERROR,
  lectureOpensAt,
  lectureState,
  lectureSubjectBlock,
  lectureSubjectNote,
  lectureTitle,
  parseReviewLink,
  reviewLinkError,
  reviewLinkKey,
  sectionSubjects,
  shiftDate,
  signupDday,
  SNS_FOLLOWS,
  snsFollowError,
  sortLectures,
  YBM_REVIEW_LINK_RE,
} from "./lecture";
import { LECTURE_KIND_VALUES, LECTURE_KINDS, lectureDayTags, lectureKindSubject } from "./utils";

/** 마이그레이션을 파일 순서대로 — 그 이름의 마지막 정의 본문을 꺼낸다 */
const SQLS = readdirSync("supabase/migrations")
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(`supabase/migrations/${f}`, "utf8"));
const lastFn = (name: string) => {
  const file = SQLS.filter((t) => t.includes(`function ${name}(`)).at(-1) ?? "";
  const start = file.indexOf(`function ${name}(`);
  return start < 0 ? "" : file.slice(start, file.indexOf("$$;", start));
};
const lastCheck = (name: string) => {
  const file = SQLS.filter((t) => t.includes(`add constraint ${name}`)).at(-1) ?? "";
  const start = file.lastIndexOf(`add constraint ${name}`);
  return start < 0 ? "" : file.slice(start, file.indexOf(";", start));
};

const base = { id: 1, date: "2026-10-17", signup: true, capacity: 140, signup_opens_at: null, applied_count: 0 };
const at = (kst: string) => new Date(`${kst}+09:00`).getTime();

describe("lectureOpensAt — 신청 시작 기본값은 특강 7일 전 자정(KST) (2026-10-02 Alan)", () => {
  it("비어 있으면 특강 7일 전 00:00 KST", () => {
    expect(lectureOpensAt(base)).toBe(new Date("2026-10-10T00:00:00+09:00").toISOString());
  });
  it("강사가 따로 적은 신청 시작이 있으면 그 값", () => {
    expect(lectureOpensAt({ ...base, signup_opens_at: "2026-10-01T03:00:00.000Z" })).toBe("2026-10-01T03:00:00.000Z");
  });
  it("달을 넘어가도 날짜 계산이 맞는다", () => {
    expect(shiftDate("2026-10-03", -7)).toBe("2026-09-26");
    expect(shiftDate("2026-03-02", -7)).toBe("2026-02-23");
    expect(kstDateOf("2026-10-09T15:00:00.000Z")).toBe("2026-10-10");
  });
});

describe("lectureState — 7일 전부터 당일까지", () => {
  it("8일 전에는 아직 신청 전, 7일 전 자정부터 신청 받는 중", () => {
    expect(lectureState(base, "2026-10-09", at("2026-10-09T23:59:59"))).toBe("not_open");
    expect(lectureState(base, "2026-10-10", at("2026-10-10T00:00:00"))).toBe("open");
    expect(lectureState(base, "2026-10-17", at("2026-10-17T12:00:00"))).toBe("open");
    expect(lectureState(base, "2026-10-18", at("2026-10-18T00:00:00"))).toBe("closed");
  });
  it("정원이 차면 정원 마감, 신청을 안 받으면 none", () => {
    expect(lectureState({ ...base, applied_count: 140 }, "2026-10-12", at("2026-10-12T10:00:00"))).toBe("full");
    expect(lectureState({ ...base, signup: false }, "2026-10-12", at("2026-10-12T10:00:00"))).toBe("none");
  });
});

describe("signupDday — 잠긴 특강의 D-day", () => {
  it("10/2 에 10/17 특강(10/10 오픈)은 D-8, 10/9 에는 D-1, 10/10 00:00 부터는 열려서 null", () => {
    expect(signupDday(base, "2026-10-02", at("2026-10-02T15:00:00"))).toBe(8);
    expect(signupDday(base, "2026-10-09", at("2026-10-09T23:00:00"))).toBe(1);
    expect(signupDday(base, "2026-10-10", at("2026-10-10T00:00:00"))).toBeNull();
  });
  it("오늘 낮에 열리는 특강(강사가 시각을 적음)은 D-DAY", () => {
    const l = { ...base, signup_opens_at: new Date("2026-10-02T18:00:00+09:00").toISOString() };
    expect(signupDday(l, "2026-10-02", at("2026-10-02T09:00:00"))).toBe(0);
    expect(ddayLabel(0)).toBe("D-DAY");
    expect(ddayLabel(3)).toBe("D-3");
  });
});

describe("lectureCameo — 강사와 종류에 맞는 캐리커처", () => {
  it("이혜영 LC특강(현강 · 녹화영상)은 헤드폰 노트 컷, 모의고사(현강 · 시험지)면 윙크 가리키기", () => {
    expect(lectureCameo("이혜영", ["lc"])?.pose).toBe("notebook");
    expect(lectureCameo("이혜영", ["lc_video"])?.pose).toBe("notebook");
    expect(lectureCameo("이혜영", ["mock1"])?.pose).toBe("point");
    expect(lectureCameo("이혜영", ["mock1_paper"])?.pose).toBe("point");
    expect(lectureCameo("이혜영", ["mock2_pdf"])?.pose).toBe("point"); // PDF 수령도 모의고사 (2026-10-16)
  });
  it("이영수 RC특강(현강 · 녹화영상)은 태블릿 컷, 모의고사면 엄지척", () => {
    expect(lectureCameo("이영수", ["rc"])?.pose).toBe("tablet");
    expect(lectureCameo("이영수", ["rc_video"])?.pose).toBe("tablet");
    expect(lectureCameo("이영수", ["mock2"])?.pose).toBe("thumbsup");
    expect(lectureCameo("이영수", ["mock2_paper"])?.pose).toBe("thumbsup");
    expect(lectureCameo("이영수", ["mock1_pdf"])?.pose).toBe("thumbsup");
  });
  it("강사가 없거나 두 분이 아니면 그리지 않는다", () => {
    expect(lectureCameo(null, ["rc"])).toBeNull();
    expect(lectureCameo("알런", ["rc"])).toBeNull();
  });
  it("말풍선은 응원만 — 학생이 따라 할 준비물 · 오라는 말 · 점수 약속은 없다 (2026-10-07 Alan)", () => {
    const lines = [
      lectureCameo("이혜영", ["lc"]),
      lectureCameo("이혜영", ["mock1"]),
      lectureCameo("이영수", ["rc"]),
      lectureCameo("이영수", ["mock2"]),
    ].map((c) => c?.line ?? "");
    for (const line of lines) {
      expect(line).not.toBe("");
      expect(line).not.toMatch(/챙기|가져오|준비물|오기만|올려 드릴/);
    }
  });
});

/**
 * 특강 종류 열 · 특강 하나에 하나 (2026-10-15 Alan — "1. RC특강 (현강신청)/ RC 특강(녹화영상신청) 2. LC특강 (현강신청)/ LC 특강(녹화영상신청)
 * 3. 1차 모의고사 (현강신청)/ 1차 모의고사 (시험지 수령 신청) 4. 2차 모의고사 (현강신청)/ 2차 모의고사 (시험지 수령 신청) 이렇게 총 8개로"
 * → 2026-10-16 Alan "모의고사에서 'pdf수령' 신청이 하나 더 추가되면 좋겠어!!" — 1차 · 2차 모의고사 PDF 수령 신청).
 */
describe("특강 종류 열 — Alan 이 적은 이름 · DB check · 순서 · 과목", () => {
  it("이름은 Alan 이 적은 그대로, 지금 값 rc · lc · mock1 · mock2 가 현강신청이다", () => {
    expect(LECTURE_KINDS.map((k) => k.label)).toEqual([
      "RC특강 (현강신청)",
      "RC특강 (녹화영상신청)",
      "LC특강 (현강신청)",
      "LC특강 (녹화영상신청)",
      "1차 모의고사 (현강신청)",
      "1차 모의고사 (시험지 수령 신청)",
      "1차 모의고사 (PDF 수령 신청)",
      "2차 모의고사 (현강신청)",
      "2차 모의고사 (시험지 수령 신청)",
      "2차 모의고사 (PDF 수령 신청)",
    ]);
    for (const v of ["rc", "lc", "mock1", "mock2"]) expect(LECTURE_KINDS.find((k) => k.value === v)?.way, v).toBe("onsite");
    // PDF 수령은 모의고사에만 — 특강(RC · LC)은 현강 · 녹화영상 둘 그대로
    expect(LECTURE_KINDS.filter((k) => k.way === "pdf").map((k) => k.value)).toEqual(["mock1_pdf", "mock2_pdf"]);
    expect(LECTURE_KINDS.filter((k) => k.base === "rc").map((k) => k.wayLabel)).toEqual(["현강신청", "녹화영상신청"]);
    expect(LECTURE_KINDS.filter((k) => k.base === "mock2").map((k) => k.wayLabel)).toEqual(["현강신청", "시험지 수령 신청", "PDF 수령 신청"]);
  });
  it("DB check(special_lectures_kinds_check — 마지막 정의)와 같은 값 · 특강 하나에 하나 · private.lecture_kinds 와 같은 순서", () => {
    const check = lastCheck("special_lectures_kinds_check");
    expect(check).toContain("cardinality(kinds) <= 1");
    const values = check.match(/array\[([^\]]+)\]::text\[\]/)?.[1].split(",").map((k) => k.trim().replace(/'/g, ""));
    expect(values).toEqual(LECTURE_KIND_VALUES);
    const order = lastFn("private.lecture_kinds").match(/array_position\(array\[([^\]]+)\]/)?.[1].split(",").map((k) => k.trim().replace(/'/g, ""));
    expect(order).toEqual(LECTURE_KIND_VALUES);
    // 반 편성 달력 저장도 같은 값 · 하나만
    const save = lastFn("public.save_term_schedule");
    expect(save).toContain("coalesce(jsonb_array_length(e -> 'kinds'), 0) > 1");
    expect(save).toContain(`k not in (${LECTURE_KIND_VALUES.map((k) => `'${k}'`).join(", ")})`);
  });
  it("과목 — 녹화영상도 그 과목이다 (DB private.lecture_kind_subject 와 같다)", () => {
    expect(LECTURE_KIND_VALUES.map(lectureKindSubject)).toEqual(["rc", "rc", "lc", "lc", null, null, null, null, null, null]);
    const fn = lastFn("private.lecture_kind_subject");
    expect(fn).toContain("when p_kind in ('rc', 'rc_video') then 'rc'");
    expect(fn).toContain("when p_kind in ('lc', 'lc_video') then 'lc'");
    // 단과 검사 트리거가 그 함수로 과목을 읽는다
    expect(lastFn("private.lecture_signups_eligible_subject")).toContain("private.lecture_kind_subject(k)");
  });
  it("제목은 그 이름 그대로 — 내용이 있으면 덧붙인다", () => {
    expect(lectureTitle({ kinds: ["rc_video"], content: null })).toBe("RC특강 (녹화영상신청)");
    expect(lectureTitle({ kinds: ["mock2_paper"], content: "16:00" })).toBe("2차 모의고사 (시험지 수령 신청) — 16:00");
    expect(lectureTitle({ kinds: ["mock1_pdf"], content: null })).toBe("1차 모의고사 (PDF 수령 신청)");
    expect(lectureTitle({ kinds: [], content: "설명회" })).toBe("설명회");
  });
  it("같은 날 특강은 RC 현강 · 녹화 · LC … · 2차 시험지 순, 종류 없는 특강은 맨 뒤", () => {
    const list = [
      { id: 5, date: "2026-10-24", kinds: ["mock2_paper"] },
      { id: 9, date: "2026-10-24", kinds: [] },
      { id: 3, date: "2026-10-24", kinds: ["rc_video"] },
      { id: 4, date: "2026-10-17", kinds: ["mock1"] },
      { id: 7, date: "2026-10-24", kinds: ["rc"] },
      { id: 1, date: "2026-10-24", kinds: ["mock2_pdf"] },
      { id: 2, date: "2026-10-24", kinds: ["mock2"] },
    ];
    expect(sortLectures(list).map((l) => l.id)).toEqual([4, 7, 3, 2, 5, 1, 9]);
  });
});

describe("특강 id 되살리기 — 같은 특강을 지우고 새로 만들어 신청 설정이 사라지지 않게 (restoreLectureIds, 2026-10-16 점검)", () => {
  const saved = [
    { id: 101, date: "2026-10-17", lecturerId: 1, content: "", kinds: ["mock1"] },
    { id: 102, date: "2026-10-24", lecturerId: 2, content: "", kinds: ["mock2"] },
    { id: 103, date: "2026-10-24", lecturerId: 2, content: "", kinds: ["rc"] },
  ];

  it("달력에서 뺐다가 다시 누른 특강(id 없음)은 원래 id 를 되찾는다 — 예전에는 저장하면 원래 특강을 지우고 새로 만들었다", () => {
    const list = [
      { key: "a", ...saved[0] },
      { key: "new", id: null, date: "2026-10-24", lecturerId: 2, content: "", kinds: ["mock2"] },
      { key: "c", ...saved[2] },
    ];
    expect(restoreLectureIds(list, saved).map((l) => [l.key, l.id])).toEqual([
      ["a", 101],
      ["new", 102],
      ["c", 103],
    ]);
  });

  it("날 · 강사 · 종류 · 내용이 하나라도 다르면 새 특강이다 · 목록이 이미 쓰는 id 는 다시 주지 않는다 · 하나는 한 번만", () => {
    const list = [
      { id: null, date: "2026-10-24", lecturerId: 1, content: "", kinds: ["mock2"] }, // 강사가 다르다
      { id: null, date: "2026-10-24", lecturerId: 2, content: "보충", kinds: ["mock2"] }, // 내용이 다르다
      { id: null, date: "2026-10-24", lecturerId: 2, content: "", kinds: ["mock2_paper"] }, // 종류가 다르다
      { id: 103, date: "2026-10-24", lecturerId: 2, content: "", kinds: ["rc"] },
      { id: null, date: "2026-10-24", lecturerId: 2, content: "", kinds: ["rc"] }, // 103 은 목록이 이미 쓴다
      { id: null, date: "2026-10-17", lecturerId: 1, content: " ", kinds: ["mock1"] }, // 앞뒤 빈칸은 같은 내용
      { id: null, date: "2026-10-17", lecturerId: 1, content: "", kinds: ["mock1"] }, // 101 은 바로 앞이 가져갔다
    ];
    expect(restoreLectureIds(list, saved).map((l) => l.id)).toEqual([null, null, null, 103, null, 101, null]);
  });

  it("바꿀 것이 없으면 받은 목록을 그대로 돌려준다 (화면이 다시 그리지 않게)", () => {
    const list = saved.map((l) => ({ ...l }));
    expect(restoreLectureIds(list, saved)).toBe(list);
    const fresh = [{ id: null, date: "2026-10-30", lecturerId: 1, content: "", kinds: ["lc"] }];
    expect(restoreLectureIds(fresh, saved)).toBe(fresh);
  });

  it("서버 액션이 DB 로 보내기 전에, 달력 화면이 다시 누를 때와 저장한 뒤 새 목록을 받을 때 쓴다", () => {
    const action = readFileSync("src/app/admin/sections/actions.ts", "utf8");
    expect(action).toMatch(/toSave = restoreLectureIds\(/);
    expect(action).toMatch(/p_lectures: toSave,/);
    const calendar = readFileSync("src/components/admin/sections/TermCalendar.tsx", "utf8");
    expect(calendar).toMatch(/setLectures\(restoreLectureIds\(res\.lectures, saved\.lectures\)\)/);
    expect(calendar).toMatch(/if \(idsFrom !== saved\.lectures\) \{\s*setIdsFrom\(saved\.lectures\);\s*setLectures\(restoreLectureIds\(lectures, saved\.lectures\)\);/);
  });
});

describe("반 편성 달력 — 고른 종류마다 특강 하나 (brushLectures) · 칸 표시 (lectureDayTags)", () => {
  type L = { key: string; date: string; lecturerId: number; content: string; kinds: string[] };
  let n = 0;
  const make = (date: string) => (kinds: string[]): L => ({ key: `k${++n}`, date, lecturerId: 2, content: "", kinds });
  const brush = (date: string, kinds: string[]) => ({ date, lecturerId: 2, content: "", kinds });

  it("종류를 여럿 고르고 날짜를 누르면 종류마다 하나씩 생기고, 다시 누르면 모두 빠진다", () => {
    const first = brushLectures([], brush("2026-10-24", ["mock2", "rc", "rc_video"]), make("2026-10-24"));
    expect(first.added).toBe(3);
    expect(first.lectures.map((l) => l.kinds)).toEqual([["rc"], ["rc_video"], ["mock2"]]);
    const again = brushLectures(first.lectures, brush("2026-10-24", ["rc", "rc_video", "mock2"]), make("2026-10-24"));
    expect(again.removed).toBe(3);
    expect(again.lectures).toEqual([]);
  });
  it("일부만 있으면 없는 것만 더한다 · 다른 날 · 다른 강사 · 다른 내용은 다른 특강", () => {
    const base = brushLectures([], brush("2026-10-24", ["rc"]), make("2026-10-24")).lectures;
    const more = brushLectures(base, brush("2026-10-24", ["rc", "rc_video"]), make("2026-10-24"));
    expect(more.added).toBe(1);
    expect(more.lectures.map((l) => l.kinds)).toEqual([["rc"], ["rc_video"]]);
    expect(brushLectures(base, brush("2026-10-31", ["rc"]), make("2026-10-31")).added).toBe(1);
    expect(brushLectures(base, { ...brush("2026-10-24", ["rc"]), lecturerId: 1 }, make("2026-10-24")).added).toBe(1);
    expect(brushLectures(base, { ...brush("2026-10-24", ["rc"]), content: "파트5" }, make("2026-10-24")).added).toBe(1);
  });
  it("종류를 안 골랐으면 내용만 있는 특강 하나 (예전처럼 다시 누르면 빠진다)", () => {
    const one = brushLectures([], { date: "2026-10-31", lecturerId: 1, content: "설명회", kinds: [] }, (kinds) => ({ key: "x", date: "2026-10-31", lecturerId: 1, content: "설명회", kinds }));
    expect(one.lectures.map((l) => l.kinds)).toEqual([[]]);
    expect(brushLectures(one.lectures, { date: "2026-10-31", lecturerId: 1, content: "설명회", kinds: [] }, () => one.lectures[0]).lectures).toEqual([]);
  });
  it("달력 칸은 무슨 특강인가로 묶는다 — `RC 현강·녹화` · 좁으면 `RC` · 종류가 없으면 `특강`", () => {
    const tags = lectureDayTags([["mock2_paper"], ["rc_video"], ["rc"], ["mock2"], []]);
    expect(tags.map((t) => t.short)).toEqual(["RC 현강·녹화", "2차 현강·시험지", "특강"]);
    expect(tags.map((t) => t.tiny)).toEqual(["RC", "2차", "특강"]);
    expect(tags[0].label).toBe("RC특강 (현강신청), RC특강 (녹화영상신청)");
    expect(lectureDayTags([["lc_video"]]).map((t) => t.short)).toEqual(["LC 녹화"]);
    // 모의고사 PDF 수령 (2026-10-16) — 같은 날 현강 · 시험지 · PDF 가 한 표시로
    const mock = lectureDayTags([["mock1_pdf"], ["mock1"], ["mock1_paper"]]);
    expect(mock.map((t) => t.short)).toEqual(["1차 현강·시험지·PDF"]);
    expect(mock[0].label).toBe("1차 모의고사 (현강신청), 1차 모의고사 (시험지 수령 신청), 1차 모의고사 (PDF 수령 신청)");
    expect(lectureDayTags([["mock2_pdf"]]).map((t) => t.short)).toEqual(["2차 PDF"]);
    expect(lectureDayTags([])).toEqual([]);
  });
});

/**
 * 신청 조건 — 강사가 특강마다 고른다 (2026-10-15 Alan — "1. 수업후기작성 2. 이미지참고 3. 조건없음").
 * 이미지참고 = Alan 이 보낸 그림의 유튜브 구독 · 인스타그램 팔로우(새로 · 기존).
 */
describe("신청 조건 — review · sns · none (DB check · 신청 트리거 · 서버 액션)", () => {
  it("값 셋 · 모르는 값은 조건 없음 · 팔로우는 새로 · 기존", () => {
    expect(LECTURE_CONDITIONS.map((c) => c.value)).toEqual(["review", "sns", "none"]);
    expect(LECTURE_CONDITIONS.map((c) => c.label)).toEqual(["YBM 수강후기 작성", "유튜브 구독 · 인스타그램 팔로우", "조건 없음"]);
    expect(lectureCondition("sns")).toBe("sns");
    expect(lectureCondition("x")).toBe("none");
    expect(lectureCondition(null)).toBe("none");
    expect(SNS_FOLLOWS.map((f) => f.value)).toEqual(["new", "existing"]);
    expect(isSnsFollow("existing")).toBe(true);
    expect(isSnsFollow("old")).toBe(false);
  });
  it("DB check 와 같은 값 — 조건(special_lectures_signup_condition_check) · 팔로우(lecture_signups_sns_follow_check) · 안내 5만 자", () => {
    const vals = (sql: string) => [...(sql.match(/in \(([^)]+)\)/)?.[1] ?? "").matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
    expect(vals(lastCheck("special_lectures_signup_condition_check"))).toEqual(LECTURE_CONDITIONS.map((c) => c.value).sort());
    expect(vals(lastCheck("lecture_signups_sns_follow_check"))).toEqual(SNS_FOLLOWS.map((f) => f.value).sort());
    expect(lastCheck("special_lectures_notice_check")).toContain("char_length(notice) <= 50000");
    // 후기 링크 칸 길이는 수업자료실 링크와 같다 (2026-10-08 그대로)
    expect(lastCheck("lecture_signups_review_url_check")).toMatch(new RegExp(`char_length\\(review_url\\) <= ${CLASS_MATERIAL_LINK_URL_MAX}\\b`));
  });
  it("신청을 넣을 때 트리거가 조건 칸으로 본다 — 후기 링크 · 팔로우가 없으면 막고, 조건이 아닌 칸은 비운다", () => {
    const fn = lastFn("private.lecture_signups_review_check");
    expect(fn).toContain("select l.signup_condition into v_condition");
    expect(fn).toContain("'sns_follow_required'");
    expect(fn).toContain("'review_link_required'");
    expect(fn).toContain("new.review_url := null");
    expect(fn).toContain("new.sns_follow := null");
    // 날짜로 정하던 3주차 규칙(2026-10-08)은 지웠다 — 이제 조건 칸이 정한다
    expect(fn).not.toContain("lecture_needs_review");
    expect(SQLS.join("\n")).toContain("drop function if exists private.lecture_needs_review(bigint)");
    expect(SQLS.join("\n")).toMatch(/before insert on public\.lecture_signups[\s\S]*?lecture_signups_review_check/);
    // 학생이 조건 칸을 넣는다 (칸 단위 grant)
    expect(SQLS.join("\n")).toContain("grant insert (sns_follow) on public.lecture_signups to authenticated");
    expect(SQLS.join("\n")).toContain("grant update (signup_condition, notice) on public.special_lectures to authenticated");
  });
  it("서버 액션이 조건을 보고 칸을 보내고, DB 오류를 학생 말로 바꾼다", () => {
    const action = readFileSync("src/app/my/class/actions.ts", "utf8");
    expect(action).toContain('select("signup_condition")');
    expect(action).toContain("reviewLinkError(error.message) ?? snsFollowError(error.message)");
    expect(action).toContain('formData.get("youtube") !== "on"');
    expect(reviewLinkError("review_link_required")).toContain("링크를 올려야");
    expect(snsFollowError("sns_follow_required")).toContain("인스타그램");
    expect(snsFollowError("lecture_full")).toBeNull();
  });
  it("있던 특강 — 여러 종류는 종류마다 나누고(신청자도 옮겨 적는다), 조건은 2026-10-08 규칙(모의고사 현강 · 3주차 = 후기)대로", () => {
    const mig = SQLS.find((t) => t.includes("특강 나누기:")) ?? "";
    expect(mig).not.toBe("");
    // 옮겨 적는 동안만 검사 트리거를 끄고 다시 켠다 — 켜는 줄이 끄는 줄 뒤에 있어야 한다
    for (const t of ["lecture_signups_eligible_subject", "lecture_signups_review_check"]) {
      const off = mig.indexOf(`disable trigger ${t};`);
      const on = mig.indexOf(`enable trigger ${t};`);
      expect(off, t).toBeGreaterThan(0);
      expect(on, t).toBeGreaterThan(off);
    }
    expect(mig).toContain("insert into public.lecture_signups (lecture_id, user_id, created_at, review_url)");
    expect(mig).toMatch(/set signup_condition = 'review'[\s\S]*?l\.kinds && array\['mock1', 'mock2'\]::text\[\][\s\S]*?\/ 7 \+ 1 = 3/);
  });
});

describe("parseReviewLink — YBM 수강후기 링크만 받는다 (2026-10-08 Alan 이 보내 준 7월 학생들의 링크 화면)", () => {
  // 7월 링크는 전부 https://www.ybmedu.com/mypage/lessonView/<22자 토큰> 이었다. 실제 학생 링크 · 이름은 저장소에 넣지 않는다 — 토큰 · 이름은 지어낸 것
  const TOKEN = "Ab3dEf-hIjKlMn_pQrStUv";
  const LINK = `https://www.ybmedu.com/mypage/lessonView/${TOKEN}`;

  it("후기 링크를 그대로 받고, https:// 를 빼먹었으면 붙인다", () => {
    expect(parseReviewLink(LINK)).toEqual({ ok: true, url: LINK });
    expect(parseReviewLink(`  www.ybmedu.com/mypage/lessonView/${TOKEN} `)).toEqual({ ok: true, url: LINK });
    expect(parseReviewLink(`https://m.ybmedu.com/mypage/lessonView/${TOKEN}`).ok).toBe(true);
    expect(parseReviewLink(`${LINK}?utm_source=share`).ok).toBe(true);
    expect(parseReviewLink(`${LINK}/`).ok).toBe(true);
  });
  it("7월처럼 `번호/이름/반/주소` 로 붙여 넣거나 공유 글이 붙어 와도 주소만 꺼낸다", () => {
    expect(parseReviewLink(`3/홍길동/750주5일/${LINK}`)).toEqual({ ok: true, url: LINK });
    expect(parseReviewLink(`5/홍길동/650주5일/ ${LINK}`)).toEqual({ ok: true, url: LINK });
    expect(parseReviewLink(`[YBM] 수강후기 ${LINK} 확인해 보세요.`)).toEqual({ ok: true, url: LINK });
    expect(parseReviewLink(`후기: ${LINK}.`)).toEqual({ ok: true, url: LINK });
  });
  it("YBM 후기 링크가 아니면 돌려보낸다 — 첫 화면 · 역전토익 후기 목록 · 토큰 없음 · 다른 사이트", () => {
    for (const u of [
      "",
      "   ",
      "후기 다 썼어요",
      "javascript:alert(1)",
      "https://www.ybmedu.com/",
      "ybmedu.com",
      "https://www.ybmedu.com/seomyon/winnertoeic",
      "https://www.ybmedu.com/seomyon/winnertoeic#tab_area06",
      "https://www.ybmedu.com/mypage/lessonView/",
      "https://www.ybmedu.com/mypage/lessonView/short",
      "https://www.ybmedu.com/mypage/lessonList",
      `https://blog.naver.com/mypage/lessonView/${TOKEN}`,
      `https://ybmedu.com.evil.example/mypage/lessonView/${TOKEN}`,
      `https://evilybmedu.com/mypage/lessonView/${TOKEN}`,
      `https://www.ybmedu.com/mypage/lessonView/${"a".repeat(CLASS_MATERIAL_LINK_URL_MAX)}`,
    ]) {
      expect(parseReviewLink(u).ok, u).toBe(false);
    }
    const bad = parseReviewLink("https://www.ybmedu.com/seomyon/winnertoeic#tab_area06");
    expect(bad.ok === false && bad.error).toContain("https://www.ybmedu.com/mypage/lessonView/");
  });
  it("DB check(lecture_signups_review_url_check — 마지막 정의)와 같은 정규식 — 같은 주소에 같은 답", () => {
    const dir = "supabase/migrations";
    const sqls = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((f) => readFileSync(`${dir}/${f}`, "utf8"));
    const last = sqls.filter((t) => t.includes("add constraint lecture_signups_review_url_check")).at(-1) ?? "";
    const pattern = last.match(/review_url ~\* '([^']+)'/)?.[1];
    expect(pattern, "DB check 의 정규식을 못 찾음").toBeTruthy();
    expect(last).toMatch(new RegExp(`char_length\\(review_url\\) <= ${CLASS_MATERIAL_LINK_URL_MAX}\\b`));
    // POSIX 문자 묶음 → JS, ~* 는 대소문자를 가리지 않는다
    const sqlRe = new RegExp(pattern!.replace(/\[:space:\]/g, "\\s"), "i");
    const samples = [
      LINK,
      `https://m.ybmedu.com/mypage/lessonView/${TOKEN}`,
      `https://ybmedu.com/m/mypage/lessonview/${TOKEN}`,
      `http://www.ybmedu.com/mypage/lessonView/${TOKEN}#x`,
      `${LINK}?a=1&b=2`,
      `${LINK}/`,
      `${LINK}=`,
      "https://www.ybmedu.com/",
      "https://www.ybmedu.com/seomyon/winnertoeic#tab_area06",
      "https://www.ybmedu.com/mypage/lessonView/",
      "https://www.ybmedu.com/mypage/lessonView/short",
      `https://www.ybmedu.com/mypage/lessonView/${TOKEN}%20x`,
      `https://blog.naver.com/mypage/lessonView/${TOKEN}`,
      `https://ybmedu.com.evil.example/mypage/lessonView/${TOKEN}`,
      `https://evilybmedu.com/mypage/lessonView/${TOKEN}`,
      `https://ybmedu.com@evil.example/mypage/lessonView/${TOKEN}`,
    ];
    for (const u of samples) expect(isYbmReviewUrl(u), u).toBe(sqlRe.test(u));
    expect(samples.filter((u) => isYbmReviewUrl(u)).length).toBe(7);
    // 앱이 저장하는 주소는 늘 DB 를 통과한다
    for (const raw of [LINK, `www.ybmedu.com/mypage/lessonView/${TOKEN}`, `3/홍길동/750주5일/${LINK}`]) {
      const r = parseReviewLink(raw);
      expect(r.ok && sqlRe.test(r.url), raw).toBe(true);
    }
    expect(YBM_REVIEW_LINK_RE.flags).toContain("i");
  });
});

describe("reviewLinkKey — 후기 링크는 한 번만 (2026-10-08 Alan \"후기막기 진행해주고\")", () => {
  // 지어낸 토큰이다 — 실제 학생 링크는 저장소에 넣지 않는다
  const TOKEN = "Ab3dEf-hIjKlMn_pQrStUv";
  const LINK = `https://www.ybmedu.com/mypage/lessonView/${TOKEN}`;

  it("같은 후기면 주소 앞자리 · 꼬리 · 대소문자 · 끝의 = 가 달라도 같은 키", () => {
    const key = reviewLinkKey(LINK);
    expect(key).toBe(TOKEN.toLowerCase());
    for (const u of [
      `https://m.ybmedu.com/mypage/lessonView/${TOKEN}`,
      `http://ybmedu.com/m/mypage/lessonview/${TOKEN.toUpperCase()}`,
      `${LINK}?utm_source=share`,
      `${LINK}#top`,
      `${LINK}/`,
      `${LINK}==`,
    ]) {
      expect(reviewLinkKey(u), u).toBe(key);
    }
  });
  it("다른 후기는 다른 키, 토큰이 없으면 null", () => {
    expect(reviewLinkKey(`https://www.ybmedu.com/mypage/lessonView/${TOKEN}x`)).not.toBe(reviewLinkKey(LINK));
    expect(reviewLinkKey("https://www.ybmedu.com/mypage/lessonView/Zz9yXw-vUtSrQp_oNmLkJi")).not.toBe(reviewLinkKey(LINK));
    for (const u of [null, undefined, "", "https://www.ybmedu.com/", "https://www.ybmedu.com/mypage/lessonView/short", "https://www.ybmedu.com/mypage/lessonView/=========="]) {
      expect(reviewLinkKey(u), String(u)).toBeNull();
    }
  });
  it("DB(private.review_link_key — 마지막 정의)와 같은 규칙 — SQL 의 정규식으로 같은 답", () => {
    const dir = "supabase/migrations";
    const sqls = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((f) => readFileSync(`${dir}/${f}`, "utf8"));
    const last = sqls.filter((t) => t.includes("function private.review_link_key(")).at(-1) ?? "";
    const start = last.indexOf("function private.review_link_key(");
    const fn = last.slice(start, last.indexOf("$$;", start));
    const m = fn.match(/regexp_match\(p_url, '([^']+)', 'i'\)/);
    expect(m, "SQL 의 정규식을 못 찾음").toBeTruthy();
    expect(fn).toContain("rtrim(");
    expect(fn).toContain("'='))");
    expect(fn).toContain("lower(");
    expect(fn).toContain("nullif(");
    // SQL 을 JS 로 옮긴 것: lower(rtrim(첫 토큰, '=')), 빈 문자열이면 null
    const sqlKey = (u: string) => {
      const t = u.match(new RegExp(m![1], "i"))?.[1];
      return t === undefined ? null : t.replace(/=+$/, "").toLowerCase() || null;
    };
    for (const u of [
      LINK,
      `${LINK}==`,
      `https://M.YBMEDU.COM/MYPAGE/LESSONVIEW/${TOKEN}?x=1`,
      `https://www.ybmedu.com/a/lessonView/${TOKEN}/lessonView/Zz9yXw-vUtSrQp_oNmLkJi`,
      "https://www.ybmedu.com/mypage/lessonView/short",
      "https://www.ybmedu.com/mypage/lessonView/==========",
      "https://www.ybmedu.com/",
    ]) {
      expect(reviewLinkKey(u), u).toBe(sqlKey(u));
    }
  });
  it("신청을 넣을 때 트리거가 키로 막는다 — 다른 학생의 링크 · 다른 달에 쓴 내 링크 · 같은 링크 동시 신청", () => {
    const dir = "supabase/migrations";
    const sqls = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((f) => readFileSync(`${dir}/${f}`, "utf8"));
    const last = sqls.filter((t) => t.includes("function private.lecture_signups_review_check(")).at(-1) ?? "";
    const start = last.indexOf("function private.lecture_signups_review_check(");
    const fn = last.slice(start, last.indexOf("$$;", start));
    expect(fn).toContain("'review_link_required'");
    expect(fn).toContain("'review_link_taken'");
    expect(fn).toContain("'review_link_reused'");
    expect(fn).toContain("pg_advisory_xact_lock(");
    expect(fn).toContain("s.user_id <> new.user_id");
    expect(fn).toContain("l.term_id <> n.term_id");
    expect(fn.match(/private\.review_link_key\(s\.review_url\) = v_key/g)?.length).toBe(2);
    // 서버 액션이 셋 다 학생 말로 바꾼다
    for (const code of ["review_link_required", "review_link_taken", "review_link_reused"]) expect(reviewLinkError(code), code).toBeTruthy();
    expect(reviewLinkError("lecture_full")).toBeNull();
  });
});

/**
 * 단과 학생은 제 과목 특강만 (2026-10-12 Alan — "특강신청에서 RC 단과반은 LC특강신청이 안되고, LC단과는 RC특강신청이 안되도록").
 * 반이 주는 과목은 학생명단 이름표(singleSubjectOf)와 같은 읽기이고, DB private.lecture_subjects_of · 트리거 lecture_signups_eligible_subject 와 같은 규칙이다.
 */
describe("단과 학생은 제 과목 특강만 — sectionSubjects · lectureSubjectBlock", () => {
  const score = { course_type: "full", program: "score" };
  const rcUnit = { subject: "rc", course: score };
  const lcUnit = { subject: "lc", course: score };
  const bundle = { subject: null, course: score }; // 120 · 140분 묶음 · 방학달 통짜 — 두 과목을 이어 듣는다
  const sparta = { subject: null, course: { course_type: "full", program: "sparta" } };
  const twoweek = { subject: null, course: { course_type: "full", program: "twoweek" } };
  const mine = (...sections: Parameters<typeof sectionSubjects>[0][]) => new Set(sections.flatMap(sectionSubjects));

  it("반이 주는 과목 — 시간 단위 반은 과목 칸, 단과 상품은 그 과목, 그릇 반 · 과목 칸이 빈 반은 두 과목", () => {
    expect(sectionSubjects(rcUnit)).toEqual(["rc"]);
    expect(sectionSubjects(lcUnit)).toEqual(["lc"]);
    expect(sectionSubjects({ subject: "lc", course: { course_type: "rc", program: "score" } })).toEqual(["rc"]);
    expect(sectionSubjects(bundle).sort()).toEqual(["lc", "rc"]);
    expect(sectionSubjects(sparta).sort()).toEqual(["lc", "rc"]);
    expect(sectionSubjects(twoweek).sort()).toEqual(["lc", "rc"]);
    expect(sectionSubjects({ subject: "x", course: score }).sort()).toEqual(["lc", "rc"]); // 모르는 값은 짐작해 막지 않는다
  });

  it("RC 단과는 LC특강 · LC 단과는 RC특강을 못 한다 — 과목이 든 특강은 그 과목을 들어야 한다", () => {
    expect(lectureSubjectBlock(["lc"], mine(rcUnit))).toEqual(["lc"]);
    expect(lectureSubjectBlock(["rc"], mine(rcUnit))).toEqual([]);
    expect(lectureSubjectBlock(["rc"], mine(lcUnit))).toEqual(["rc"]);
    expect(lectureSubjectBlock(["rc", "mock2"], mine(lcUnit))).toEqual(["rc"]); // RC특강 + 2차 모의고사도 LC 단과에게는 막힌다
    expect(lectureSubjectBlock(["rc", "mock2"], mine(rcUnit))).toEqual([]);
    // 녹화영상 신청도 그 과목이다 (2026-10-15)
    expect(lectureSubjectBlock(["lc_video"], mine(rcUnit))).toEqual(["lc"]);
    expect(lectureSubjectBlock(["rc_video"], mine(lcUnit))).toEqual(["rc"]);
    expect(lectureSubjectBlock(["rc_video"], mine(rcUnit))).toEqual([]);
  });

  it("모의고사만인 특강은 누구나 · 종합(두 과목) · 속성반 · 2주완성 · 묶음 · 단과 둘을 함께 듣는 학생은 막히지 않는다", () => {
    expect(lectureSubjectBlock(["mock1"], mine(rcUnit))).toEqual([]);
    expect(lectureSubjectBlock(["mock2_paper"], mine(lcUnit))).toEqual([]);
    expect(lectureSubjectBlock(["mock1_pdf"], mine(rcUnit))).toEqual([]);
    expect(lectureSubjectBlock(["mock2_pdf"], mine(lcUnit))).toEqual([]);
    expect(lectureSubjectBlock([], mine(lcUnit))).toEqual([]);
    expect(lectureSubjectBlock(null, mine(lcUnit))).toEqual([]);
    for (const s of [bundle, sparta, twoweek]) {
      expect(lectureSubjectBlock(["lc"], mine(s))).toEqual([]);
      expect(lectureSubjectBlock(["rc"], mine(s))).toEqual([]);
    }
    expect(lectureSubjectBlock(["lc"], mine(rcUnit, lcUnit))).toEqual([]); // 주5일 60분 · 650 RC 단과 + 750 LC 단과
  });

  it("내 과목을 모르면(빈 집합) 막지 않는다 — 그때는 DB 정책(lecture_signup_open)이 막는다", () => {
    expect(lectureSubjectBlock(["lc"], new Set())).toEqual([]);
  });

  it("문구 — 'RC 단과 수강생은 LC특강을 신청할 수 없어요'", () => {
    expect(lectureSubjectNote(["lc"], mine(rcUnit))).toBe("RC 단과 수강생은 LC특강을 신청할 수 없어요.");
    expect(lectureSubjectNote(["rc"], mine(lcUnit))).toBe("LC 단과 수강생은 RC특강을 신청할 수 없어요.");
    expect(lectureSubjectNote(lectureSubjectBlock(["lc_video"], mine(rcUnit)), mine(rcUnit))).toBe("RC 단과 수강생은 LC특강을 신청할 수 없어요.");
    expect(LECTURE_SUBJECT_ERROR).toContain("RC 단과는 RC 특강");
  });

  it("DB(private.lecture_subjects_of — 마지막 정의)와 같은 규칙 · 트리거가 review 검사보다 먼저 · 서버 액션이 오류를 말로 바꾼다", () => {
    const dir = "supabase/migrations";
    const sqls = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((f) => readFileSync(`${dir}/${f}`, "utf8"));
    const last = sqls.filter((t) => t.includes("function private.lecture_subjects_of(")).at(-1) ?? "";
    const start = last.indexOf("function private.lecture_subjects_of(");
    const fn = last.slice(start, last.indexOf("$$;", start));
    expect(fn).toContain("when c.course_type in ('lc', 'rc') then array[c.course_type]"); // 단과 상품 = 그 과목
    expect(fn).toContain("when c.program <> 'score' or s.subject is null then array['lc', 'rc']"); // 그릇 반 · 과목 칸 없음 = 두 과목
    expect(fn).toContain("when s.subject in ('lc', 'rc') then array[s.subject]"); // 시간 단위 반 = 과목 칸
    expect(fn).toContain("else array['lc', 'rc']"); // 모르는 값은 막지 않는다
    // 그 달 수강 중인 직접 배정만 — is_term_enrollee 와 같은 조건
    expect(fn).toContain("e.status = 'active'");
    expect(fn).toContain("o.status = 'active'");
    expect(fn).toContain("private.today_kst() between s.enrollment_opens_at and s.closes_at");
    const all = sqls.join("\n");
    expect(all).toMatch(/before insert on public\.lecture_signups[\s\S]*?lecture_signups_eligible_subject/);
    expect(all).toContain("raise exception 'lecture_subject_mismatch'");
    // BEFORE INSERT 트리거는 이름순으로 돈다 — 과목 검사가 후기 링크 검사보다 먼저여야 "링크를 올려라" 가 먼저 뜨지 않는다
    expect("lecture_signups_eligible_subject" < "lecture_signups_review_check").toBe(true);
    expect(readFileSync("src/app/my/class/actions.ts", "utf8")).toContain('error.message === "lecture_subject_mismatch"');
  });
});
