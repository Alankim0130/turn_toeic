import { describe, expect, it } from "vitest";
import { matchSections, pickTerms, twoWeekSpots, type MatchInput } from "./match-sections";
import { parseReceipt } from "./receipt";
import type { EnrollSection } from "./enroll-options";

/** 2026년 9월 편성표 모양의 열린 반 (CLAUDE.md 미확정 1 — 60분·120분 반이 따로 있고 850 은 세 시간대) */
const SEP = { year: 2026, month: 9 };
const OCT = { year: 2026, month: 10 };
const course = (id: number, target: number, program = "score") => ({ id, name: `${target}`, program, target_score: target });
let seq = 0;
const sec = (term: { year: number; month: number }, track: "mwf" | "ttf", c: ReturnType<typeof course>, time_block: string): EnrollSection => ({
  id: ++seq,
  track,
  time_block,
  term,
  course: c,
});
const C650 = course(1, 650), C750 = course(2, 750), C850 = course(3, 850), S650 = course(4, 650, "sparta");
const SECTIONS: EnrollSection[] = [];
for (const term of [SEP, OCT]) {
  for (const track of ["mwf", "ttf"] as const) {
    for (const c of [C650, C750]) {
      for (const tb of ["10:00~11:00", "11:10~12:10", "10:00~12:10", "18:30~19:30", "19:40~20:40", "18:30~20:40"]) SECTIONS.push(sec(term, track, c, tb));
    }
    for (const tb of ["12:30~13:40", "13:50~15:00", "12:30~15:00"]) SECTIONS.push(sec(term, track, C850, tb));
    SECTIONS.push(sec(term, track, S650, "10:00~13:40"));
  }
}
const find = (term: { year: number; month: number }, track: string, cid: number, tb: string) =>
  SECTIONS.find((s) => s.term === term && s.track === track && s.course!.id === cid && s.time_block === tb)!.id;

const base: MatchInput = {
  level: 650,
  levels: [650],
  courseLevel: null,
  program: "score",
  weekly: 3,
  tracks: ["mwf"],
  time: { start: "10:00", end: "11:00", minutes: 60, timeBlock: "10:00~11:00" },
  courseMonth: 9,
  startMonth: null,
};

