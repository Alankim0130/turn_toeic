import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { absentCount, ATTENDANCE_STATUS, attendanceRate, attendUrl, scanView, tokenFromQr } from "./attendance";

describe("내 출석률", () => {
  const base = { late: 0, absent: 0, missing: 0 };
  it("주5일 20회 중 끝난 5회에 4회 출석 → 출석률 80% · 채움 20% · 남은 15회", () => {
    expect(attendanceRate({ ...base, total: 20, past: 5, present: 4 })).toEqual({ rate: 80, fill: 20, left: 15 });
  });
  it("아직 끝난 수업이 없으면 출석률은 없다 (0% 로 적지 않는다)", () => {
    expect(attendanceRate({ ...base, total: 10, past: 0, present: 0 })).toEqual({ rate: null, fill: 0, left: 10 });
  });
  it("어떤 경우에도 100% 를 넘지 않는다", () => {
    expect(attendanceRate({ ...base, total: 10, past: 5, present: 6 }).rate).toBe(100);
  });
  it("한 달을 다 채우면 100%", () => {
    expect(attendanceRate({ ...base, total: 10, past: 10, present: 10 })).toEqual({ rate: 100, fill: 100, left: 0 });
  });
});

describe("출석 결과 문구 (attendance_scan 의 action 마다) — 한 번 찍으면 출석 (2026-10-10)", () => {
  it("정시 · 지각", () => {
    expect(scanView({ action: "check_in", label: "650+ 월수금 10:00~12:10", at: "09:55", late: false, starts: "10:00" })).toMatchObject({ tone: "success", title: "출석했어요" });
    expect(scanView({ action: "check_in", at: "10:00", late: true, starts: "10:00" })).toMatchObject({ tone: "warning", title: "출석했어요 (지각)" });
    expect(scanView({ action: "check_in", at: "10:00", late: true, starts: "10:00" }).body).toContain("10:00에 시작");
    expect(scanView({ action: "check_in", at: "09:55", late: false, starts: "10:00" }).body).toContain("나갈 때는 안 찍어도");
  });
  it("제대로 찍히면 크게 \"출석!\" (정시 · 지각), 아니면 크게 띄우지 않는다", () => {
    expect(scanView({ action: "check_in", at: "09:55" }).headline).toBe("출석!");
    expect(scanView({ action: "check_in", at: "10:12", late: true, starts: "10:00" }).headline).toBe("출석!");
    for (const a of ["already_done", "too_early", "class_over", "no_class_today", "bad_token", "login_required"]) expect(scanView({ action: a }).headline, a).toBeUndefined();
  });
  it("다시 찍으면 '이미 출석' — 찍은 시각과 지각 표시, 선생님이 처리한 수업은 그 말로", () => {
    expect(scanView({ action: "already_done", label: "650+ 월수금 10:00~11:00", at: "10:02", late: true, status: "present" })).toMatchObject({ tone: "info", title: "이미 출석했어요" });
    expect(scanView({ action: "already_done", at: "10:02", late: true, status: "present" }).body).toContain("10:02에 찍었어요 (지각)");
    expect(scanView({ action: "already_done", at: "09:58", late: false, status: "present" }).body).not.toContain("지각");
    expect(scanView({ action: "already_done", status: "absent" }).title).toContain("결석");
    expect(scanView({ action: "already_done", status: "manual" }).title).toContain("출석으로 인정");
    expect(scanView({ action: "already_done" }).title).toBe("이미 처리된 수업이에요");
  });
  it("대상이 아닌 경우를 가려 말한다", () => {
    expect(scanView({ action: "live_student" }).title).toContain("불라방");
    expect(scanView({ action: "recorded_day" }).title).toContain("인강");
    expect(scanView({ action: "not_started" }).title).toContain("개강 전");
    expect(scanView({ action: "too_early", opens: "09:30" }).body).toContain("09:30");
    expect(scanView({ action: "class_over" }).body).toContain("끝나기 전까지만");
  });
  it("퇴실 · 입실만은 더 없다 — 옛 결과 이름은 모르는 결과로 본다", () => {
    expect(scanView({ action: "check_out", at: "12:11" }).title).toBe("출석을 처리하지 못했어요");
    expect(scanView({ action: "already_in", at: "10:02" }).title).toBe("출석을 처리하지 못했어요");
    expect(Object.keys(ATTENDANCE_STATUS).sort()).toEqual(["absent", "manual", "none", "present", "upcoming"]);
  });
  it("결석은 한 단어 — 선생님이 정한 결석과 끝났는데 안 찍음이 같은 말 · 같은 색, 아직 안 끝난 수업은 예정 (2026-10-10 Alan \"합쳐줘\")", () => {
    expect(ATTENDANCE_STATUS.none).toEqual(ATTENDANCE_STATUS.absent);
    expect(ATTENDANCE_STATUS.absent.label).toBe("결석");
    expect(ATTENDANCE_STATUS.upcoming.label).toBe("예정");
    expect(absentCount({ absent: 1, missing: 2 })).toBe(3);
  });
  it("모르는 결과도 문구가 있다", () => {
    expect(scanView({ action: "something_new" }).tone).toBe("warning");
  });
  it("모든 결과 이름이 문구를 가진다 (SQL 의 action 목록)", () => {
    const actions = ["check_in", "already_done", "too_early", "class_over", "no_class_today", "live_student", "recorded_day", "not_started", "bad_token", "too_many", "login_required"];
    for (const a of actions) expect(scanView({ action: a }).title, a).not.toBe("출석을 처리하지 못했어요");
  });
});

