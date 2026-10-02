import { describe, expect, it } from "vitest";
import { loginLine, newestLogin } from "./account";

/** 계정 합치기 — 최근 로그인 계정 표시 (2026-10-02 Alan) */
describe("newestLogin", () => {
  it("마지막 접속이 가장 늦은 계정을 고른다", () => {
    expect(
      newestLogin([
        { id: "a", lastSignInAt: "2026-09-16T01:00:00Z" },
        { id: "b", lastSignInAt: "2026-10-02T05:00:00Z" },
      ]),
    ).toBe("b");
  });

  it("접속 기록이 없는 계정은 뽑지 않고, 전부 없으면 null", () => {
    expect(newestLogin([{ id: "a", lastSignInAt: null }, { id: "b", lastSignInAt: "2026-10-01T00:00:00Z" }])).toBe("b");
    expect(newestLogin([{ id: "a", lastSignInAt: null }, { id: "b", lastSignInAt: undefined }])).toBe(null);
    expect(newestLogin([])).toBe(null);
  });

  it("같은 시각이면 앞의 것", () => {
    expect(newestLogin([{ id: "a", lastSignInAt: "2026-10-01T00:00:00Z" }, { id: "b", lastSignInAt: "2026-10-01T00:00:00Z" }])).toBe("a");
  });
});

describe("loginLine", () => {
  it("로그인 방법과 마지막 접속을 한 줄로", () => {
    expect(loginLine(["kakao"], "2026-10-01T03:00:00Z", "2026-10-02")).toBe("카카오 · 어제 로그인");
    expect(loginLine(["email", "google"], "2026-10-02T03:00:00Z", "2026-10-02")).toBe("이메일 · 구글 · 오늘 로그인");
  });

  it("방법을 모르면 이메일로, 접속 기록이 없으면 그렇게 적는다", () => {
    expect(loginLine([], null, "2026-10-02")).toBe("이메일 · 로그인 기록 없음");
  });
});