describe("반 자동 대조", () => {
  it("주3일 60분: 딱 한 반", () => {
    const { result } = matchSections(base, SECTIONS);
    expect(result).toEqual({ kind: "match", sectionIds: [find(SEP, "mwf", 1, "10:00~11:00")], term: "2026-09" });
  });

  it("주5일 120분: 같은 시간대의 월수금 + 화목금 두 반", () => {
    const { result } = matchSections({ ...base, weekly: 5, tracks: ["mwf", "ttf"], time: { start: "10:00", end: "12:10", minutes: 130, timeBlock: "10:00~12:10" } }, SECTIONS);
    expect(result).toEqual({ kind: "match", sectionIds: [find(SEP, "mwf", 1, "10:00~12:10"), find(SEP, "ttf", 1, "10:00~12:10")], term: "2026-09" });
  });

  it("60분 수강증은 120분 반에 붙지 않는다 (시간대 문자열 정확 일치)", () => {
    const { result } = matchSections({ ...base, time: { start: "10:00", end: "11:00", minutes: 60, timeBlock: "10:00~11:00" } }, SECTIONS);
    expect(result.kind).toBe("match");
    expect((result as { sectionIds: number[] }).sectionIds).not.toContain(find(SEP, "mwf", 1, "10:00~12:10"));
  });

  it("프리미어반은 스파르타 강좌에만 붙는다", () => {
    const { result } = matchSections({ ...base, program: "sparta", weekly: 5, tracks: ["mwf", "ttf"], time: { start: "10:00", end: "13:40", minutes: 220, timeBlock: "10:00~13:40" } }, SECTIONS);
    expect(result).toEqual({ kind: "match", sectionIds: [find(SEP, "mwf", 4, "10:00~13:40"), find(SEP, "ttf", 4, "10:00~13:40")], term: "2026-09" });
  });

  it("850 140분(12:30~15:00)은 묶음 반 하나에 붙는다", () => {
    const { result } = matchSections({ ...base, level: 850, weekly: 5, tracks: ["mwf", "ttf"], time: { start: "12:30", end: "15:00", minutes: 150, timeBlock: "12:30~15:00" } }, SECTIONS);
    expect(result).toEqual({ kind: "match", sectionIds: [find(SEP, "mwf", 3, "12:30~15:00"), find(SEP, "ttf", 3, "12:30~15:00")], term: "2026-09" });
  });

  it("수강월: 배지(NN월 과정)가 최우선, 없으면 수강요일 줄의 개강일 달, 그래도 없고 두 달이 열려 있으면 애매", () => {
    expect(pickTerms({ courseMonth: 10, startMonth: 9 }, ["2026-09", "2026-10"])).toEqual(["2026-10"]);
    expect(pickTerms({ courseMonth: null, startMonth: 10 }, ["2026-09", "2026-10"])).toEqual(["2026-10"]);
    expect(pickTerms({ courseMonth: null, startMonth: null }, ["2026-09", "2026-10"])).toEqual(["2026-09", "2026-10"]);
    const { result } = matchSections({ ...base, courseMonth: null }, SECTIONS);
    expect(result.kind).toBe("ambiguous");
  });

  it("열린 기수가 하나뿐이면 달을 못 읽어도 그 달로 맞춘다", () => {
    const only = SECTIONS.filter((s) => s.term === SEP);
    const { result } = matchSections({ ...base, courseMonth: null }, only);
    expect(result.kind).toBe("match");
  });

  // 2026-09-22 오류 점검 — 둘 다 **엉뚱한 달 반에 자동 배정**되던 경우다
  it("캡처 시각으로 달을 고르지 않는다 — 9월 25일에 캡처한 10월 수강증(배지 못 읽음)이 9월 반에 붙지 않는다", () => {
    const p = parseReceipt(
      ["현재시간 2026-09-25 19:27:43", "역전토익 [종합반]", "650 목표", "수강센터 부산 서면센터", "강의실 본관 701호", "수강요일 [4주-10/07] 월수금 (월9회)", "수강시간 10:00~11:00"].join("\n"),
    );
    expect(p.courseMonth).toBeNull();
    expect(matchSections(p, SECTIONS).result).toEqual({ kind: "match", sectionIds: [find(OCT, "mwf", 1, "10:00~11:00")], term: "2026-10" });
    // 개강일 줄까지 못 읽었으면 두 달 중 고르지 않는다
    expect(matchSections(parseReceipt(p.text.replace("[4주-10/07] ", "")), SECTIONS).result.kind).toBe("ambiguous");
  });

  it("수강월을 읽었는데 그 달 반이 없으면 다른 달로 넘어가지 않는다 — 10월 수강증을 9월 반에 붙이지 않는다", () => {
    const sepOnly = SECTIONS.filter((s) => s.term === SEP);
    expect(matchSections({ ...base, courseMonth: 10 }, sepOnly).result).toMatchObject({ kind: "none" });
  });

  it("레벨이 흔들리면 대조하지 않는다 — 과정명과 숫자가 다르거나, 점수보장반에 레벨 숫자가 여럿", () => {
    const S750 = course(5, 750, "sparta");
    const sparta750 = [sec(SEP, "mwf", S750, "10:00~13:40"), sec(SEP, "ttf", S750, "10:00~13:40")];
    const spartaIn: MatchInput = { ...base, level: 750, levels: [750], courseLevel: 650, program: "sparta", weekly: 5, tracks: ["mwf", "ttf"], time: { start: "10:00", end: "13:40", minutes: 220, timeBlock: "10:00~13:40" } };
    expect(matchSections(spartaIn, sparta750).result.kind).toBe("ambiguous");
    expect(matchSections({ ...spartaIn, courseLevel: 750 }, sparta750).result.kind).toBe("match");
    expect(matchSections({ ...base, levels: [650, 750] }, SECTIONS).result.kind).toBe("ambiguous");
    // 스파르타는 두 레벨을 함께 들어 숫자가 여럿일 수 있다 — 막지 않는다
    expect(matchSections({ ...base, levels: [650, 850], program: "sparta", weekly: 5, tracks: ["mwf", "ttf"], time: { start: "10:00", end: "13:40", minutes: 220, timeBlock: "10:00~13:40" } }, SECTIONS).result.kind).toBe("match");
  });

  it("맞는 시간대의 반이 없으면 none", () => {
    const { result } = matchSections({ ...base, time: { start: "09:00", end: "10:00", minutes: 60, timeBlock: "09:00~10:00" } }, SECTIONS);
    expect(result).toMatchObject({ kind: "none" });
  });

  it("주5일인데 한 트랙만 열려 있으면 none — 반 하나에 몰래 붙이지 않는다", () => {
    const noTtf = SECTIONS.filter((s) => !(s.track === "ttf" && s.course!.id === 1 && s.time_block === "10:00~12:10" && s.term === SEP));
    const { result } = matchSections({ ...base, weekly: 5, tracks: ["mwf", "ttf"], time: { start: "10:00", end: "12:10", minutes: 130, timeBlock: "10:00~12:10" } }, noTtf);
    expect(result).toMatchObject({ kind: "none" });
  });

  it("레벨·시간·주를 하나라도 못 읽으면 대조하지 않는다", () => {
    expect(matchSections({ ...base, level: null }, SECTIONS).result.kind).toBe("none");
    expect(matchSections({ ...base, time: null }, SECTIONS).result.kind).toBe("none");
    expect(matchSections({ ...base, weekly: null, tracks: [] }, SECTIONS).result.kind).toBe("none");
  });

  it("같은 레벨 반마다 어느 키가 맞았는지 기록한다", () => {
    const { log } = matchSections(base, SECTIONS);
    const hit = log.find((l) => l.section_id === find(SEP, "mwf", 1, "10:00~11:00"))!;
    expect(hit.match).toEqual({ time: true, program: true, term: true, track: true });
    const other = log.find((l) => l.section_id === find(OCT, "ttf", 1, "10:00~12:10"))!;
    expect(other.match).toEqual({ time: false, program: true, term: false, track: false });
  });

  it("실제 수강증 양식 → 판독 → 대조까지 한 번에", () => {
    const parsed = parseReceipt(
      ["현재시간 2026-09-02 19:27:43", "09월 과정", "역전토익 [종합반]", "750 목표", "수강생 김민수", "수강센터 부산 서면센터", "강사 이영수", "수강요일 [4주-09/04] 주5일 (월18회 라이브방송)", "수강시간 18:30~20:40"].join("\n"),
    );
    expect(parsed.courseMonth).toBe(9);
    const { result } = matchSections(parsed, SECTIONS);
    expect(result).toEqual({ kind: "match", sectionIds: [find(SEP, "mwf", 2, "18:30~20:40"), find(SEP, "ttf", 2, "18:30~20:40")], term: "2026-09" });
    expect(parsed.mode).toBe("live");
  });

  it("불라방 수강증도 수강시간으로 반을 고른다 — 시간을 못 읽으면 아무 시간 반에나 붙이지 않는다 (2026-09-22 Alan)", () => {
    // Alan: "불라방도 시간 적용을 해야해" — 불라방은 별도 반이 아니라 같은 반의 수강 방식이라, 시간대마다 반(= 방송·강사)이 다르다
    const live = (time: string | null) =>
      parseReceipt(
        ["09월 과정", "역전토익 [단과반]", "650 목표", "수강생 김민수", "수강센터 부산 서면센터", "강사 이혜영", "강의실 온라인 강의", "수강요일 [4주-09/04] 월수금 (월9회 라이브방송)", time ? `수강시간 ${time}` : ""].join("\n"),
      );
    const at1110 = live("11:10~12:10");
    expect(at1110.mode).toBe("live");
    expect(matchSections(at1110, SECTIONS).result).toEqual({ kind: "match", sectionIds: [find(SEP, "mwf", 1, "11:10~12:10")], term: "2026-09" });
    expect(matchSections(live("18:30~19:30"), SECTIONS).result).toEqual({ kind: "match", sectionIds: [find(SEP, "mwf", 1, "18:30~19:30")], term: "2026-09" });
    expect(matchSections(live(null), SECTIONS).result.kind).toBe("none");
  });
});

