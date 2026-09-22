import { describe, expect, it } from "vitest";
import { attendanceRate, attendUrl, scanView, tokenFromQr } from "./attendance";

describe("내 출석률", () => {
  const base = { late: 0, in_only: 0, absent: 0, missing: 0 };
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

describe("출석 결과 문구 (attendance_scan 의 action 마다)", () => {
  it("입실 · 지각 · 퇴실", () => {
    expect(scanView({ action: "check_in", label: "650+ 월수금 10:00~12:10", at: "09:55", late: false, starts: "10:00" })).toMatchObject({ tone: "success", title: "입실했어요" });
    expect(scanView({ action: "check_in", at: "10:12", late: true, starts: "10:00" })).toMatchObject({ tone: "warning", title: "입실했어요 (지각)" });
    expect(scanView({ action: "check_out", at: "12:11", stay: 136 }).body).toContain("136분");
  });
  it("제대로 찍히면 크게 \"출석!\" (입실 · 지각 · 퇴실), 아니면 크게 띄우지 않는다", () => {
    expect(scanView({ action: "check_in", at: "09:55" }).headline).toBe("출석!");
    expect(scanView({ action: "check_in", at: "10:12", late: true, starts: "10:00" }).headline).toBe("출석!");
    expect(scanView({ action: "check_out", at: "12:11", stay: 136 }).headline).toBe("출석!");
    for (const a of ["already_in", "already_done", "too_early", "class_over", "no_class_today", "bad_token", "login_required"]) expect(scanView({ action: a }).headline, a).toBeUndefined();
  });
  it("대상이 아닌 경우를 가려 말한다", () => {
    expect(scanView({ action: "live_student" }).title).toContain("불라방");
    expect(scanView({ action: "recorded_day" }).title).toContain("인강");
    expect(scanView({ action: "not_started" }).title).toContain("개강 전");
    expect(scanView({ action: "too_early", opens: "09:30" }).body).toContain("09:30");
  });
  it("모르는 결과도 문구가 있다", () => {
    expect(scanView({ action: "something_new" }).tone).toBe("warning");
  });
  it("모든 결과 이름이 문구를 가진다 (SQL 의 action 목록)", () => {
    const actions = ["check_in", "check_out", "already_in", "already_done", "too_early", "class_over", "no_class_today", "live_student", "recorded_day", "not_started", "bad_token", "too_many", "login_required"];
    for (const a of actions) expect(scanView({ action: a }).title, a).not.toBe("출석을 처리하지 못했어요");
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
