import { describe, expect, it } from "vitest";
import {
  ONLINE_REMINDER_LEAD_DAYS,
  onlineReminderText,
  onlineStudyReminders,
  reminderOpensRange,
  reminderPushLine,
  reminderLead,
  reminderRange,
  type ReminderStudy,
  type ReminderTerm,
} from "./online-study-reminder";
import { digestCountsLine, digestPush, DIGEST_TITLE } from "./daily-digest";

// 11월 기수: 11/4(수) 개강 → 신청 11/4 ~ 11/6(금) · 11/7 부터 시작 (2026-10-13 리허설 날짜)
const oct: ReminderTerm = { id: 10, year: 2026, month: 10, enrollment_opens_at: "2026-10-06" };
const nov: ReminderTerm = { id: 11, year: 2026, month: 11, enrollment_opens_at: "2026-11-04" };
const online = (term_id: number, status: string): ReminderStudy => ({ term_id, kind: "online", status });

describe("비대면 스터디를 열라는 알림 — 언제 서나 (2026-10-13 Alan \"비대면 스터디 올리라고 강사님에게 알려주면\")", () => {
  it("개강 7일 전부터 · 신청 마지막 날까지 — 그 밖에는 서지 않는다", () => {
    expect(ONLINE_REMINDER_LEAD_DAYS).toBe(7);
    const at = (today: string) => onlineStudyReminders([oct, nov], [online(10, "open")], today).map((r) => r.month);
    expect(at("2026-10-27")).toEqual([]); // 8일 전
    expect(at("2026-10-28")).toEqual([11]); // 7일 전
    expect(at("2026-11-03")).toEqual([11]); // 하루 전
    expect(at("2026-11-04")).toEqual([11]); // 개강일 = 신청 첫날
    expect(at("2026-11-06")).toEqual([11]); // 신청 마지막 날
    expect(at("2026-11-07")).toEqual([]); // 신청이 끝났다 — 할 수 있는 것이 없다
  });

  it("없음 · 준비 중이면 서고, 신청 받는 중 · 마감(일부러 닫음)이면 서지 않는다", () => {
    const today = "2026-11-01";
    expect(onlineStudyReminders([nov], [], today)).toEqual([{ termId: 11, year: 2026, month: 11, state: "missing", signupFrom: "2026-11-04", signupUntil: "2026-11-06" }]);
    expect(onlineStudyReminders([nov], [online(11, "draft")], today).map((r) => r.state)).toEqual(["draft"]);
    expect(onlineStudyReminders([nov], [online(11, "open")], today)).toEqual([]);
    expect(onlineStudyReminders([nov], [online(11, "closed")], today)).toEqual([]);
  });

  it("단어 스터디만 열려 있어도 비대면은 없는 것 — 종류를 가린다", () => {
    expect(onlineStudyReminders([nov], [{ term_id: 11, kind: "offline", status: "open" }], "2026-11-01").map((r) => r.state)).toEqual(["missing"]);
  });

  it("다른 달 스터디가 열려 있어도 그 달 것으로 보지 않는다", () => {
    expect(onlineStudyReminders([nov], [online(10, "open")], "2026-11-01").map((r) => r.month)).toEqual([11]);
  });

  it("개강일을 아직 안 정한 기수는 알리지 않는다 (열 스터디의 날짜가 없다)", () => {
    expect(onlineStudyReminders([{ ...nov, enrollment_opens_at: null }], [], "2026-11-01")).toEqual([]);
  });

  it("두 달이 함께 걸리면 개강일 순", () => {
    const dec: ReminderTerm = { id: 12, year: 2026, month: 12, enrollment_opens_at: "2026-11-08" };
    expect(onlineStudyReminders([dec, nov], [], "2026-11-05").map((r) => r.month)).toEqual([11, 12]);
  });

  it("DB 에서 읽는 개강일 범위 = 오늘 − 2 ~ 오늘 + 7 (위 규칙과 같은 끝)", () => {
    expect(reminderOpensRange("2026-11-01")).toEqual({ from: "2026-10-30", to: "2026-11-08" });
    expect(reminderOpensRange("2026-12-30")).toEqual({ from: "2026-12-28", to: "2027-01-06" }); // 연도 넘김
  });
});

