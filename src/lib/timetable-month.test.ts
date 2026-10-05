import { describe, expect, it } from "vitest";
import {
  bundleCandidates,
  chooseMonthSource,
  draftMonth,
  fieldsFor,
  kindOf,
  madeMonths,
  missingOf,
  orphanTwoWeekRows,
  parseYm,
  shiftYm,
  slotKinds,
  sourceNote,
  ymKey,
  type SlotValues,
} from "./timetable-month";

const row = (id: number, start: string, end: string, extra: Partial<{ level: number; program: string }> = {}) => ({
  id,
  level: extra.level ?? 650,
  program: extra.program ?? "score",
  start_time: `${start}:00`,
  end_time: `${end}:00`,
});

describe("달 — 주소 · 넘기기", () => {
  it("?month=2027-01 을 읽고 엉뚱하면 기본값", () => {
    const fb = { y: 2026, m: 9 };
    expect(parseYm("2027-01", fb)).toEqual({ y: 2027, m: 1 });
    expect(parseYm("2027-13", fb)).toEqual(fb);
    expect(parseYm("abc", fb)).toEqual(fb);
    expect(parseYm(undefined, fb)).toEqual(fb);
  });
  it("해를 넘겨 넘긴다", () => {
    expect(shiftYm({ y: 2026, m: 12 }, 1)).toEqual({ y: 2027, m: 1 });
    expect(shiftYm({ y: 2027, m: 1 }, -1)).toEqual({ y: 2026, m: 12 });
    expect(ymKey({ y: 2027, m: 2 })).toBe("2027-02");
  });
  it("시간표가 있는 달만 한 번씩, 앞선 달부터", () => {
    expect(madeMonths([{ year: 2026, month: 10 }, { year: 2026, month: 9 }, { year: 2026, month: 10 }, { year: null, month: null }])).toEqual([
      { y: 2026, m: 9 },
      { y: 2026, m: 10 },
    ]);
  });
});

describe("새 달의 출발점 — 기존의 매달 변경규칙 (2026-09-29 Alan)", () => {
  const made = [
    { y: 2026, m: 9 },
    { y: 2026, m: 10 },
  ];
  const tpl = () => true;

  it("11월 ← 10월: 이어지는 평달이라 과정 뒤집기 · 과목 그대로", () => {
    expect(chooseMonthSource({ y: 2026, m: 11 }, made, tpl)).toEqual({ kind: "month", from: { y: 2026, m: 10 }, carry: true, flips: 1 });
  });

  it("12월(11월을 안 만들었으면) ← 10월: 두 달 뒤라 과정도 그대로", () => {
    const s = chooseMonthSource({ y: 2026, m: 12 }, made, tpl);
    expect(s).toEqual({ kind: "month", from: { y: 2026, m: 10 }, carry: true, flips: 2 });
  });

  it("2027년 1월(처음 여는 방학달) ← 방학달 기본 줄에서 시간만", () => {
    expect(chooseMonthSource({ y: 2027, m: 1 }, made, tpl)).toEqual({ kind: "template", season: "vacation" });
  });

  it("2월 ← 1월: 방학달끼리 이어지면 뒤집어 잇는다", () => {
    expect(chooseMonthSource({ y: 2027, m: 2 }, [...made, { y: 2027, m: 1 }], tpl)).toEqual({ kind: "month", from: { y: 2027, m: 1 }, carry: true, flips: 1 });
  });

  it("3월 ← 12월: 방학달(1·2월)이 끼었으니 시간만 — 과정·과목은 직접 (2026-09-23 Alan)", () => {
    const s = chooseMonthSource({ y: 2027, m: 3 }, [...made, { y: 2026, m: 12 }, { y: 2027, m: 1 }, { y: 2027, m: 2 }], tpl);
    expect(s).toMatchObject({ kind: "month", from: { y: 2026, m: 12 }, carry: false });
  });

  it("7월 ← 2월: 평달이 끼었으니 방학달 시간만 가져온다", () => {
    const s = chooseMonthSource({ y: 2027, m: 7 }, [{ y: 2027, m: 1 }, { y: 2027, m: 2 }, { y: 2027, m: 6 }], tpl);
    expect(s).toMatchObject({ kind: "month", from: { y: 2027, m: 2 }, carry: false });
  });

  it("뒤에 있는 달은 출발점이 아니다 · 기본 줄도 없으면 none", () => {
    expect(chooseMonthSource({ y: 2026, m: 8 }, made, () => false)).toEqual({ kind: "none", season: "vacation" });
  });
});

