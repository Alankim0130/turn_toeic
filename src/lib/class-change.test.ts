import { describe, expect, it } from "vitest";
import { classChangeLog, planClassChange, type ChangeEnrollment, type ChangeSection } from "./class-change";

/** 10월 반 — 과목 · 과정은 10월 편성 그대로 (10:00 B · 11:10 A · 850 12:30 A · 13:50 B, 저녁은 오전과 같다) */
const OCT = 10;
const score = (level: number) => ({ target_score: level, program: "score", course_type: "full" });
const sparta = (level: number) => ({ target_score: level, program: "sparta", course_type: "full" });
const sec = (id: number, level: number, track: "mwf" | "ttf", block: string, subject: string | null = null, bookSet: string | null = null, course = score(level)): ChangeSection => ({
  id,
  track,
  time_block: block,
  term_id: 1,
  month: OCT,
  subject,
  book_set: bookSet,
  course,
});
let nextId = 1000;
const enrolled = (order: number, receipt: number | null, ...sections: ChangeSection[]): ChangeEnrollment[] =>
  sections.map((section) => ({ id: nextId++, order_id: order, mode: "onsite", section, receipt }));

describe("반을 바꾼 수강증 — 그날 검토 대기에 쌓였던 실제 모양 (2026-10-06)", () => {
  it("같은 반을 새로 캡처 (#150) → 새 등록으로 옮겨 온다 — 뺄 것도 넣을 것도 없다", () => {
    const mwf = sec(11, 750, "mwf", "18:30~20:40");
    const ttf = sec(12, 750, "ttf", "18:30~20:40");
    const existing = enrolled(41, 41, mwf, ttf);
    const plan = planClassChange({ next: [mwf, ttf], existing });
    expect(plan).toMatchObject({ kind: "replace", insert: [], remove: [], orders: [41], receipts: [41] });
    if (plan.kind === "replace") expect(plan.absorb.map((e) => e.section.id)).toEqual([11, 12]);
  });

  it("750 주5일 120분 → 750 실전속성 (#156) — 시간이 겹친다 → 옛 두 반을 빼고 속성반 둘을 넣는다", () => {
    const existing = enrolled(130, 130, sec(21, 750, "mwf", "10:00~12:10"), sec(22, 750, "ttf", "10:00~12:10"));
    const next = [sec(31, 750, "mwf", "10:00~13:40", null, null, sparta(750)), sec(32, 750, "ttf", "10:00~13:40", null, null, sparta(750))];
    const plan = planClassChange({ next, existing });
    expect(plan).toMatchObject({ kind: "replace", insert: [31, 32], absorb: [], orders: [130] });
    if (plan.kind === "replace") expect(plan.remove.map((e) => e.section.id)).toEqual([21, 22]);
  });

  it("850 화목금 13:50 RC단과 → 850 주5일 60분 12:30 (#86) — 같은 레벨 · 시간은 안 겹친다 → 바꾼다", () => {
    const existing = enrolled(44, 44, sec(41, 850, "ttf", "13:50~15:00", "rc", "B"));
    const next = [sec(42, 850, "mwf", "12:30~13:40", "rc", "A"), sec(43, 850, "ttf", "12:30~13:40", "lc", "A")];
    const plan = planClassChange({ next, existing });
    expect(plan).toMatchObject({ kind: "replace", insert: [42, 43], absorb: [] });
    if (plan.kind === "replace") expect(plan.remove.map((e) => e.section.id)).toEqual([41]);
  });

  it("750 LC단과가 있는데 850 주5일 140분 (#113) — 다른 레벨 · 안 겹친다 → 강사가 본다 (그 학생은 둘 다 들었다)", () => {
    const existing = enrolled(81, 81, sec(51, 750, "mwf", "10:00~11:00", "lc", "B"));
    const next = [sec(52, 850, "mwf", "12:30~15:00"), sec(53, 850, "ttf", "12:30~15:00")];
    expect(planClassChange({ next, existing })).toEqual({ kind: "review", reason: expect.stringContaining("다른 레벨") });
  });

  it("단과를 하나 더 산 학생 (650 월수금 10:00 RC + 화목금 11:10 RC) → 강사가 본다 — 첫째 단과를 빼지 않는다", () => {
    const existing = enrolled(1, 1, sec(61, 650, "mwf", "10:00~11:00", "rc", "B"));
    const next = [sec(62, 650, "ttf", "11:10~12:10", "rc", "A")];
    expect(planClassChange({ next, existing })).toEqual({ kind: "review", reason: expect.stringContaining("단과") });
  });
});

