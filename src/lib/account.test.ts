import { describe, it, expect } from "vitest";
import { loginLabel, kstDay, shortDay, daysBetween, lastSeenLabel } from "./account";

describe("loginLabel — 로그인 방식", () => {
  it("provider 를 한국어로 바꾼다", () => {
    expect(loginLabel(["kakao"])).toBe("카카오");
    expect(loginLabel(["email"])).toBe("이메일");
    expect(loginLabel(["google"])).toBe("구글");
  });

  it("한 계정에 여러 개가 붙으면 모두 적는다 (같은 이메일이면 Supabase 가 이어 붙인다)", () => {
    expect(loginLabel(["email", "google"])).toBe("이메일 · 구글");
  });

  it("모르는 provider 는 그대로 둔다 — 새 로그인을 켜도 빈칸이 되지 않는다", () => {
    expect(loginLabel(["apple"])).toBe("apple");
  });

  it("없으면 빈 문자열 (화면에서 칸이 사라진다)", () => {
    expect(loginLabel([])).toBe("");
    expect(loginLabel(null)).toBe("");
    expect(loginLabel(undefined)).toBe("");
  });
});

describe("kstDay — 접속 시각을 한국 날짜로", () => {
  it("UTC 를 KST 로 옮겨 센다", () => {
    // 2026-09-17 15:30 UTC = 2026-09-18 00:30 KST → 18일이다
    expect(kstDay("2026-09-17T15:30:00Z")).toBe("2026-09-18");
    expect(kstDay("2026-09-17T14:00:00Z")).toBe("2026-09-17");
  });

  it("못 읽는 값은 빈 문자열", () => {
    expect(kstDay("어제")).toBe("");
  });
});

describe("shortDay", () => {
  it("앞의 0 을 떼고 점으로 잇는다", () => {
    expect(shortDay("2026-09-08")).toBe("2026.9.8");
    expect(shortDay("2026-12-25")).toBe("2026.12.25");
  });

  it("없으면 빈 문자열", () => {
    expect(shortDay(null)).toBe("");
    expect(shortDay("")).toBe("");
  });
});

describe("daysBetween", () => {
  it("달을 넘어가도 날 수로 센다", () => {
    expect(daysBetween("2026-09-18", "2026-09-18")).toBe(0);
    expect(daysBetween("2026-08-31", "2026-09-01")).toBe(1);
    expect(daysBetween("2026-09-01", "2026-09-18")).toBe(17);
  });
});

describe("lastSeenLabel — 최근 접속", () => {
  const today = "2026-09-18";

  it("오늘 · 어제 · N일 전", () => {
    expect(lastSeenLabel("2026-09-18T01:00:00+09:00", today)).toBe("오늘");
    expect(lastSeenLabel("2026-09-17T23:00:00+09:00", today)).toBe("어제");
    expect(lastSeenLabel("2026-09-16T09:00:00+09:00", today)).toBe("2일 전");
  });

  it("한 달이 넘으면 날짜로 적는다 — 'N일 전' 이 길어지면 읽기 어렵다", () => {
    expect(lastSeenLabel("2026-08-19T09:00:00+09:00", today)).toBe("2026.8.19");
    expect(lastSeenLabel("2026-08-20T09:00:00+09:00", today)).toBe("29일 전");
  });

  it("한 번도 접속하지 않았으면 빈 문자열", () => {
    expect(lastSeenLabel(null, today)).toBe("");
    expect(lastSeenLabel(undefined, today)).toBe("");
  });

  it("시계가 어긋나 접속이 오늘보다 뒤면 오늘로 본다 (음수 일 수를 적지 않는다)", () => {
    expect(lastSeenLabel("2026-09-19T09:00:00+09:00", today)).toBe("오늘");
  });
});