describe("draftMonth — 새 달 줄 만들기", () => {
  const oct: SlotValues[] = [
    { level: 650, program: "score", start_time: "10:00:00", end_time: "11:00:00", ttf_recorded: false, book_set: "B", subject_mwf: "rc", subject_ttf: "lc" },
    { level: 650, program: "score", start_time: "10:00:00", end_time: "12:10:00", ttf_recorded: false, book_set: null, subject_mwf: null, subject_ttf: null },
    { level: 650, program: "score", start_time: "18:30:00", end_time: "19:30:00", ttf_recorded: true, book_set: "B", subject_mwf: "rc", subject_ttf: "lc" },
  ];

  it("10월 → 11월: 10:00 B 과정이 A 과정으로, 과목 · 시간 · 인강은 그대로", () => {
    const d = draftMonth({ kind: "month", from: { y: 2026, m: 10 }, carry: true, flips: 1 }, oct);
    expect(d[0]).toMatchObject({ start_time: "10:00:00", book_set: "A", subject_mwf: "rc", subject_ttf: "lc" });
    expect(d[1]).toMatchObject({ book_set: null, subject_mwf: null });
    expect(d[2]).toMatchObject({ ttf_recorded: true, book_set: "A" });
  });

  it("두 달 뒤면 과정도 그대로", () => {
    expect(draftMonth({ kind: "month", from: { y: 2026, m: 10 }, carry: true, flips: 2 }, oct)[0].book_set).toBe("B");
  });

  it("계절이 끊겼거나 기본 줄이면 시간·인강만 — 과정·과목은 비운다", () => {
    for (const src of [{ kind: "month" as const, from: { y: 2026, m: 12 }, carry: false, flips: 3 }, { kind: "template" as const, season: "vacation" as const }]) {
      const d = draftMonth(src, oct);
      expect(d[2]).toMatchObject({ start_time: "18:30:00", ttf_recorded: true, book_set: null, subject_mwf: null, subject_ttf: null });
    }
  });

  it("엉뚱한 값은 옮기지 않는다", () => {
    const d = draftMonth({ kind: "month", from: { y: 2026, m: 10 }, carry: true, flips: 2 }, [{ ...oct[0], book_set: "C", subject_mwf: "x" }]);
    expect(d[0]).toMatchObject({ book_set: null, subject_mwf: null, subject_ttf: "lc" });
  });

  it("안내 한 줄이 무엇을 가져오는지 말한다", () => {
    expect(sourceNote({ y: 2026, m: 11 }, { kind: "month", from: { y: 2026, m: 10 }, carry: true, flips: 1 })).toMatch(/2026년 10월 시간표를 가져와 과정 A\/B 는 뒤집고/);
    expect(sourceNote({ y: 2027, m: 3 }, { kind: "month", from: { y: 2026, m: 12 }, carry: false, flips: 3 })).toMatch(/시간만 가져와요. 3월은 평달/);
    expect(sourceNote({ y: 2027, m: 1 }, { kind: "template", season: "vacation" })).toMatch(/방학달 기본 시간표에서 시간만/);
  });
});

describe("줄의 종류 — 무엇을 고르게 하나", () => {
  const regular650 = [row(1, "10:00", "11:00"), row(2, "11:10", "12:10"), row(3, "10:00", "12:10"), row(4, "18:30", "19:30")];

  it("평달 650: 60분은 시간 단위, 10:00~12:10 은 한달완성", () => {
    const k = slotKinds(regular650);
    expect(k.get(1)).toBe("hour");
    expect(k.get(2)).toBe("hour");
    expect(k.get(3)).toBe("package");
    expect(k.get(4)).toBe("hour");
  });

  it("방학달 통짜 120분은 과정만 두는 줄 — 안에 든 줄이 없으니 한달완성이 아니다", () => {
    const vac = [row(1, "10:00", "12:10"), row(2, "12:30", "14:40")];
    expect(kindOf(vac[0], vac)).toBe("block");
    expect(kindOf(vac[1], vac)).toBe("block");
  });

  it("스파르타 줄은 겹쳐도 한달완성이 아니다 (서로 다른 상품)", () => {
    const sp = [row(1, "10:00", "13:40", { program: "sparta", level: 750 }), row(2, "10:00", "15:00", { program: "sparta", level: 750 })];
    expect(slotKinds(sp).get(2)).toBe("sparta");
  });

  it("다른 레벨의 줄은 품지 않는다", () => {
    const mixed = [row(1, "10:00", "12:10"), row(2, "10:00", "11:00", { level: 750 })];
    expect(slotKinds(mixed).get(1)).toBe("block");
  });

  it("종류가 허락하지 않는 값은 비운다", () => {
    const v = { book_set: "A", subject_mwf: "rc", subject_ttf: "lc" };
    expect(fieldsFor("hour", v)).toEqual(v);
    expect(fieldsFor("block", v)).toEqual({ book_set: "A", subject_mwf: null, subject_ttf: null });
    expect(fieldsFor("package", v)).toEqual({ book_set: null, subject_mwf: null, subject_ttf: null });
    expect(fieldsFor("sparta", v)).toEqual({ book_set: null, subject_mwf: null, subject_ttf: null });
  });

  it("안 고른 칸을 알려 준다", () => {
    expect(missingOf("hour", { book_set: null, subject_mwf: "rc", subject_ttf: null })).toEqual(["과정", "화목금 과목"]);
    expect(missingOf("block", { book_set: null, subject_mwf: null, subject_ttf: null })).toEqual(["과정"]);
    expect(missingOf("package", { book_set: null, subject_mwf: null, subject_ttf: null })).toEqual([]);
  });
});

