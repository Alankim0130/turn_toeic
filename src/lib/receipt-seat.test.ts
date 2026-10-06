import { describe, expect, it } from "vitest";
import {
  closedByApproval,
  replacedByUpload,
  sameSeat,
  seatOfRow,
  seatOfSections,
  slotsOfParsed,
  slotsOfSections,
  type SeatSection,
} from "./receipt-seat";

// 10월 650 편성 (CLAUDE.md 미확정 1): 10:00 = 월수금 RC · 화목금 LC, 11:10 = 월수금 LC · 화목금 RC, 120분 = 두 시간 묶음
const oct = { month: 10 };
const nov = { month: 11 };
const S: Record<number, SeatSection & { id: number }> = {
  1: { id: 1, track: "mwf", time_block: "10:00~11:00", term: oct }, // 월수금 10:00 RC단과
  2: { id: 2, track: "ttf", time_block: "10:00~11:00", term: oct }, // 화목금 10:00 LC
  3: { id: 3, track: "mwf", time_block: "11:10~12:10", term: oct }, // 월수금 11:10 LC
  4: { id: 4, track: "ttf", time_block: "11:10~12:10", term: oct }, // 화목금 11:10 RC단과
  5: { id: 5, track: "mwf", time_block: "10:00~12:10", term: oct }, // 월수금 120분
  6: { id: 6, track: "mwf", time_block: "18:30~19:30", term: oct }, // 저녁 월수금 RC
  7: { id: 7, track: "mwf", time_block: "10:00~11:00", term: nov }, // 11월 월수금 10:00
  8: { id: 8, track: "mwf", time_block: null, term: oct }, // 시간 없이 하나씩 만든 반
  9: { id: 9, track: "mwf", time_block: "10:00~11:00", term: oct }, // 750 월수금 10:00 (레벨만 다르다)
};
const seat = (...ids: number[]) => seatOfSections(ids.map((id) => S[id]));
const sections = new Map(Object.values(S).map((s) => [s.id, s]));

describe("수강증 자리 — 단과 두 개는 다른 강좌, 같은 시간은 같은 등록 (2026-10-06 RC단과 두 장)", () => {
  it("RC단과 둘(월수금 10:00 RC + 화목금 11:10 RC)은 함께 들을 수 있다 — 지우지도 닫지도 않는다", () => {
    expect(sameSeat(seat(1), seat(4))).toBe(false);
    expect(replacedByUpload(seat(1), seat(4))).toBe(false);
    expect(closedByApproval(seat(4), seat(1))).toBe(false);
  });

  it("같은 반을 다시 내면 같은 자리다 — 바꿔 넣고, 승인되면 닫는다", () => {
    expect(sameSeat(seat(1), seat(1))).toBe(true);
    expect(replacedByUpload(seat(1), seat(1))).toBe(true);
    expect(closedByApproval(seat(1), seat(1))).toBe(true);
  });

  it("같은 달 · 같은 트랙에 시간이 겹치면 반을 바꾼 것이다 — 60분 → 120분 · 레벨만 바꿈 · 주3일 → 주5일", () => {
    expect(replacedByUpload(seat(1), seat(5))).toBe(true);
    expect(replacedByUpload(seat(1), seat(9))).toBe(true);
    expect(replacedByUpload(seat(1), seat(1, 2))).toBe(true);
  });

  it("시간이 붙어만 있거나 · 오전과 저녁 · 다른 트랙이면 함께 들을 수 있다", () => {
    expect(sameSeat(seat(1), seat(3))).toBe(false); // 10:00~11:00 · 11:10~12:10
    expect(sameSeat(seat(1), seat(6))).toBe(false); // 오전 · 저녁
    expect(sameSeat(seat(1), seat(2))).toBe(false); // 같은 시간 다른 트랙
    expect(sameSeat(seat(1, 2), seat(3))).toBe(false); // 주5일 60분 + 월수금 11:10 단과
  });

  it("다른 달 수강증은 둘 다 남는다 — 받아 둔 다음 달 수강증을 이번 달 수강증이 지우지 않는다", () => {
    expect(replacedByUpload(seat(7), seat(1))).toBe(false);
    const held = { requested_section_ids: [], candidates: { result: { kind: "none", reason: "11월 반이 없어요" }, hold: 11 }, parsed: { time: { timeBlock: "10:00~11:00" }, tracks: ["mwf"], courseMonth: 11 } };
    expect(replacedByUpload(seatOfRow(held, sections), seat(1))).toBe(false);
    // 같은 11월 수강증을 다시 올리면 바꿔 넣는다
    expect(replacedByUpload(seatOfRow(held, sections), seat(7))).toBe(true);
  });

  it("무엇인지 모르는 옛 수강증(못 읽음)은 예전처럼 바꿔 넣지만 · 승인으로 닫지는 않는다", () => {
    const unread = seatOfRow({ requested_section_ids: [], candidates: null, parsed: null }, sections);
    expect(unread).toMatchObject({ sectionIds: [], slots: null });
    expect(replacedByUpload(unread, seat(1))).toBe(true);
    expect(replacedByUpload(unread, { sectionIds: [], slots: null })).toBe(true);
    expect(closedByApproval(unread, seat(1))).toBe(false);
  });

  it("시간을 못 읽은 받아 둔 다음 달 수강증도 다른 달 수강증이 확실하면 남는다 (같은 달이면 바꿔 넣는다)", () => {
    const held = seatOfRow({ candidates: { result: { kind: "none", reason: "11월 반 없음" }, hold: 11 }, parsed: { time: null, tracks: [] } }, sections);
    expect(held).toMatchObject({ sectionIds: [], slots: null, month: 11 });
    expect(replacedByUpload(held, seat(1))).toBe(false);
    expect(replacedByUpload(held, seat(7))).toBe(true);
    // 새 것도 달을 모르면 예전처럼 바꿔 넣는다
    expect(replacedByUpload(held, { sectionIds: [], slots: null })).toBe(true);
  });

  it("승인으로 닫는 것은 확실할 때만 — 트랙을 못 읽은 수강증은 같은 시간이어도 닫지 않는다 (바꿔 넣기는 한다)", () => {
    const loose = seatOfRow({ parsed: { time: { timeBlock: "10:00~11:00" }, tracks: [], courseMonth: 10 } }, sections);
    expect(closedByApproval(loose, seat(1))).toBe(false);
    expect(replacedByUpload(loose, seat(1))).toBe(true);
    // 달 · 트랙까지 읽혔으면 닫는다
    const full = seatOfRow({ parsed: { time: { timeBlock: "10:00~11:00" }, tracks: ["mwf"], courseMonth: 10 } }, sections);
    expect(closedByApproval(full, seat(1))).toBe(true);
  });

  it("새 것을 못 읽었으면 아는 옛 수강증을 지우지 않는다", () => {
    expect(replacedByUpload(seat(1), { sectionIds: [], slots: null })).toBe(false);
  });

  it("시간이 없는 반은 반 id 로만 견준다 — 같은 반이면 같은 자리, 아니면 견줄 수 없어 둔다", () => {
    expect(slotsOfSections([S[8]])).toBeNull();
    expect(sameSeat(seat(8), seat(8))).toBe(true);
    expect(sameSeat(seat(8), seat(1))).toBeNull();
    expect(replacedByUpload(seat(8), seat(1))).toBe(false);
    expect(closedByApproval(seat(8), seat(1))).toBe(false);
  });
});