describe("반을 바꾼 것이 분명한 다른 모양", () => {
  it("단과를 오전 → 저녁으로 (같은 과목 · 같은 과정) → 바꾼다", () => {
    const existing = enrolled(2, 2, sec(71, 650, "mwf", "10:00~11:00", "rc", "B"));
    const plan = planClassChange({ next: [sec(72, 650, "mwf", "18:30~19:30", "rc", "B")], existing });
    expect(plan).toMatchObject({ kind: "replace", insert: [72], absorb: [] });
  });

  it("단과의 과정을 모르면 같은 수업이라고 하지 않는다 → 강사가 본다", () => {
    const existing = enrolled(2, 2, sec(71, 650, "mwf", "10:00~11:00", "rc", null));
    expect(planClassChange({ next: [sec(72, 650, "mwf", "18:30~19:30", "rc", null)], existing }).kind).toBe("review");
  });

  it("주5일 → 주3일 — 한 트랙만 겹쳐도 그 등록을 통째로 바꾼다 (화목금이 남지 않는다)", () => {
    const existing = enrolled(3, 3, sec(81, 750, "mwf", "10:00~12:10"), sec(82, 750, "ttf", "10:00~12:10"));
    const plan = planClassChange({ next: [sec(81, 750, "mwf", "10:00~12:10")], existing });
    expect(plan).toMatchObject({ kind: "replace", insert: [] });
    if (plan.kind === "replace") {
      expect(plan.absorb.map((e) => e.section.id)).toEqual([81]);
      expect(plan.remove.map((e) => e.section.id)).toEqual([82]);
    }
  });

  it("주3일 → 주5일 · 오전 120분 → 저녁 120분 · 같은 시간 레벨 변경 → 바꾼다", () => {
    const mwf = sec(91, 650, "mwf", "10:00~12:10");
    expect(planClassChange({ next: [mwf, sec(92, 650, "ttf", "10:00~12:10")], existing: enrolled(4, 4, mwf) })).toMatchObject({ kind: "replace", insert: [92] });
    expect(
      planClassChange({ next: [sec(93, 650, "mwf", "18:30~20:40"), sec(94, 650, "ttf", "18:30~20:40")], existing: enrolled(5, 5, mwf, sec(92, 650, "ttf", "10:00~12:10")) }),
    ).toMatchObject({ kind: "replace", insert: [93, 94] });
    expect(planClassChange({ next: [sec(95, 750, "mwf", "10:00~12:10")], existing: enrolled(6, 6, mwf) })).toMatchObject({ kind: "replace", insert: [95] });
  });

  it("다른 레벨 등록은 그대로 두고 바뀐 레벨 등록만 바꾼다", () => {
    const keep = enrolled(7, 7, sec(101, 750, "mwf", "10:00~11:00", "lc", "B"));
    const change = enrolled(8, 8, sec(102, 850, "ttf", "13:50~15:00", "rc", "B"));
    const plan = planClassChange({ next: [sec(103, 850, "mwf", "12:30~15:00"), sec(104, 850, "ttf", "12:30~15:00")], existing: [...keep, ...change] });
    expect(plan).toMatchObject({ kind: "replace", insert: [103, 104], orders: [8] });
    if (plan.kind === "replace") expect(plan.remove.map((e) => e.section.id)).toEqual([102]);
  });
});

describe("강사에게 넘기는 것 · 상관없는 것", () => {
  it("바꿔야 할 배정이 강사가 수강증 없이 넣은 것이면 → 강사가 본다", () => {
    const existing = enrolled(9, null, sec(111, 650, "mwf", "10:00~12:10"));
    expect(planClassChange({ next: [sec(112, 650, "mwf", "10:00~13:40", null, null, sparta(650))], existing })).toEqual({
      kind: "review",
      reason: expect.stringContaining("강사가 직접"),
    });
  });

  it("바꿀 등록 하나 + 단과 두 개일 수 있는 등록 하나 → 강사가 본다 (일부만 짐작하지 않는다)", () => {
    const a = enrolled(10, 10, sec(121, 650, "mwf", "10:00~11:00", "rc", "B"));
    const b = enrolled(11, 11, sec(122, 650, "ttf", "11:10~12:10", "rc", "A"));
    expect(planClassChange({ next: [sec(123, 650, "mwf", "18:30~19:30", "rc", "B")], existing: [...a, ...b] }).kind).toBe("review");
  });

  it("다른 달 배정뿐이면 반을 바꾼 것이 아니다", () => {
    const sept = { ...sec(131, 650, "mwf", "10:00~12:10"), term_id: 99, month: 9 };
    expect(planClassChange({ next: [sec(132, 650, "mwf", "10:00~12:10")], existing: enrolled(12, 12, sept) })).toEqual({ kind: "none" });
  });

  it("새 수강증의 반이 없으면 바꾸지 않는다", () => {
    expect(planClassChange({ next: [], existing: enrolled(13, 13, sec(141, 650, "mwf", "10:00~12:10")) }).kind).toBe("review");
  });
});

describe("승인 화면 기록 (candidates.classChange)", () => {
  it("바꿨으면 이전 수강증 · 뺀 반 · 옮겨 온 반만 남긴다 — 강사에게 넘겼으면 까닭, 상관없으면 남기지 않는다", () => {
    const existing = enrolled(20, 77, sec(151, 750, "mwf", "10:00~12:10"), sec(152, 750, "ttf", "10:00~12:10"));
    expect(classChangeLog(planClassChange({ next: [sec(151, 750, "mwf", "10:00~12:10")], existing }))).toEqual({
      kind: "replace",
      receipts: [77],
      orders: [20],
      removed: [152],
      absorbed: [151],
    });
    expect(classChangeLog({ kind: "review", reason: "까닭" })).toEqual({ kind: "review", reason: "까닭" });
    expect(classChangeLog({ kind: "none" })).toBeNull();
  });
});
