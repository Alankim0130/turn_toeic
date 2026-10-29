import { describe, expect, it } from "vitest";
import { initialDay } from "@/lib/class-day";
import {
  classNotStartedYet,
  expectedSlotsOfDay,
  firstClassStart,
  homeworkStartDay,
  isFutureClass,
  kstDayMinute,
  minuteLabel,
  sentBeforeClass,
  sentKey,
} from "@/lib/homework-day";

/**
 * 숙제업로드 — 어느 수업의 숙제로 내는가 (2026-10-30 문라경 학생 "분명 제출하고 확인했는데 그 이후에 들어갔을 때 제출란에 아무것도 없었습니다").
 * 달력이 수업 없는 날 **다음 수업일**을, 기한 날 오전에 **오늘**을 골라 두어 지난 수업 숙제가 그 날짜로 저장됐고, 원래 수업은 '안 냄' → 미제출 알림이 갔다.
 * 10월 월수금 학생으로 본다 — 수업일 10/26(월) · 10/28(수) · 10/30(금) · 11/2(월), 숙제 기한 = 같은 트랙 다음 수업일 오후 5시.
 */

const RC = ["650|rc"];
const mwf = (overdue: Record<string, boolean>, expect: Record<string, string[]> = {}) =>
  [
    { date: "2026-10-26", due: "2026-10-28" },
    { date: "2026-10-28", due: "2026-10-30" },
    { date: "2026-10-30", due: "2026-11-02" },
    { date: "2026-11-02", due: "2026-11-04" },
  ].map((d) => ({ ...d, overdue: overdue[d.date] ?? false, expect: expect[d.date] ?? RC }));
const dates = mwf({}).map((d) => d.date);

describe("homeworkStartDay — 처음 고르는 날은 숙제를 낼 수업 (다음 수업일이 아니다)", () => {
  it("토요일에 열면 금요일 수업 — 예전에는 다음 주 월요일이 골라져 금요일 숙제가 월요일 숙제로 저장됐다", () => {
    const today = "2026-10-31";
    expect(initialDay(dates, today)).toBe("2026-11-02"); // 예전 규칙
    const days = mwf({ "2026-10-26": true, "2026-10-28": true });
    expect(homeworkStartDay(days, new Set(), today)).toBe("2026-10-30");
  });

  it("화요일 새벽(월수금 학생 — 수업 없는 날)에 열면 월요일 수업 — 예전에는 수요일", () => {
    const today = "2026-10-27";
    expect(initialDay(dates, today)).toBe("2026-10-28");
    expect(homeworkStartDay(mwf({}), new Set(), today)).toBe("2026-10-26");
  });

  it("기한 날(수요일) 오전에 월요일 숙제를 아직 안 냈으면 월요일 — 예전에는 오늘(수요일)", () => {
    const today = "2026-10-28";
    expect(initialDay(dates, today)).toBe("2026-10-28");
    expect(homeworkStartDay(mwf({}), new Set(), today)).toBe("2026-10-26");
  });

  it("월요일 숙제를 냈으면 오늘 수업", () => {
    expect(homeworkStartDay(mwf({}), new Set([sentKey("2026-10-26", 650, "rc")]), "2026-10-28")).toBe("2026-10-28");
  });

  it("기한이 지난 숙제는 건너뛴다 — 수요일 오후 5시가 지나면 월요일을 안 냈어도 오늘", () => {
    expect(homeworkStartDay(mwf({ "2026-10-26": true }), new Set(), "2026-10-28")).toBe("2026-10-28");
  });

  it("다 내지 않았으면 그 날 — 120분 학생이 RC 만 냈으면 LC 를 내러 그 날에 남는다", () => {
    const days = mwf({}, { "2026-10-26": ["650|rc", "650|lc"] });
    expect(homeworkStartDay(days, new Set([sentKey("2026-10-26", 650, "rc")]), "2026-10-27")).toBe("2026-10-26");
    expect(homeworkStartDay(days, new Set([sentKey("2026-10-26", 650, "rc"), sentKey("2026-10-26", 650, "lc")]), "2026-10-27")).toBe("2026-10-26");
  });

  it("속성반 — 850 칸을 안 냈으면 그 날", () => {
    const days = mwf({}, { "2026-10-26": ["650|rc", "650|lc", "850|lc"] });
    const sent = new Set([sentKey("2026-10-26", 650, "rc"), sentKey("2026-10-26", 650, "lc")]);
    expect(homeworkStartDay(days, sent, "2026-10-28")).toBe("2026-10-26");
    sent.add(sentKey("2026-10-26", 850, "lc"));
    expect(homeworkStartDay(days, sent, "2026-10-28")).toBe("2026-10-28");
  });

  it("주5일 — 기한이 먼저 오는 숙제부터 (월 RC 는 냈고 화 LC 가 남았다)", () => {
    const days = [
      { date: "2026-10-26", due: "2026-10-28", overdue: false, expect: ["650|rc"] },
      { date: "2026-10-27", due: "2026-10-29", overdue: false, expect: ["650|lc"] },
      { date: "2026-10-28", due: "2026-10-30", overdue: false, expect: ["650|rc"] },
    ];
    expect(homeworkStartDay(days, new Set([sentKey("2026-10-26", 650, "rc")]), "2026-10-28")).toBe("2026-10-27");
  });

  it("다음 달 초에도 지난달 마지막 수업 숙제가 남았으면 그 날", () => {
    const days = mwf({ "2026-10-26": true, "2026-10-28": true });
    expect(homeworkStartDay(days, new Set(), "2026-11-02")).toBe("2026-10-30");
  });

  it("배정일 앞의 수업은 고르지 않는다 — 수요일에 들어온 학생에게 월요일 숙제를 고르지 않게", () => {
    expect(homeworkStartDay(mwf({}), new Set(), "2026-10-28", "2026-10-28")).toBe("2026-10-28");
  });

  it("기한을 못 읽었으면(due 가 undefined) 오래된 날을 고르지 않고 오늘까지의 마지막 수업일", () => {
    const days = dates.map((date) => ({ date, expect: RC }));
    expect(homeworkStartDay(days, new Set(), "2026-10-29")).toBe("2026-10-28");
  });

  it("다음 수업일이 아직 달력에 없어 기한을 모르면(null) 열린 것으로 본다", () => {
    const days = [{ date: "2026-10-30", due: null, overdue: false, expect: RC }];
    expect(homeworkStartDay(days, new Set(), "2026-10-31")).toBe("2026-10-30");
  });

  it("개강 전이면 첫 수업일 (그 날짜로는 아직 못 낸다고 화면이 말한다) · 수업일이 없으면 null", () => {
    expect(homeworkStartDay(mwf({}), new Set(), "2026-10-20")).toBe("2026-10-26");
    expect(homeworkStartDay([], new Set(), "2026-10-20")).toBeNull();
  });

  it("지난 수업일이 있으면 아직 오지 않은 날을 고르지 않는다 (어느 날이든)", () => {
    for (let d = 26; d <= 31; d++) {
      const today = `2026-10-${d}`;
      for (const sent of [new Set<string>(), new Set(dates.map((x) => sentKey(x, 650, "rc")))]) {
        const got = homeworkStartDay(mwf({}), sent, today);
        expect(got && got <= today, `${today} → ${got}`).toBe(true);
      }
    }
  });
});