describe("수강증에서 읽은 자리 (parsed)", () => {
  it("수강시간 · 트랙 · 수강월(배지 → 개강일 달)", () => {
    expect(slotsOfParsed({ time: { timeBlock: "11:10~12:10" }, tracks: ["ttf"], courseMonth: 10 })).toEqual([{ month: 10, track: "ttf", start: 670, end: 730 }]);
    expect(slotsOfParsed({ time: { timeBlock: "10:00~11:00" }, tracks: ["mwf", "ttf"], courseMonth: null, startMonth: 10 })).toEqual([
      { month: 10, track: "mwf", start: 600, end: 660 },
      { month: 10, track: "ttf", start: 600, end: 660 },
    ]);
  });

  it("트랙 · 달을 못 읽었으면 어느 트랙 · 달과도 겹친다고 본다 (같은 등록일 수 있다)", () => {
    const loose = slotsOfParsed({ time: { timeBlock: "10:00~11:00" }, tracks: [] });
    expect(loose).toEqual([{ month: null, track: null, start: 600, end: 660 }]);
    expect(sameSeat({ sectionIds: [], slots: loose }, seat(2))).toBe(true);
    expect(sameSeat({ sectionIds: [], slots: loose }, seat(7))).toBe(true);
    expect(sameSeat({ sectionIds: [], slots: loose }, seat(4))).toBe(false);
  });

  it("수강시간을 못 읽었으면 자리를 모른다", () => {
    expect(slotsOfParsed({ time: null, tracks: ["mwf"], courseMonth: 10 })).toBeNull();
    expect(slotsOfParsed({ time: { timeBlock: "10시" } })).toBeNull();
    expect(slotsOfParsed(null)).toBeNull();
  });
});