/**
 * 방학달 — 새 시간표가 생기면 그 시간표대로 수강증이 새로 나온다 (2026-09-29 Alan "방학같은 경우는 새로운 시간표가 생기면서
 * 해당시간표 수강증이 새로 생길거야. … 우리는 거기에 맞는 권한을 다 부여해야해").
 * 반은 **그 달 시간표**(달마다 한 벌)에서 만들어져 시간대 라벨이 곧 시간표의 시각이다. 대조는 그 라벨과 수강증 수강시간의 **정확 일치**라,
 * 방학달 시간표를 브로슈어(= 수강증) 시각 그대로 적어 두면 새 수강증이 그 달 반에 붙는다. 방학달 반은 60분 시간 단위가 없는 통짜 120분이다.
 */
describe("방학달 시간표로 만든 반 — 새 수강증이 그 달 반에 붙는다", () => {
  const DEC = { year: 2026, month: 12 };
  const JAN = { year: 2027, month: 1 };
  const FEB = { year: 2027, month: 2 };
  const S750 = course(5, 750, "sparta");
  const V: EnrollSection[] = [];
  const both = (term: { year: number; month: number }, c: ReturnType<typeof course>, tb: string) => {
    for (const track of ["mwf", "ttf"] as const) V.push(sec(term, track, c, tb));
  };
  // 12월(평달) — 10:00~12:10 이 있지만 1월 수강증이 붙으면 안 된다
  both(DEC, C650, "10:00~12:10");
  // 1월(방학달) — 2026년 여름 브로슈어 모양: 통짜 120분 · 저녁 17:00~19:10(월수금 현강 + 화목금 인강) · 850 · 스파르타 200/180/240분
  for (const tb of ["10:00~12:10", "12:30~14:40", "17:00~19:10"]) both(JAN, C650, tb);
  for (const tb of ["10:00~12:10", "12:30~14:40", "17:00~19:10"]) both(JAN, C750, tb);
  both(JAN, C850, "12:30~14:40");
  for (const tb of ["12:30~16:50", "15:30~19:10", "10:00~13:30"]) both(JAN, S650, tb);
  for (const tb of ["12:30~16:50", "10:00~14:40", "10:00~13:30"]) both(JAN, S750, tb);
  // 2월 — 시간표가 1월과 다르다 (예: 650 이 09:30 으로 당겨짐)
  both(FEB, C650, "09:30~11:40");

  const pair = (term: { year: number; month: number }, cid: number, tb: string) =>
    ["mwf", "ttf"].map((t) => V.find((s) => s.term === term && s.track === t && s.course!.id === cid && s.time_block === tb)!.id);
  const receipt = (lines: string[]) =>
    parseReceipt(["현재시간 2026-12-20 14:02:11", ...lines, "수강생 김민수", "수강센터 부산 서면센터", "강사 이영수 .이혜영"].join("\n"));

  it("1월 650 한달 점수보장반 10:00~12:10 불라방 — 1월 두 반 (12월의 같은 시각 반이 아니라)", () => {
    const p = receipt(["01월 과정", "역전토익 [종합반]", "650 목표", "강의실 온라인 강의", "수강요일 [4주-01/05] 주5일 (월18회 라이브방송)", "수강시간 10:00~12:10"]);
    expect(p.courseMonth).toBe(1);
    expect(p.mode).toBe("live");
    expect(matchSections(p, V).result).toEqual({ kind: "match", sectionIds: pair(JAN, 1, "10:00~12:10"), term: "2027-01" });
  });

  it("1월 저녁 17:00~19:10 (월수금 현강 + 화목금 인강) — 저녁 두 반, 현장", () => {
    const p = receipt(["01월 과정", "역전토익 [종합반]", "750 목표", "강의실 본관 701호", "수강요일 [4주-01/05] 주5일 (월18회) 월수금(현강)+화목금(인강)", "수강시간 17:00~19:10"]);
    expect(p.mode).toBe("onsite");
    expect(matchSections(p, V).result).toEqual({ kind: "match", sectionIds: pair(JAN, 2, "17:00~19:10"), term: "2027-01" });
  });

  it("1월 중급속성(프리미어반) 200분 12:30~16:50 — 스파르타 650 반에만 붙는다 (650·850 권한은 DB 가 연다)", () => {
    const p = receipt(["01월 과정", "역전토익 [종합반] 프리미어반", "650 목표 중급속성", "강의실 본관 701호", "수강요일 [4주-01/05] 주5일 (월18회) 프리미어반", "수강시간 12:30~16:50"]);
    expect(p.program).toBe("sparta");
    expect(matchSections(p, V).result).toEqual({ kind: "match", sectionIds: pair(JAN, 4, "12:30~16:50"), term: "2027-01" });
  });

  it("1월 실전속성 240분 10:00~14:40 — 같은 10:00 시작이어도 180분 반(10:00~13:30)이 아니라 240분 반", () => {
    const p = receipt(["01월 과정", "역전토익 [종합반] 프리미어반", "750 목표 실전속성", "강의실 본관 701호", "수강요일 [4주-01/05] 주5일 (월18회) 프리미어반", "수강시간 10:00~14:40"]);
    expect(matchSections(p, V).result).toEqual({ kind: "match", sectionIds: pair(JAN, 5, "10:00~14:40"), term: "2027-01" });
  });

  it("2월 시간표가 달라지면 2월 수강증은 2월 시각의 반에 붙는다", () => {
    const p = receipt(["02월 과정", "역전토익 [종합반]", "650 목표", "강의실 본관 701호", "수강요일 [4주-02/02] 주5일 (월18회)", "수강시간 09:30~11:40"]);
    expect(matchSections(p, V).result).toEqual({ kind: "match", sectionIds: pair(FEB, 1, "09:30~11:40"), term: "2027-02" });
  });

  it("시간표에 없는 시각의 수강증은 아무 반에도 붙이지 않는다 — 강사 검토로 간다 (시간표 시각을 수강증과 똑같이 적어야 하는 까닭)", () => {
    // 2월에 1월 시각(10:00~12:10)으로 낸 수강증 · 1월에 없는 13:00~15:10
    const feb = receipt(["02월 과정", "역전토익 [종합반]", "650 목표", "강의실 본관 701호", "수강요일 [4주-02/02] 주5일 (월18회)", "수강시간 10:00~12:10"]);
    expect(matchSections(feb, V).result.kind).toBe("none");
    const jan = receipt(["01월 과정", "역전토익 [종합반]", "650 목표", "강의실 본관 701호", "수강요일 [4주-01/05] 주5일 (월18회)", "수강시간 13:00~15:10"]);
    expect(matchSections(jan, V).result.kind).toBe("none");
  });
});