describe("expectedSlotsOfDay — 그 날 낼 숙제 칸 (미제출 판정과 같은 뜻)", () => {
  it("주3일 단과 — 그 시간 반의 과목 하나", () => {
    expect(expectedSlotsOfDay([650], [{ level: 650, subject: "rc" }])).toEqual(["650|rc"]);
  });
  it("120분 — 묶음 반(과목 없음)은 건너뛰고 품은 두 시간의 과목", () => {
    expect(expectedSlotsOfDay([650], [{ level: 650, subject: null }, { level: 650, subject: "rc" }, { level: 650, subject: "lc" }])).toEqual(["650|rc", "650|lc"]);
  });
  it("속성반 — 650 두 과목 + 850 그 시간의 과목", () => {
    const sections = [
      { level: 650, subject: null },
      { level: 650, subject: "rc" },
      { level: 650, subject: "lc" },
      { level: 850, subject: "lc" },
    ];
    expect(expectedSlotsOfDay([650, 850], sections)).toEqual(["650|rc", "650|lc", "850|lc"]);
  });
  it("과목을 아는 반이 없는 레벨(방학달 통짜 · 아직 안 고름)은 두 과목", () => {
    expect(expectedSlotsOfDay([650], [{ level: 650, subject: null }])).toEqual(["650|rc", "650|lc"]);
    expect(expectedSlotsOfDay([650, 850], [{ level: 650, subject: "rc" }])).toEqual(["650|rc", "850|rc", "850|lc"]);
  });
});

describe("수업 전에 낸 숙제 · 첫 수업 시작", () => {
  it("첫 수업 시작 — 인강 반은 빼고 가장 이른 시간대", () => {
    expect(firstClassStart([{ timeBlock: "10:00~12:10", recorded: false }, { timeBlock: "11:10~12:10", recorded: false }])).toBe(600);
    expect(firstClassStart([{ timeBlock: "18:30~19:30", recorded: true }])).toBeNull();
    expect(firstClassStart([{ timeBlock: null, recorded: false }])).toBeNull();
    expect(minuteLabel(600)).toBe("10:00");
    expect(minuteLabel(1110)).toBe("18:30");
  });

  it("한국 시간으로 날짜를 가른다 — UTC 15:30 은 다음 날 0시 30분", () => {
    expect(kstDayMinute("2026-10-27T15:30:00Z")).toEqual({ day: "2026-10-28", minute: 30 });
    expect(kstDayMinute("아님")).toBeNull();
  });

  it("그 수업 날짜보다 먼저 냈거나 · 같은 날 첫 수업 전에 냈으면 수업 전에 낸 숙제", () => {
    expect(sentBeforeClass("2026-10-28", "2026-10-27T14:50:00Z", 600)).toBe(true); // 10/27 23:50 에 10/28 수업 숙제로
    expect(sentBeforeClass("2026-10-28", "2026-10-28T00:30:00+09:00", 600)).toBe(true); // 같은 날 새벽
    expect(sentBeforeClass("2026-10-28", "2026-10-28T09:59:00+09:00", 600)).toBe(true);
    expect(sentBeforeClass("2026-10-28", "2026-10-28T12:30:00+09:00", 600)).toBe(false);
    expect(sentBeforeClass("2026-10-26", "2026-10-27T00:30:00+09:00", 600)).toBe(false); // 자정 넘어 월요일 숙제 — 제대로 냈다
    expect(sentBeforeClass("2026-10-28", "2026-10-28T08:00:00+09:00", null)).toBe(false); // 시작을 모르면 날짜만
  });

  it("오늘 첫 수업이 시작 전인가 · 아직 오지 않은 수업 날짜인가", () => {
    expect(classNotStartedYet(600, Date.parse("2026-10-28T09:59:00+09:00"))).toBe(true);
    expect(classNotStartedYet(600, Date.parse("2026-10-28T10:00:00+09:00"))).toBe(false);
    expect(isFutureClass("2026-10-30", "2026-10-28")).toBe(true);
    expect(isFutureClass("2026-10-28", "2026-10-28")).toBe(false);
  });
});
