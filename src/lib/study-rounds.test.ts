import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { classDayRounds, MATERIAL_ROUND_MAX, onlineSignupPhase, onlineStudyWindow, roundRowCount, shortDay } from "./study-rounds";

describe("비대면 자료 회차 = 그 달 수업일 순서", () => {
  it("월수금 · 화목금을 합쳐 날짜순 (1회차 = 첫 수업일)", () => {
    // 9월: 화목금 9/3(목) · 월수금 9/4(금) · 화목금 9/8(화) · 월수금 9/7(월)
    expect(classDayRounds(["2026-09-04", "2026-09-03", "2026-09-08", "2026-09-07"])).toEqual(["2026-09-03", "2026-09-04", "2026-09-07", "2026-09-08"]);
  });

  it("같은 날은 하루로 센다", () => {
    expect(classDayRounds(["2026-09-03", "2026-09-03", "2026-09-04"])).toEqual(["2026-09-03", "2026-09-04"]);
  });

  it("개강일~종강일 밖 수업일은 회차가 아니다", () => {
    expect(classDayRounds(["2026-09-02", "2026-09-03", "2026-10-04"], { opens: "2026-09-03", closes: "2026-10-03" })).toEqual(["2026-09-03"]);
  });
});

describe("관리자 화면 회차 줄 수", () => {
  it("수업일 수와 올린 회차 중 큰 쪽 + 빈 줄 하나", () => {
    expect(roundRowCount(19, 0)).toBe(20);
    expect(roundRowCount(19, 22)).toBe(23);
    expect(roundRowCount(0, 0)).toBe(1);
  });
  it("끝(60회차)을 넘지 않는다", () => {
    expect(roundRowCount(70, 0)).toBe(MATERIAL_ROUND_MAX);
  });
});

describe("비대면 스터디 — 개강일부터 달력 3일 신청, 4일째 시작 (2026-10-05 Alan)", () => {
  it("10/6(화) 개강 → 10/6 · 10/7 · 10/8 신청, 10/9(금) 시작", () => {
    expect(onlineStudyWindow("2026-10-06")).toEqual({ signupFrom: "2026-10-06", signupUntil: "2026-10-08", startsOn: "2026-10-09" });
  });

  it("주말도 센다 — 금요일 개강이면 금 · 토 · 일 신청, 월요일 시작", () => {
    expect(onlineStudyWindow("2026-07-03")).toEqual({ signupFrom: "2026-07-03", signupUntil: "2026-07-05", startsOn: "2026-07-06" });
  });

  it("달이 넘어가도 날짜로 센다", () => {
    expect(onlineStudyWindow("2026-09-29")).toEqual({ signupFrom: "2026-09-29", signupUntil: "2026-10-01", startsOn: "2026-10-02" });
  });

  it("날짜는 10/6(화) 꼴로 적는다", () => {
    expect(shortDay("2026-10-06")).toBe("10/6(화)");
    expect(shortDay("2026-10-09")).toBe("10/9(금)");
  });

  it("신청 전 · 받는 중 · 끝", () => {
    expect(onlineSignupPhase("2026-10-06", "2026-10-05")).toBe("before");
    expect(onlineSignupPhase("2026-10-06", "2026-10-06")).toBe("open");
    expect(onlineSignupPhase("2026-10-06", "2026-10-08")).toBe("open");
    expect(onlineSignupPhase("2026-10-06", "2026-10-09")).toBe("after");
    expect(onlineSignupPhase(null, "2026-10-09")).toBeNull();
  });

  it("1회차 = 시작일(개강일+3) 이후 첫 수업일 — 개강 주 수업일은 회차가 아니다", () => {
    // 10월: 화목금 10/6(화) · 월수금 10/7(수) · 화목금 10/8(목) · 월수금 10/9(금) · 10/12(월) …
    const dates = ["2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-12", "2026-10-13"];
    const { startsOn } = onlineStudyWindow("2026-10-06");
    expect(classDayRounds(dates, { opens: startsOn, closes: "2026-10-31" })).toEqual(["2026-10-09", "2026-10-12", "2026-10-13"]);
  });

  /** 마이그레이션을 파일 순서대로 읽어 그 함수 · 정책의 마지막 모양을 꺼낸다 (migrations.test.ts 가 재생 자체를 본다) */
  const dir = join(process.cwd(), "supabase/migrations");
  const sql = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(join(dir, f), "utf8"))
    .join("\n");
  const lastBody = (re: RegExp) => {
    const all = [...sql.matchAll(re)];
    return all.at(-1)?.[0] ?? "";
  };

  it("DB 도 같은 숫자다 — 신청은 개강일 ~ +2, 회차는 개강일+3 부터", () => {
    const open = lastBody(/create or replace function private\.study_signup_open[\s\S]*?\$\$;/g);
    expect(open).toContain("t.enrollment_opens_at and t.enrollment_opens_at + 2");
    const days = lastBody(/create or replace function private\.online_study_days[\s\S]*?\$\$;/g);
    expect(days).toContain("c.date >= t.enrollment_opens_at + 3");
    const sync = lastBody(/create or replace function private\.sync_online_materials[\s\S]*?\$\$;/g);
    expect(sync).toContain("private.online_study_days(r.term_id)");
    expect(sync).not.toContain("private.term_class_days(");
  });

  it("신청 · 시간대 변경 · 본인 취소 정책이 신청 기간을 본다", () => {
    for (const name of ["study_signups: 수강생 신청", "study_signups: 본인 시간대 변경", "study_signups: 본인 취소·스태프·조교 정리"]) {
      const body = lastBody(new RegExp(`create policy "${name}"[\\s\\S]*?;\\n`, "g"));
      expect(body, name).toContain("private.study_signup_open(");
    }
  });
});