describe("2주완성 (2026-10-05) — 같은 850 12:30~15:00 이어도 과정으로 가른다", () => {
  const T850 = course(9, 850, "twoweek");
  const withTwoWeek: EnrollSection[] = [
    ...SECTIONS,
    { id: 9001, track: "mwf", time_block: "12:30~15:00", term: OCT, course: T850 },
    { id: 9002, track: "ttf", time_block: "12:30~15:00", term: OCT, course: T850 },
  ];
  const at850 = { ...base, level: 850, levels: [850], weekly: 5 as const, tracks: ["mwf", "ttf"] as ("mwf" | "ttf")[], courseMonth: 10, time: { start: "12:30", end: "15:00", minutes: 150, timeBlock: "12:30~15:00" } };

  it("2주완성 수강증 → 2주완성 반 두 개 (한 달짜리 850 묶음 반에 붙지 않는다)", () => {
    const { result } = matchSections({ ...at850, program: "twoweek" }, withTwoWeek);
    expect(result).toEqual({ kind: "match", sectionIds: [9001, 9002], term: "2026-10" });
  });

  const month850 = () => [find(OCT, "mwf", 3, "12:30~15:00"), find(OCT, "ttf", 3, "12:30~15:00")];

  it("한 달 850 수강증(`[4주-`)은 그대로 점수보장반 묶음 반 — 2주완성 반이 함께 열려 있어도", () => {
    const { result } = matchSections({ ...at850, program: "score", weeks: 4 }, withTwoWeek);
    expect(result).toEqual({ kind: "match", sectionIds: month850(), term: "2026-10" });
  });

  it("기간 숫자를 또렷이 못 읽었으면 한 달 반을 찾되 periodUnclear — 앞 절반 학생이 한 달 반에 붙지 않게 사람이 본다", () => {
    for (const weeks of [null, undefined]) {
      const { result } = matchSections({ ...at850, program: "score", weeks }, withTwoWeek);
      expect(result).toEqual({ kind: "match", sectionIds: month850(), term: "2026-10", periodUnclear: true });
    }
  });

  it("periodUnclear 는 2주완성이 열리는 레벨 · 시간에서만 — 다른 수강증은 예전 그대로", () => {
    // 2주완성 반도 시간표 줄도 없다
    expect(matchSections({ ...at850, program: "score", weeks: null }, SECTIONS).result).not.toHaveProperty("periodUnclear");
    // 70분 수강증 — 2주완성(140분 한 줄)과 시간이 다르다
    const at70 = { ...at850, program: "score" as const, weeks: null, time: { start: "12:30", end: "13:40", minutes: 70, timeBlock: "12:30~13:40" } };
    expect(matchSections(at70, withTwoWeek).result).not.toHaveProperty("periodUnclear");
    // 다른 레벨
    expect(matchSections({ ...base, weeks: null, courseMonth: 10 }, withTwoWeek).result).not.toHaveProperty("periodUnclear");
    // 2주완성 수강증 자체
    expect(matchSections({ ...at850, program: "twoweek", weeks: 2 }, withTwoWeek).result).not.toHaveProperty("periodUnclear");
  });

  it("기수는 보지 않는다 — 2주완성 반이 10월에만 있어도 9월 수강증이 숫자를 못 읽었으면 사람이 본다 (읽기 전에는 수강월을 모른다)", () => {
    expect(matchSections({ ...at850, program: "score", weeks: null, courseMonth: 9 }, withTwoWeek).result).toEqual({
      kind: "match",
      sectionIds: [find(SEP, "mwf", 3, "12:30~15:00"), find(SEP, "ttf", 3, "12:30~15:00")],
      term: "2026-09",
      periodUnclear: true,
    });
  });

  it("그 달 2주완성 반을 아직 안 열었어도 시간표에 2주완성 줄이 있으면 막는다 — 숫자를 못 읽은 2주완성 수강증이 한 달 반에 들어가지 않게", () => {
    const spots = twoWeekSpots(SECTIONS, [{ level: 850, start_time: "12:30:00", end_time: "15:00:00" }]);
    expect([...spots]).toEqual(["850|12:30~15:00"]);
    expect(matchSections({ ...at850, program: "score", weeks: null }, SECTIONS, { twoWeekSpots: spots }).result).toEqual({
      kind: "match",
      sectionIds: month850(),
      term: "2026-10",
      periodUnclear: true,
    });
    // `[4주-` 를 읽었으면 그대로 자동 승인 길
    expect(matchSections({ ...at850, program: "score", weeks: 4 }, SECTIONS, { twoWeekSpots: spots }).result).not.toHaveProperty("periodUnclear");
  });

  it("twoWeekSpots — 열린 2주완성 반과 시간표 줄을 합친다 (점수보장반 · 속성반 반은 세지 않는다)", () => {
    expect([...twoWeekSpots(withTwoWeek)]).toEqual(["850|12:30~15:00"]);
    expect([...twoWeekSpots(SECTIONS)]).toEqual([]);
    expect([...twoWeekSpots(withTwoWeek, [{ level: 850, start_time: "12:30:00", end_time: "15:00:00" }, { level: 750, start_time: "10:00:00", end_time: "12:10:00" }])].sort()).toEqual([
      "750|10:00~12:10",
      "850|12:30~15:00",
    ]);
  });

  it("수강증 글자 그대로 — `850 목표` · `[2주-10/06] 주5일 (월9회)` 는 2주완성 반 두 개, `[4주-…` 는 한 달 반", () => {
    const read = (days: string) =>
      parseReceipt(["10월 과정", "역전토익 [종합반]", "850 목표", "수강센터 부산 서면센터", "강의실 본관 701호", days, "수강시간 12:30~15:00"].join("\n"));
    expect(matchSections(read("수강요일 [2주-10/06] 주5일 (월9회)"), withTwoWeek).result).toEqual({ kind: "match", sectionIds: [9001, 9002], term: "2026-10" });
    expect(matchSections(read("수강요일 [4주-10/06] 주5일 (월18회)"), withTwoWeek).result).toEqual({ kind: "match", sectionIds: month850(), term: "2026-10" });
  });

  it("2주완성 반이 아직 없으면 '850 2주완성 … 에 열린 반이 없어요'", () => {
    const { result } = matchSections({ ...at850, program: "twoweek" }, SECTIONS);
    expect(result.kind).toBe("none");
    expect((result as { reason: string }).reason).toBe("850 2주완성 12:30~15:00 에 열린 반이 없어요");
  });
});