describe("한달완성 묶기 — 이어지는 두 시간", () => {
  it("묶음이 이미 있으면 권하지 않는다", () => {
    expect(bundleCandidates([row(1, "10:00", "11:00"), row(2, "11:10", "12:10"), row(3, "10:00", "12:10")])).toEqual([]);
  });

  it("두 시간만 있으면 10:00~12:10 으로 묶자고 한다", () => {
    const c = bundleCandidates([row(1, "10:00", "11:00"), row(2, "11:10", "12:10")]);
    expect(c.map((x) => x.label)).toEqual(["10:00~12:10"]);
  });

  it("사이가 30분 넘게 벌어지면 이어지는 두 시간이 아니다", () => {
    expect(bundleCandidates([row(1, "10:00", "11:00"), row(2, "12:00", "13:00")])).toEqual([]);
  });

  it("방학달 통짜 줄은 묶지 않는다", () => {
    expect(bundleCandidates([row(1, "10:00", "12:10"), row(2, "12:30", "14:40")])).toEqual([]);
  });
});

describe("품을 시간이 없어진 2주완성 줄 (2026-10-05 Alan \"방학달에도 2주완성 있어\")", () => {
  const tw = (id: number, start: string, end: string, level = 850) => row(id, start, end, { program: "twoweek", level });
  const sc = (id: number, start: string, end: string, level = 850) => row(id, start, end, { level });

  it("방학달 기본 줄에서 온 7월 · 8월 850 중 쓰지 않는 시간을 지우면 그 시간의 2주완성 줄만 남는다", () => {
    const twoWeek = [tw(10, "12:30", "14:40"), tw(11, "15:30", "16:50")];
    // 7월(15:30~16:50)을 지우고 8월(12:30~14:40) 만 남겼다
    expect(orphanTwoWeekRows(twoWeek, [sc(1, "12:30", "14:40")]).map((w) => w.id)).toEqual([11]);
    // 둘 다 남아 있으면 지울 것이 없다 (같은 시간도 품는다)
    expect(orphanTwoWeekRows(twoWeek, [sc(1, "12:30", "14:40"), sc(2, "15:30", "16:50")])).toEqual([]);
  });

  it("평달 2주완성(12:30~15:00)은 140분 묶음 줄을 지워도 70분 두 시간이 안에 있어 남는다 — 다 지우면 함께 지운다", () => {
    const twoWeek = [tw(10, "12:30", "15:00")];
    expect(orphanTwoWeekRows(twoWeek, [sc(1, "12:30", "13:40"), sc(2, "13:50", "15:00")])).toEqual([]);
    expect(orphanTwoWeekRows(twoWeek, [sc(2, "13:50", "15:00")])).toEqual([]);
    expect(orphanTwoWeekRows(twoWeek, []).map((w) => w.id)).toEqual([10]);
  });

  it("다른 레벨 · 걸치기만 한 시간은 품는 시간이 아니다", () => {
    const twoWeek = [tw(10, "12:30", "14:40")];
    expect(orphanTwoWeekRows(twoWeek, [sc(1, "12:30", "14:40", 750)]).map((w) => w.id)).toEqual([10]);
    expect(orphanTwoWeekRows(twoWeek, [sc(1, "14:00", "15:30")]).map((w) => w.id)).toEqual([10]);
  });
});
