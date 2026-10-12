import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CLASS_MATERIAL_LINK_URL_MAX } from "./class-materials";
import {
  ddayLabel,
  isYbmReviewUrl,
  kstDateOf,
  lectureCameo,
  LECTURE_SUBJECT_ERROR,
  lectureOpensAt,
  lectureState,
  lectureSubjectBlock,
  lectureSubjectNote,
  lectureWeek,
  needsReviewLink,
  parseReviewLink,
  REVIEW_LECTURE_KINDS,
  reviewLinkError,
  reviewLinkKey,
  REVIEW_LECTURE_WEEK,
  sectionSubjects,
  shiftDate,
  signupDday,
  YBM_REVIEW_LINK_RE,
} from "./lecture";

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
  it("이혜영 LC특강은 헤드폰 노트 컷, 모의고사만이면 윙크 가리키기", () => {
    expect(lectureCameo("이혜영", ["lc", "mock2"])?.pose).toBe("notebook");
    expect(lectureCameo("이혜영", ["mock1"])?.pose).toBe("point");
  });
  it("이영수 RC특강은 태블릿 컷, 모의고사만이면 엄지척", () => {
    expect(lectureCameo("이영수", ["rc", "mock1"])?.pose).toBe("tablet");
    expect(lectureCameo("이영수", ["mock2"])?.pose).toBe("thumbsup");
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

describe("needsReviewLink — 3주차 모의고사 특강은 YBM 수강후기 링크를 올려야 신청된다 (2026-10-08 Alan)", () => {
  it("개강일이 든 주(월요일 시작)가 1주차 — 지금까지 달마다 2차 모의고사 날이 3주차다", () => {
    // 10월 10/6(화) 개강 — 10/17 1차 모의고사 · 10/24 RC특강 + 2차 모의고사 · 10/30 LC특강
    expect(needsReviewLink({ date: "2026-10-17", kinds: ["mock1"] }, "2026-10-06")).toBe(false);
    expect(needsReviewLink({ date: "2026-10-24", kinds: ["rc", "mock2"] }, "2026-10-06")).toBe(true);
    expect(needsReviewLink({ date: "2026-10-30", kinds: ["lc"] }, "2026-10-06")).toBe(false);
    // 9월 9/3(목) 개강 — 9/12 RC특강 + 1차 · 9/19 LC특강 + 2차
    expect(needsReviewLink({ date: "2026-09-12", kinds: ["rc", "mock1"] }, "2026-09-03")).toBe(false);
    expect(needsReviewLink({ date: "2026-09-19", kinds: ["lc", "mock2"] }, "2026-09-03")).toBe(true);
    // 7월 7/3(금) 개강 — 7/11 1차 · 7/18 RC특강 + 2차 · 7/25 LC특강
    expect(needsReviewLink({ date: "2026-07-11", kinds: ["mock1"] }, "2026-07-03")).toBe(false);
    expect(needsReviewLink({ date: "2026-07-18", kinds: ["rc", "mock2"] }, "2026-07-03")).toBe(true);
    expect(needsReviewLink({ date: "2026-07-25", kinds: ["lc"] }, "2026-07-03")).toBe(false);
    // 8월 8/4(화) 개강 — 8/8 1차(개강 주) · 8/22 RC특강 + 2차 · 8/29 LC특강
    expect(needsReviewLink({ date: "2026-08-08", kinds: ["mock1"] }, "2026-08-04")).toBe(false);
    expect(needsReviewLink({ date: "2026-08-22", kinds: ["rc", "mock2"] }, "2026-08-04")).toBe(true);
    expect(needsReviewLink({ date: "2026-08-29", kinds: ["lc"] }, "2026-08-04")).toBe(false);
  });
  it("주는 월요일에 바뀐다 — 일요일은 앞 주, 월요일은 다음 주", () => {
    expect(lectureWeek("2026-10-06", "2026-10-06")).toBe(1);
    expect(lectureWeek("2026-10-18", "2026-10-06")).toBe(2);
    expect(lectureWeek("2026-10-19", "2026-10-06")).toBe(3);
    expect(lectureWeek("2026-10-25", "2026-10-06")).toBe(3);
    expect(lectureWeek("2026-10-26", "2026-10-06")).toBe(4);
    expect(lectureWeek("2026-10-04", "2026-10-06")).toBe(0);
    expect(lectureWeek("2026-11-02", "2026-10-06")).toBe(5);
  });
  it("모의고사가 없거나 개강일을 모르면 아니다", () => {
    expect(needsReviewLink({ date: "2026-10-21", kinds: ["lc"] }, "2026-10-06")).toBe(false);
    expect(needsReviewLink({ date: "2026-10-24", kinds: [] }, "2026-10-06")).toBe(false);
    expect(needsReviewLink({ date: "2026-10-24", kinds: null }, "2026-10-06")).toBe(false);
    expect(needsReviewLink({ date: "2026-10-24", kinds: ["mock2"] }, null)).toBe(false);
  });
  it("DB(private.lecture_needs_review — 마지막 정의)와 같은 규칙: 주차 · 종류, 링크 칸 길이는 수업자료실 링크와 같다", () => {
    const dir = "supabase/migrations";
    const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    const sqls = files.map((f) => readFileSync(`${dir}/${f}`, "utf8"));
    const last = sqls.filter((t) => t.includes("function private.lecture_needs_review(")).at(-1) ?? "";
    const start = last.indexOf("function private.lecture_needs_review(");
    const fn = last.slice(start, last.indexOf("$$;", start));
    expect(fn).toMatch(new RegExp(`\\/ 7 \\+ 1 = ${REVIEW_LECTURE_WEEK}\\b`));
    expect(fn).toContain("isodow");
    const kinds = fn.match(/array\[([^\]]+)\]::text\[\]/)?.[1].split(",").map((k) => k.trim().replace(/'/g, ""));
    expect(kinds).toEqual([...REVIEW_LECTURE_KINDS]);
    const check = sqls.filter((t) => t.includes("lecture_signups_review_url_check")).at(-1) ?? "";
    expect(check).toMatch(new RegExp(`char_length\\(review_url\\) <= ${CLASS_MATERIAL_LINK_URL_MAX}\\b`));
    // 넣을 때 트리거가 막는다 — 오류 이름은 서버 액션이 학생 말로 바꾼다
    expect(sqls.join("\n")).toMatch(/before insert on public\.lecture_signups[\s\S]*?lecture_signups_review_check/);
    expect(readFileSync("src/app/my/class/actions.ts", "utf8")).toContain("reviewLinkError(error.message)");
    expect(reviewLinkError("review_link_required")).toContain("링크를 올려야");
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
  });

  it("모의고사만인 특강은 누구나 · 종합(두 과목) · 속성반 · 2주완성 · 묶음 · 단과 둘을 함께 듣는 학생은 막히지 않는다", () => {
    expect(lectureSubjectBlock(["mock1"], mine(rcUnit))).toEqual([]);
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
