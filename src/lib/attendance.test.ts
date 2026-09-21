import { describe, expect, it } from "vitest";
import { attendUrl, scanView } from "./attendance";

describe("출석 결과 문구 (attendance_scan 의 action 마다)", () => {
  it("입실 · 지각 · 퇴실", () => {
    expect(scanView({ action: "check_in", label: "650+ 월수금 10:00~12:10", at: "09:55", late: false, starts: "10:00" })).toMatchObject({ tone: "success", title: "입실했어요" });
    expect(scanView({ action: "check_in", at: "10:12", late: true, starts: "10:00" })).toMatchObject({ tone: "warning", title: "입실했어요 (지각)" });
    expect(scanView({ action: "check_out", at: "12:11", stay: 136 }).body).toContain("136분");
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

describe("QR 주소", () => {
  it("사이트 주소 끝의 / 를 떼고 토큰을 붙인다", () => {
    expect(attendUrl("https://winnertoeic.com/", "AB12CD34EF56")).toBe("https://winnertoeic.com/attend?t=AB12CD34EF56");
  });
});
