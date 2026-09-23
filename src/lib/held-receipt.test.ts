import { describe, expect, it } from "vitest";
import { heldReady, toMatchInput, type StoredParsed } from "./held-receipt";
import { matchSections } from "./match-sections";
import { parseReceipt } from "./receipt";
import { heldMonth } from "./verify-decision";
import type { EnrollSection } from "./enroll-options";

const SEP = { year: 2026, month: 9 };
const OCT = { year: 2026, month: 10 };
const course = (id: number, target: number, program = "score") => ({ id, name: `${target}`, program, target_score: target });
const C650 = course(1, 650), C750 = course(2, 750);
let seq = 0;
const sec = (term: typeof SEP, track: "mwf" | "ttf", c: ReturnType<typeof course>, time_block: string): EnrollSection => ({ id: ++seq, track, time_block, term, course: c });

/** 10월 과정 650 주5일 120분 불라방 수강증을 9월에 올렸다 — 올린 날의 판독 결과를 저장해 둔 모양 (actions.ts 의 parsedSummary) */
const stored = (() => {
  const p = parseReceipt(
    ["현재시간 2026-09-20 10:00:00", "10월 과정", "역전토익 [종합반]", "650 목표", "수강생 김민수", "수강센터 부산 서면센터", "강사 이영수 .이혜영", "강의실 온라인 강의", "수강요일 [4주-10/06] 주5일 (월18회 라이브방송)", "수강시간 10:00~12:10"].join("\n"),
  );
  const { gates, mode, modeEvidence, card, brandExact, weekly, tracks, levels, level, courseLevel, program, time, courseMonth, startMonth, capturedOn, capturedAt } = p;
  // JSON 으로 저장했다가 읽는다 (DB 를 한 번 거친 값)
  return JSON.parse(JSON.stringify({ gates, mode, modeEvidence, card, brandExact, weekly, tracks, levels, level, courseLevel, program, time, courseMonth, startMonth, capturedOn, capturedAt, nameMatches: true })) as StoredParsed;
})();

describe("받아 둔 다음 달 수강증 다시 맞추기 (2026-09-22 Alan — 다음 달 수강증은 예비등록생으로 받아 준다)", () => {
  it("그 달 · 그 레벨 반이 열려야 맞춘다 — 650 반부터 연 달에 750 수강증은 계속 기다린다", () => {
    const sepOnly = [sec(SEP, "mwf", C650, "10:00~12:10"), sec(SEP, "ttf", C650, "10:00~12:10")];
    expect(heldReady(10, stored, sepOnly)).toBe(false);

    const oct750 = [...sepOnly, sec(OCT, "mwf", C750, "10:00~12:10")];
    expect(heldReady(10, stored, oct750)).toBe(false);

    const oct650 = [...oct750, sec(OCT, "mwf", C650, "10:00~12:10")];
    expect(heldReady(10, stored, oct650)).toBe(true);
  });

  it("레벨을 못 읽은 수강증은 그 달 반이 하나라도 열리면 스태프에게 넘긴다 (어차피 자동으로 못 맞춘다)", () => {
    expect(heldReady(10, { ...stored, level: null }, [sec(OCT, "mwf", C750, "18:30~20:40")])).toBe(true);
    expect(heldReady(10, { ...stored, level: null }, [sec(SEP, "mwf", C750, "18:30~20:40")])).toBe(false);
  });

  it("저장해 둔 판독 결과로 올린 날과 같은 대조를 한다 — 10월 주5일 두 반", () => {
    const sections = [
      sec(SEP, "mwf", C650, "10:00~12:10"),
      sec(SEP, "ttf", C650, "10:00~12:10"),
      sec(OCT, "mwf", C650, "10:00~12:10"),
      sec(OCT, "ttf", C650, "10:00~12:10"),
      sec(OCT, "mwf", C650, "10:00~11:00"),
    ];
    const { result } = matchSections({ ...toMatchInput(stored), courseMonth: 10 }, sections);
    expect(result).toEqual({ kind: "match", sectionIds: [sections[2].id, sections[3].id], term: "2026-10" });
  });

  it("수강월을 받아 둔 달로 못박는다 — 날짜로만 달을 읽은 수강증이 열려 있는 이번 달 반에 붙지 않는다", () => {
    const noMonth: StoredParsed = { ...stored, courseMonth: null, startMonth: null };
    const sepOnly = [sec(SEP, "mwf", C650, "10:00~12:10"), sec(SEP, "ttf", C650, "10:00~12:10")];
    // 달을 못박지 않으면 열린 기수가 9월 하나라 9월 반에 붙는다 — 이게 막으려는 것이다
    expect(matchSections(toMatchInput(noMonth), sepOnly).result.kind).toBe("match");
    expect(matchSections({ ...toMatchInput(noMonth), courseMonth: 10 }, sepOnly).result.kind).toBe("none");
  });

  it("빠진 칸은 '못 읽음' 으로 채운다 — 대조가 알아서 멈춘다", () => {
    const input = toMatchInput({});
    expect(input).toEqual({ level: null, levels: [], courseLevel: null, program: "score", weekly: null, tracks: [], time: null, courseMonth: null, startMonth: null });
    expect(matchSections(input, [sec(OCT, "mwf", C650, "10:00~12:10")]).result.kind).toBe("none");
  });

  it("받아 둔 달 표시는 1~12 의 정수만 읽는다 (JSON null · 문자열은 아니다)", () => {
    expect(heldMonth(10)).toBe(10);
    expect(heldMonth(null)).toBeNull();
    expect(heldMonth("10")).toBeNull();
    expect(heldMonth(13)).toBeNull();
    expect(heldMonth(undefined)).toBeNull();
  });
});
