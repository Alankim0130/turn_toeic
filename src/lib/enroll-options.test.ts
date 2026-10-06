import { describe, expect, it } from "vitest";
import {
  enrollBlockMinutes,
  enrollBlocks,
  enrollCourses,
  enrollKinds,
  enrollTerms,
  enrollTracks,
  KIND_CHOICE_LABEL,
  kindOfSections,
  resolveEnrollChoice,
  type EnrollSection,
} from "./enroll-options";

const C650 = { id: 1, name: "650+ 왕기초반", program: "score", target_score: 650 };
const C750 = { id: 2, name: "750+ 유형마스터", program: "score", target_score: 750 };
const SPARTA = { id: 3, name: "스파르타 650+ 중급속성", program: "sparta", target_score: 650 };
const SEP = { year: 2026, month: 9 };
const OCT = { year: 2026, month: 10 };

let id = 0;
const sec = (course: EnrollSection["course"], term: EnrollSection["term"], track: string, time_block: string | null): EnrollSection => ({
  id: ++id, track, time_block, term, course,
});

// 9월: 650 은 10:00~12:10 주5일(두 트랙) + 18:30~20:40 월수금만, 750 은 10:00~12:10 화목금만
// 스파르타는 10:00~13:40 두 트랙. 10월은 650 10:00~12:10 두 트랙.
const SECTIONS: EnrollSection[] = [
  sec(C650, SEP, "mwf", "10:00~12:10"),
  sec(C650, SEP, "ttf", "10:00~12:10"),
  sec(C650, SEP, "mwf", "18:30~20:40"),
  sec(C750, SEP, "ttf", "10:00~12:10"),
  sec(SPARTA, SEP, "mwf", "10:00~13:40"),
  sec(SPARTA, SEP, "ttf", "10:00~13:40"),
  sec(C650, OCT, "mwf", "10:00~12:10"),
  sec(C650, OCT, "ttf", "10:00~12:10"),
  sec(C650, SEP, "mwf", null), // 시간대 없는 반은 고를 수 없다
];

const find = (course: number, track: string, block: string, term = SEP) =>
  SECTIONS.find((s) => s.course?.id === course && s.track === track && s.time_block === block && s.term?.month === term.month)!.id;

describe("수강월", () => {
  it("열린 달을 이른 순으로", () => {
    expect(enrollTerms(SECTIONS)).toEqual([
      { key: "2026-09", label: "2026년 9월" },
      { key: "2026-10", label: "2026년 10월" },
    ]);
  });
});

describe("레벨", () => {
  it("점수보장반 먼저, 목표 점수 순", () => {
    expect(enrollCourses(SECTIONS, "2026-09").map((c) => c.name)).toEqual([
      "650+ 왕기초반",
      "750+ 유형마스터",
      "스파르타 650+ 중급속성",
    ]);
  });

  it("그 달에 없는 강좌는 안 나온다", () => {
    expect(enrollCourses(SECTIONS, "2026-10").map((c) => c.id)).toEqual([1]);
  });
});

describe("요일", () => {
  it("두 트랙이 같은 시간대에 다 있으면 주5일이 맨 앞", () => {
    expect(enrollTracks(SECTIONS, "2026-09", C650.id)).toEqual(["week5", "mwf", "ttf"]);
  });

  it("한 트랙만 열린 강좌는 그 트랙만", () => {
    expect(enrollTracks(SECTIONS, "2026-09", C750.id)).toEqual(["ttf"]);
  });
});

describe("시간대", () => {
  it("고른 요일에 실제로 열리는 것만", () => {
    expect(enrollBlocks(SECTIONS, "2026-09", C650.id, "mwf")).toEqual(["10:00~12:10", "18:30~20:40"]);
    // 저녁반은 월수금만 있어 주5일이 안 된다
    expect(enrollBlocks(SECTIONS, "2026-09", C650.id, "week5")).toEqual(["10:00~12:10"]);
    expect(enrollBlocks(SECTIONS, "2026-09", C650.id, "ttf")).toEqual(["10:00~12:10"]);
  });

  it("시간대가 없는 반은 선택지에 없다", () => {
    expect(enrollBlocks(SECTIONS, "2026-09", C650.id, "mwf")).not.toContain(null);
  });
});