describe("DB 함수 attendance_scan 의 규칙 — 마지막 마이그레이션 (2026-10-10 Alan: 한 번만 · 1초라도 늦으면 지각)", () => {
  const DIR = "supabase/migrations";
  const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
  /** 그 함수를 마지막으로 정의한 파일의 본문 (create … $$ … $$;) — comment on · grant 줄이 아니라 create 문부터 */
  const lastDef = (name: string) => {
    const re = () => new RegExp(`create (or replace )?function public\\.${name}\\(`, "g");
    const f = [...files].reverse().find((x) => re().test(readFileSync(join(DIR, x), "utf8")));
    expect(f, name).toBeDefined();
    const sql = readFileSync(join(DIR, f!), "utf8");
    const start = [...sql.matchAll(re())].at(-1)!.index;
    const end = sql.indexOf("\n$$;", start);
    return sql.slice(start, end);
  };

  it("한 번 찍으면 present — 퇴실 · 입실만(in · out)이 없고, 지각은 수업 시작 시각을 1초라도 지났을 때", () => {
    const body = lastDef("attendance_scan");
    expect(body).toContain("'present'");
    expect(body).toContain("v_late := v_kst > v_target.starts;");
    expect(body).not.toContain("interval '7 minutes'");
    expect(body).not.toMatch(/status = 'in'|'out'|check_out_at|already_in/);
    // 찍을 수 있는 때는 시작 30분 전 ~ 끝 (안내 문구 · 포스터의 "30분 전" 과 같은 숫자)
    expect(body).toContain("v_kst between x.starts - interval '30 minutes' and x.ends\n");
  });

  it("상태 값 셋 — present · manual · absent", () => {
    const f = [...files].reverse().find((x) => readFileSync(join(DIR, x), "utf8").includes("attendance_stamps_status_check check"));
    expect(readFileSync(join(DIR, f!), "utf8")).toContain("check (status in ('present', 'manual', 'absent'))");
  });

  it("'끝난 수업' = 수업 끝 — 세 함수 모두 (퇴실 마감 30분은 없다)", () => {
    for (const name of ["attendance_term_board", "my_attendance_days", "my_attendance_summary"]) {
      const body = lastDef(name);
      expect(body, name).toMatch(/time_block_end\((en|en)\.time_block\) <= v_now/);
      expect(body, name).not.toContain("interval '30 minutes'");
      expect(body, name).not.toMatch(/'in'|'out'/);
    }
    expect(lastDef("my_attendance_summary")).toContain("st.status in ('present', 'manual')");
  });
});

describe("찍은 QR → 출석 토큰 (앱 안 카메라)", () => {
  it("우리 출석 주소면 토큰", () => {
    expect(tokenFromQr("https://winnertoeic.com/attend?t=C880319A361AE7F5EF8D")).toBe("C880319A361AE7F5EF8D");
    expect(tokenFromQr("  http://localhost:3000/attend/?t=ABCDEF0123456789ABCD \n")).toBe("ABCDEF0123456789ABCD");
  });
  it("다른 QR 은 null", () => {
    expect(tokenFromQr("https://winnertoeic.com/my?t=C880319A361AE7F5EF8D")).toBeNull();
    expect(tokenFromQr("https://example.com/attend")).toBeNull();
    expect(tokenFromQr("출석")).toBeNull();
    expect(tokenFromQr("https://winnertoeic.com/attend?t=abc")).toBeNull();
  });
});

describe("QR 주소", () => {
  it("사이트 주소 끝의 / 를 떼고 토큰을 붙인다", () => {
    expect(attendUrl("https://winnertoeic.com/", "AB12CD34EF56")).toBe("https://winnertoeic.com/attend?t=AB12CD34EF56");
  });
});
