import { describe, expect, it } from "vitest";
import { matchSections, pickTerms, type MatchInput } from "./match-sections";
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
});