describe("등업신청 한 건의 자리 (seatOfRow)", () => {
  it("수동 등업신청은 학생이 고른 반의 시간 + 수강증 그림에서 읽은 시간을 함께 본다", () => {
    const row = { requested_section_ids: [4], candidates: { nameMatches: true }, parsed: { time: { timeBlock: "11:10~12:10" }, tracks: ["ttf"], courseMonth: 10 } };
    expect(seatOfRow(row, sections)).toMatchObject({
      sectionIds: [4],
      slots: [
        { month: 10, track: "ttf", start: 670, end: 730 },
        { month: 10, track: "ttf", start: 670, end: 730 },
      ],
    });
  });

  it("같은 수강증을 다시 캡처해 반을 고쳐 고르면(10:00 → 11:10) 그림이 같은 강좌라 바꿔 넣는다", () => {
    const first = seatOfRow({ requested_section_ids: [1], file_path: "u/a.png", parsed: { time: { timeBlock: "10:00~11:00" }, tracks: ["mwf"], courseMonth: 10 } }, sections);
    const fixed = seatOfSections([S[3]], { path: "u/b.png", hash: "h9", capturedAt: "2026-10-06T10:00:01" }, { time: { timeBlock: "10:00~11:00" }, tracks: ["mwf"], courseMonth: 10 });
    expect(replacedByUpload(first, fixed)).toBe(true);
  });

  it("RC단과 두 장을 수동 등업신청으로 하나씩 내면 둘 다 남는다 (그림도 서로 다른 강좌)", () => {
    const first = seatOfRow({ requested_section_ids: [1], file_path: "u/a.png", parsed: { time: { timeBlock: "10:00~11:00" }, tracks: ["mwf"], courseMonth: 10 } }, sections);
    const second = seatOfSections([S[4]], { path: "u/b.png", hash: "h2", capturedAt: "2026-10-06T10:02:11" }, { time: { timeBlock: "11:10~12:10" }, tracks: ["ttf"], courseMonth: 10 });
    expect(replacedByUpload(first, second)).toBe(false);
    expect(closedByApproval(seatOfRow({ requested_section_ids: [4], file_path: "u/b.png", parsed: { time: { timeBlock: "11:10~12:10" }, tracks: ["ttf"], courseMonth: 10 } }, sections), seatOfSections([S[1]]))).toBe(false);
  });

  it("수강증만 올리기는 대조가 찾은 반 → 못 찾았으면 수강증에서 읽은 값", () => {
    const matched = { requested_section_ids: [], candidates: { rule: "key-match", result: { kind: "match", sectionIds: [1], term: "2026-10" } }, parsed: null };
    expect(seatOfRow(matched, sections)).toMatchObject({ sectionIds: [1], slots: [{ month: 10, track: "mwf", start: 600, end: 660 }] });
    const none = { requested_section_ids: [], candidates: { result: { kind: "ambiguous", reason: "둘" } }, parsed: { time: { timeBlock: "11:10~12:10" }, tracks: ["ttf"], courseMonth: 10 } };
    expect(seatOfRow(none, sections)).toMatchObject({ sectionIds: [], slots: [{ month: 10, track: "ttf", start: 670, end: 730 }] });
  });

  it("반을 못 찾으면(지워짐) 반 id 는 남기고 시간은 수강증에서 읽는다", () => {
    const row = { requested_section_ids: [404], parsed: { time: { timeBlock: "10:00~11:00" }, tracks: ["mwf"], courseMonth: 10 } };
    expect(seatOfRow(row, sections)).toMatchObject({ sectionIds: [404], slots: [{ month: 10, track: "mwf", start: 600, end: 660 }] });
  });
});

describe("같은 그림이면 무엇을 골랐든 같은 등록이다", () => {
  const row = (over: object) => ({ requested_section_ids: [1], file_path: "u/a.png", file_hash: "h1", parsed: { capturedAt: "2026-10-06T09:12:30" }, ...over });

  it("같은 파일 경로 · 같은 파일 해시 · 같은 초 캡처면 바꿔 넣는다 — 고른 반이 달라도", () => {
    const old = seatOfRow(row({}), sections);
    expect(replacedByUpload(old, seatOfSections([S[4]], { path: "u/a.png" }))).toBe(true);
    expect(replacedByUpload(old, seatOfSections([S[4]], { path: "u/b.png", hash: "h1" }))).toBe(true);
    expect(replacedByUpload(old, seatOfSections([S[4]], { path: "u/b.png", hash: "h2", capturedAt: "2026-10-06T09:12:30" }))).toBe(true);
  });

  it("다른 그림 · 다른 강좌면 둔다 (RC단과 두 장 — 캡처 시각이 다르다)", () => {
    const old = seatOfRow(row({}), sections);
    expect(replacedByUpload(old, seatOfSections([S[4]], { path: "u/b.png", hash: "h2", capturedAt: "2026-10-06T09:13:05" }))).toBe(false);
  });

  it("캡처 시각을 못 읽은 두 수강증은 그것만으로 같다고 보지 않는다", () => {
    const a = seatOfRow(row({ parsed: {} , file_hash: null }), sections);
    const b = seatOfSections([S[4]], { path: "u/b.png", hash: null, capturedAt: null });
    expect(replacedByUpload(a, b)).toBe(false);
  });
});
