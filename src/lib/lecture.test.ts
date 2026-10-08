import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CLASS_MATERIAL_LINK_URL_MAX } from "./class-materials";
import {
  ddayLabel,
  isYbmReviewUrl,
  kstDateOf,
  lectureCameo,
  lectureOpensAt,
  lectureState,
  lectureWeek,
  needsReviewLink,
  parseReviewLink,
  REVIEW_LECTURE_KINDS,
  REVIEW_LECTURE_WEEK,
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
    expect(readFileSync("src/app/my/class/actions.ts", "utf8")).toContain('"review_link_required"');
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