describe("resolveEnrollChoice — 서버가 다시 푸는 곳", () => {
  const pick = (o: Partial<Parameters<typeof resolveEnrollChoice>[1]>) =>
    resolveEnrollChoice(SECTIONS, { term: "2026-09", courseId: C650.id, track: "mwf", timeBlock: "10:00~12:10", ...o });

  it("주3일은 반 하나", () => {
    expect(pick({})).toEqual({ ok: true, sectionIds: [find(C650.id, "mwf", "10:00~12:10")] });
  });

  it("주5일은 월수금 + 화목금 두 반", () => {
    const r = pick({ track: "week5" });
    expect(r).toEqual({
      ok: true,
      sectionIds: [find(C650.id, "mwf", "10:00~12:10"), find(C650.id, "ttf", "10:00~12:10")],
    });
  });

  it("한 트랙만 있는 시간대에 주5일을 고르면 거절 — 주3일을 주5일로 넣으면 안 된다", () => {
    const r = pick({ track: "week5", timeBlock: "18:30~20:40" });
    expect(r).toMatchObject({ ok: false });
    expect((r as { reason: string }).reason).toContain("주5일");
  });

  it("열리지 않은 조합은 거절", () => {
    expect(pick({ track: "ttf", timeBlock: "18:30~20:40" })).toMatchObject({ ok: false });
    expect(pick({ courseId: C750.id, track: "mwf" })).toMatchObject({ ok: false });
    expect(pick({ term: "2026-10", timeBlock: "18:30~20:40" })).toMatchObject({ ok: false });
  });

  it("하나라도 비면 무엇이 빠졌는지 알려 준다", () => {
    expect(resolveEnrollChoice(SECTIONS, {})).toEqual({ ok: false, reason: "수강월을 골라 주세요." });
    expect(pick({ courseId: undefined })).toEqual({ ok: false, reason: "레벨을 골라 주세요." });
    expect(pick({ track: "" })).toEqual({ ok: false, reason: "요일을 골라 주세요." });
    expect(pick({ timeBlock: "" })).toEqual({ ok: false, reason: "시간대를 골라 주세요." });
  });

  it("다른 달 반을 골라 넣어도 그 달 반만 나온다", () => {
    const r = pick({ term: "2026-10" });
    expect(r).toEqual({ ok: true, sectionIds: [find(C650.id, "mwf", "10:00~12:10", OCT)] });
  });
});

/**
 * 종합 · 단과 (2026-10-06 Alan — "등업신청을 할때 지금 단과설정이 안되고 있어. 단과도 설정할 수 있도록 해줘").
 * 10월 편성 그대로: 650 10:00 B 과정(월수금 RC · 화목금 LC) · 11:10 A 과정(월수금 LC · 화목금 RC), 저녁도 같은 배치.
 * 120분 묶음 반은 과목 칸이 비어 있고(두 과목을 이어 듣는다) 시간 단위 반만 과목이 있다.
 */