describe("알림 글", () => {
  const missing = onlineStudyReminders([nov], [], "2026-11-01")[0];
  const draft = onlineStudyReminders([nov], [online(11, "draft")], "2026-11-01")[0];

  it("신청 기간을 날짜와 요일로", () => {
    expect(reminderRange(missing)).toBe("11/4(수) ~ 11/6(금)");
  });

  it("지금 어디쯤인가 — 개강 전 · 내일 · 신청 기간 · 마지막 날마다 다르게 서두른다", () => {
    expect(reminderLead(missing, "2026-11-01")).toBe("개강까지 3일 남았어요. 비대면 스터디는 개강일부터 사흘(11/4(수) ~ 11/6(금))만 신청을 받아서, 그 전에 열어 두어야 학생이 신청할 수 있어요.");
    expect(reminderLead(missing, "2026-11-03")).toMatch(/^내일 개강이에요\. /);
    // 신청 기간에는 '그 전에' 가 아니다 — 지금 열면 남은 날 동안
    expect(reminderLead(missing, "2026-11-04")).toBe("지금 비대면 신청 기간(11/4(수) ~ 11/6(금))인데 학생이 신청할 곳이 없어요. 지금 열면 남은 날 동안 신청을 받아요.");
    expect(reminderLead(missing, "2026-11-05")).not.toContain("그 전에");
    expect(reminderLead(missing, "2026-11-06")).toBe("오늘이 비대면 신청 마지막 날(11/6(금))이에요. 오늘 열지 않으면 이 달은 아무도 비대면 스터디를 신청할 수 없어요.");
  });

  it("대시보드 경고 — 없으면 '열기' 를 눌러 '신청 받기' 로, 준비 중이면 '신청 받기' 로 (그 화면의 버튼 이름 그대로)", () => {
    const m = onlineReminderText(missing, "2026-11-01");
    expect(m.title).toBe("11월 비대면 스터디를 아직 열지 않았어요");
    expect(m.lead).toBe(reminderLead(missing, "2026-11-01"));
    expect(m.action).toContain("'11월 비대면 스터디 열기'");
    expect(m.action).toContain("공개 상태를 '신청 받기'");

    const d = onlineReminderText(draft, "2026-11-01");
    expect(d.title).toBe("11월 비대면 스터디가 아직 '준비 중' 이에요");
    expect(d.action).not.toContain("열기");
    expect(d.action).toContain("공개 상태를 '신청 받기'");
  });

  it("푸시 한 줄", () => {
    expect(reminderPushLine(missing, "2026-11-01")).toEqual({ title: "11월 비대면 스터디를 열어 주세요", body: "신청 11/4(수) ~ 11/6(금) 사흘뿐 · 개강까지 3일" });
    expect(reminderPushLine(missing, "2026-11-03").body).toContain("내일 개강");
    expect(reminderPushLine(missing, "2026-11-05").body).toContain("지금 신청 기간");
    expect(reminderPushLine(missing, "2026-11-06").body).toContain("오늘이 신청 마지막 날");
  });
});

describe("하루 요약 푸시 (밤 9시) — 비대면 알림이 있으면 그것이 제목", () => {
  const zero = { study: 0, homework: 0, signups: 0 };
  const some = { study: 3, homework: 40, signups: 2 };
  const reminder = onlineStudyReminders([nov], [], "2026-11-01");

  it("알림이 없으면 예전 그대로 — 활동이 0건이면 보내지 않는다", () => {
    expect(digestPush(zero, [], "2026-11-01")).toBeNull();
    expect(digestPush(some, [], "2026-11-01")).toEqual({ title: DIGEST_TITLE, body: digestCountsLine(some), url: "/admin", tag: "daily-digest" });
    expect(digestCountsLine(some)).toBe("스터디 신청 3건 · 숙제업로드 40건 · 신규 가입 2명");
  });

  it("알림이 있으면 활동이 0건이어도 보낸다 — 누르면 그 달 스터디 시간 설정", () => {
    expect(digestPush(zero, reminder, "2026-11-01")).toEqual({
      title: "11월 비대면 스터디를 열어 주세요",
      body: "신청 11/4(수) ~ 11/6(금) 사흘뿐 · 개강까지 3일",
      url: "/admin/study/plan?term=2026-11",
      tag: "daily-digest",
    });
  });

  it("활동이 있으면 오늘 요약을 둘째 줄에", () => {
    expect(digestPush(some, reminder, "2026-11-01")?.body).toBe("신청 11/4(수) ~ 11/6(금) 사흘뿐 · 개강까지 3일\n오늘 스터디 신청 3건 · 숙제업로드 40건 · 신규 가입 2명");
  });
});