describe("종합 · 단과", () => {
  const TWO = { id: 4, name: "850+ 2주완성", program: "twoweek", target_score: 850 };
  const C850 = { id: 5, name: "850+ 문제마스터", program: "score", target_score: 850 };
  const OCT_TERM = "2026-10";
  const VAC = { year: 2027, month: 1 };
  let n = 1000;
  const s = (course: EnrollSection["course"], track: string, time_block: string, subject: string | null, term = OCT): EnrollSection => ({
    id: ++n,
    track,
    time_block,
    subject,
    term,
    course,
  });
  const LIST: EnrollSection[] = [
    // 650 오전 · 저녁 — 묶음 + 시간 단위
    s(C650, "mwf", "10:00~12:10", null),
    s(C650, "ttf", "10:00~12:10", null),
    s(C650, "mwf", "10:00~11:00", "rc"),
    s(C650, "ttf", "10:00~11:00", "lc"),
    s(C650, "mwf", "11:10~12:10", "lc"),
    s(C650, "ttf", "11:10~12:10", "rc"),
    s(C650, "mwf", "18:30~20:40", null),
    s(C650, "ttf", "18:30~20:40", null),
    s(C650, "mwf", "18:30~19:30", "rc"),
    s(C650, "ttf", "18:30~19:30", "lc"),
    s(C650, "mwf", "19:40~20:40", "lc"),
    s(C650, "ttf", "19:40~20:40", "rc"),
    // 850 70분 둘 + 140분 묶음
    s(C850, "mwf", "12:30~15:00", null),
    s(C850, "mwf", "12:30~13:40", "rc"),
    s(C850, "mwf", "13:50~15:00", "lc"),
    // 속성반 · 2주완성 (그릇 반) — 과목 칸이 잘못 채워져 있어도 종합
    s(SPARTA, "mwf", "10:00~13:40", null),
    s(SPARTA, "ttf", "10:00~13:40", "rc"),
    s(TWO, "mwf", "12:30~15:00", null),
    s(TWO, "ttf", "12:30~15:00", null),
    // 방학달: 650 통짜 120분(과목 없음) · 850 80분(과목 없음 — 한 교시 길이라 모른다)
    s(C650, "mwf", "10:00~12:10", null, VAC),
    s(C650, "ttf", "10:00~12:10", null, VAC),
    s(C850, "mwf", "15:30~16:50", null, VAC),
  ];
  const id = (course: number, track: string, block: string, term = OCT) =>
    LIST.find((x) => x.course?.id === course && x.track === track && x.time_block === block && x.term?.year === term.year && x.term?.month === term.month)!.id;

  it("레벨마다 고를 수 있는 것 — 650 은 종합 · RC단과 · LC단과, 속성반 · 2주완성은 종합 하나", () => {
    expect(enrollKinds(LIST, OCT_TERM, C650.id)).toEqual(["full", "rc", "lc"]);
    expect(enrollKinds(LIST, OCT_TERM, C850.id)).toEqual(["full", "rc", "lc"]);
    expect(enrollKinds(LIST, OCT_TERM, SPARTA.id)).toEqual(["full"]);
    expect(enrollKinds(LIST, OCT_TERM, TWO.id)).toEqual(["full"]);
    expect(KIND_CHOICE_LABEL).toEqual({ full: "종합반", rc: "RC단과", lc: "LC단과" });
  });

  it("방학달 통짜 반만 있는 달은 종합 하나 — 고르는 줄을 그리지 않는다", () => {
    expect(enrollKinds(LIST, "2027-01", C650.id)).toEqual(["full"]);
    // 과목 칸이 빈 80분 반은 모르는 것이지만, 가릴 것이 하나도 없으면 종합 하나로 두고 그 시간대를 그대로 보여 준다
    expect(enrollKinds(LIST, "2027-01", C850.id)).toEqual(["full"]);
    expect(enrollBlocks(LIST, "2027-01", C850.id, "mwf", "full")).toEqual(["15:30~16:50"]);
  });

  it("열린 반이 없는 레벨은 빈 목록", () => {
    expect(enrollKinds(LIST, OCT_TERM, 999)).toEqual([]);
  });

  it("요일 — 단과는 주5일이 없다 (같은 시각의 두 트랙 과목이 서로 반대다)", () => {
    expect(enrollTracks(LIST, OCT_TERM, C650.id, "full")).toEqual(["week5", "mwf", "ttf"]);
    expect(enrollTracks(LIST, OCT_TERM, C650.id, "rc")).toEqual(["mwf", "ttf"]);
    expect(enrollTracks(LIST, OCT_TERM, C650.id, "lc")).toEqual(["mwf", "ttf"]);
    // 고르지 않으면 예전처럼 전부
    expect(enrollTracks(LIST, OCT_TERM, C650.id)).toEqual(["week5", "mwf", "ttf"]);
  });

  it("시간대 — 종합은 묶음 반, 단과는 그 과목의 시간 단위 반만", () => {
    expect(enrollBlocks(LIST, OCT_TERM, C650.id, "mwf", "full")).toEqual(["10:00~12:10", "18:30~20:40"]);
    expect(enrollBlocks(LIST, OCT_TERM, C650.id, "mwf", "rc")).toEqual(["10:00~11:00", "18:30~19:30"]);
    expect(enrollBlocks(LIST, OCT_TERM, C650.id, "mwf", "lc")).toEqual(["11:10~12:10", "19:40~20:40"]);
    expect(enrollBlocks(LIST, OCT_TERM, C650.id, "ttf", "rc")).toEqual(["11:10~12:10", "19:40~20:40"]);
    expect(enrollBlocks(LIST, OCT_TERM, C850.id, "mwf", "lc")).toEqual(["13:50~15:00"]);
  });

  it("종합 주5일에는 60분(월수금 RC + 화목금 LC = 두 과목)도 들어간다", () => {
    expect(enrollBlocks(LIST, OCT_TERM, C650.id, "week5", "full")).toEqual([
      "10:00~11:00",
      "10:00~12:10",
      "11:10~12:10",
      "18:30~19:30",
      "18:30~20:40",
      "19:40~20:40",
    ]);
    expect(enrollBlocks(LIST, OCT_TERM, C650.id, "week5", "rc")).toEqual([]);
  });

  it("과목을 아직 안 고른 시간 단위 반은 모른다 — 어느 쪽을 골라도 보여 준다 (짐작해 숨기지 않는다)", () => {
    const withUnknown = [...LIST, s(C750, "mwf", "10:00~11:00", null), s(C750, "mwf", "11:10~12:10", "rc"), s(C750, "mwf", "10:00~12:10", null)];
    expect(enrollKinds(withUnknown, OCT_TERM, C750.id)).toEqual(["full", "rc"]);
    expect(enrollBlocks(withUnknown, OCT_TERM, C750.id, "mwf", "rc")).toEqual(["10:00~11:00", "11:10~12:10"]);
    expect(enrollBlocks(withUnknown, OCT_TERM, C750.id, "mwf", "full")).toEqual(["10:00~11:00", "10:00~12:10"]);
  });

  it("과목 칸을 읽어 오지 않은 목록이면 예전처럼 — 단과를 가리지 않는다", () => {
    const bare = LIST.map(({ subject, ...rest }) => (void subject, rest));
    expect(enrollKinds(bare, OCT_TERM, C650.id)).toEqual(["full"]);
    expect(enrollBlocks(bare, OCT_TERM, C650.id, "mwf", "full")).toEqual([
      "10:00~11:00",
      "10:00~12:10",
      "11:10~12:10",
      "18:30~19:30",
      "18:30~20:40",
      "19:40~20:40",
    ]);
  });

  it("시간대 칸의 분량 — 묶음은 안의 시간 단위 합, 그릇 반 · 통짜 반은 적지 않는다", () => {
    expect(enrollBlockMinutes(LIST, OCT_TERM, C650.id, "10:00~12:10")).toBe(120);
    expect(enrollBlockMinutes(LIST, OCT_TERM, C650.id, "10:00~11:00")).toBe(60);
    expect(enrollBlockMinutes(LIST, OCT_TERM, C850.id, "12:30~15:00")).toBe(140);
    expect(enrollBlockMinutes(LIST, OCT_TERM, C850.id, "13:50~15:00")).toBe(70);
    expect(enrollBlockMinutes(LIST, OCT_TERM, SPARTA.id, "10:00~13:40")).toBeNull();
    expect(enrollBlockMinutes(LIST, OCT_TERM, TWO.id, "12:30~15:00")).toBeNull();
    expect(enrollBlockMinutes(LIST, "2027-01", C650.id, "10:00~12:10")).toBeNull();
    expect(enrollBlockMinutes(LIST, OCT_TERM, 999, "10:00~12:10")).toBeNull();
  });

  it("고른 반들의 종합 · 단과 (승인 팝업 · 승인 화면 이름표)", () => {
    const pick = (...ids: number[]) => LIST.filter((x) => ids.includes(x.id));
    expect(kindOfSections(LIST, pick(id(C650.id, "mwf", "10:00~11:00")))).toBe("rc");
    expect(kindOfSections(LIST, pick(id(C650.id, "mwf", "11:10~12:10")))).toBe("lc");
    expect(kindOfSections(LIST, pick(id(C650.id, "mwf", "10:00~11:00"), id(C650.id, "ttf", "10:00~11:00")))).toBe("full");
    expect(kindOfSections(LIST, pick(id(C650.id, "mwf", "10:00~12:10")))).toBe("full");
    expect(kindOfSections(LIST, pick(id(SPARTA.id, "ttf", "10:00~13:40")))).toBe("full");
    expect(kindOfSections(LIST, pick(id(C850.id, "mwf", "15:30~16:50", VAC)))).toBeNull();
    expect(kindOfSections(LIST, [])).toBeNull();
  });

  describe("resolveEnrollChoice — 서버도 같은 규칙", () => {
    const go = (o: Partial<Parameters<typeof resolveEnrollChoice>[1]>) =>
      resolveEnrollChoice(LIST, { term: OCT_TERM, courseId: C650.id, kind: "rc", track: "mwf", timeBlock: "10:00~11:00", ...o });

    it("RC단과 월수금 10:00~11:00 → 그 시간 단위 반 하나", () => {
      expect(go({})).toEqual({ ok: true, sectionIds: [id(C650.id, "mwf", "10:00~11:00")] });
    });

    it("종합 주5일 60분 → 두 반", () => {
      expect(go({ kind: "full", track: "week5" })).toEqual({
        ok: true,
        sectionIds: [id(C650.id, "mwf", "10:00~11:00"), id(C650.id, "ttf", "10:00~11:00")],
      });
    });

    it("고를 것이 둘 이상인 레벨에서 종합 · 단과를 비우면 무엇이 빠졌는지 알려 준다 (요일보다 먼저)", () => {
      expect(go({ kind: undefined })).toEqual({ ok: false, reason: "종합반인지 단과인지 골라 주세요." });
      expect(go({ kind: "", track: "" })).toEqual({ ok: false, reason: "종합반인지 단과인지 골라 주세요." });
      expect(go({ kind: "both" })).toEqual({ ok: false, reason: "종합반인지 단과인지 다시 골라 주세요." });
    });

    it("한 가지뿐인 레벨(속성반)은 비워도 된다", () => {
      expect(go({ courseId: SPARTA.id, kind: undefined, timeBlock: "10:00~13:40" })).toEqual({ ok: true, sectionIds: [id(SPARTA.id, "mwf", "10:00~13:40")] });
    });

    it("고른 종합 · 단과와 반이 다르면 받지 않는다 — RC단과를 골라 놓고 LC 시간을 보낸 요청", () => {
      const lc = go({ timeBlock: "11:10~12:10" });
      expect(lc).toMatchObject({ ok: false });
      expect((lc as { reason: string }).reason).toBe("고르신 시간대는 RC단과 수업이 아니에요. 시간대를 다시 골라 주세요.");
      expect(go({ kind: "full" })).toMatchObject({ ok: false });
      expect(go({ kind: "lc", track: "ttf" })).toEqual({ ok: true, sectionIds: [id(C650.id, "ttf", "10:00~11:00")] });
    });
  });
});
