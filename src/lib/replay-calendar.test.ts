import { describe, expect, it } from "vitest";
import { dayMarks, daysUntil, monthsOf, replayEmbed, replayInitialDay, replayParts, replayRounds, replayTerms, sortReplays, termFlags, type ReplayEntry, type RoundInput } from "./replay-calendar";
import type { Week5Section } from "./week5";

const entry = (over: Partial<ReplayEntry>): ReplayEntry => ({
  id: 1,
  sessionId: 100,
  date: "2026-10-07",
  seq: 1,
  round: 1,
  level: 650,
  subject: "rc",
  time: "10:00~11:00",
  track: "mwf",
  url: "https://youtu.be/abcdefghijk",
  pair: null,
  ...over,
});

describe("다시보기 일정표 — 달 · 처음 고르는 날", () => {
  it("날짜들이 걸친 달을 오래된 달부터 (9월 기수의 10/1 처럼 다음 달로 넘어간 날도 제 달에)", () => {
    expect(monthsOf(["2026-10-01", "2026-09-04", "2026-09-30", "2026-10-01"])).toEqual([
      { year: 2026, month: 9 },
      { year: 2026, month: 10 },
    ]);
    expect(monthsOf([])).toEqual([]);
  });

  it("오늘까지 녹화본이 올라온 가장 최근 날을 고른다 — 수업 전 아침에 들어와도 어제 녹화본이 먼저", () => {
    const classes = ["2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"];
    expect(replayInitialDay(["2026-10-06"], classes, "2026-10-07")).toBe("2026-10-06");
    // 오늘 수업이 끝나 올라왔으면 오늘
    expect(replayInitialDay(["2026-10-06", "2026-10-07"], classes, "2026-10-07")).toBe("2026-10-07");
    // 앞날짜에 잘못 붙은 녹화본은 처음 고르는 날로 삼지 않는다
    expect(replayInitialDay(["2026-10-06", "2026-10-09"], classes, "2026-10-07")).toBe("2026-10-06");
  });

  it("녹화본이 없으면 내 시간표와 같다 — 오늘 수업일 → 다음 수업일 → 마지막 수업일", () => {
    const classes = ["2026-10-06", "2026-10-08"];
    expect(replayInitialDay([], classes, "2026-10-06")).toBe("2026-10-06");
    expect(replayInitialDay([], classes, "2026-10-07")).toBe("2026-10-08");
    expect(replayInitialDay([], classes, "2026-10-20")).toBe("2026-10-08");
    expect(replayInitialDay([], [], "2026-10-20")).toBeNull();
  });

  it("달을 넘기면 그 달 안에서만 고른다", () => {
    const classes = ["2026-09-28", "2026-09-30", "2026-10-01"];
    const replays = ["2026-09-28", "2026-09-30", "2026-10-01"];
    expect(replayInitialDay(replays, classes, "2026-10-02", { year: 2026, month: 9 })).toBe("2026-09-30");
    expect(replayInitialDay(replays, classes, "2026-10-02", { year: 2026, month: 10 })).toBe("2026-10-01");
    expect(replayInitialDay(replays, classes, "2026-10-02")).toBe("2026-10-01");
    // 그 달에 녹화본이 없으면 그 달의 수업일로
    expect(replayInitialDay([], ["2026-11-03", "2026-11-05"], "2026-10-02", { year: 2026, month: 11 })).toBe("2026-11-03");
  });

  it("D-day 는 한국 날짜끼리 센다 (달을 넘어도)", () => {
    expect(daysUntil("2026-10-07", "2026-10-31")).toBe(24);
    expect(daysUntil("2026-10-31", "2026-10-31")).toBe(0);
    expect(daysUntil("2026-09-30", "2026-10-03")).toBe(3);
    expect(daysUntil("2026-10-04", "2026-10-03")).toBe(-1);
  });
});

describe("다시보기 일정표 — 그 날 녹화본", () => {
  it("수업 시간 → 레벨 → 과목 → 회차 순 (속성반 학생의 650 두 시간 + 850 한 시간)", () => {
    const list = [
      entry({ id: 3, level: 850, subject: "lc", time: "12:30~13:40" }),
      entry({ id: 2, level: 650, subject: "lc", time: "11:10~12:10" }),
      entry({ id: 1, level: 650, subject: "rc", time: "10:00~11:00" }),
      entry({ id: 4, level: 650, subject: null, time: null }),
    ];
    expect(sortReplays(list).map((r) => r.id)).toEqual([1, 2, 3, 4]);
  });

  it("한 회차에 영상이 둘 이상이면 올린 순서로 번호 — 하나뿐이면 번호 없음", () => {
    const parts = replayParts([entry({ id: 7, sessionId: 1 }), entry({ id: 5, sessionId: 1 }), entry({ id: 9, sessionId: 2 })]);
    expect(parts.get(5)).toBe(1);
    expect(parts.get(7)).toBe(2);
    expect(parts.has(9)).toBe(false);
  });

  it("달력 칸 — 수업일의 트랙과 그 날 녹화본 수, 수업일이 아닌 날의 녹화본도 칠한다", () => {
    const marks = dayMarks(
      [
        { date: "2026-10-07", track: "mwf" },
        { date: "2026-10-07", track: "mwf" },
        { date: "2026-10-08", track: "ttf" },
      ],
      [entry({ date: "2026-10-07" }), entry({ id: 2, date: "2026-10-07" }), entry({ id: 3, date: "2026-10-10", track: "ttf" })],
    );
    expect(marks.get("2026-10-07")).toEqual([{ track: "mwf", replays: 2 }]);
    expect(marks.get("2026-10-08")).toEqual([{ track: "ttf", replays: 0 }]);
    expect(marks.get("2026-10-10")).toEqual([{ track: "ttf", replays: 1 }]);
    expect(marks.has("2026-10-09")).toBe(false);
    // 한 날에 두 트랙이 서면 월수금이 앞
    expect(dayMarks([{ date: "2026-10-01", track: "ttf" }, { date: "2026-10-01", track: "mwf" }], []).get("2026-10-01")!.map((m) => m.track)).toEqual(["mwf", "ttf"]);
  });

  it("그 자리에서 트는 주소 — 유튜브는 nocookie(시작 위치까지) · 비메오는 플레이어 · 그 밖은 새 창 · http(s) 가 아니면 열지 않는다", () => {
    expect(replayEmbed("https://www.youtube.com/watch?v=abcdefghijk")).toEqual({
      kind: "youtube",
      src: "https://www.youtube-nocookie.com/embed/abcdefghijk?autoplay=1&rel=0&playsinline=1",
    });
    expect(replayEmbed("https://youtu.be/abcdefghijk?t=90")).toMatchObject({ kind: "youtube", src: expect.stringContaining("&start=90") });
    expect(replayEmbed("https://www.youtube.com/live/abcdefghijk?si=x")).toMatchObject({ kind: "youtube" });
    expect(replayEmbed("https://vimeo.com/123456789")).toEqual({ kind: "vimeo", src: "https://player.vimeo.com/video/123456789?autoplay=1" });
    expect(replayEmbed("https://vimeo.com/123456789/0a1b2c3d4e")).toEqual({ kind: "vimeo", src: "https://player.vimeo.com/video/123456789?autoplay=1&h=0a1b2c3d4e" });
    expect(replayEmbed("https://player.vimeo.com/video/123456789?h=ff00")).toEqual({ kind: "vimeo", src: "https://player.vimeo.com/video/123456789?autoplay=1&h=ff00" });
    // 채널 · 재생목록처럼 영상 하나가 아닌 유튜브 주소, 다른 사이트는 새 창으로
    expect(replayEmbed("https://www.youtube.com/playlist?list=PL123")).toEqual({ kind: "link" });
    expect(replayEmbed("https://drive.google.com/file/d/x/view")).toEqual({ kind: "link" });
    expect(replayEmbed("javascript:alert(1)")).toEqual({ kind: "none" });
    expect(replayEmbed("주소 아님")).toEqual({ kind: "none" });
  });
});

describe("다시보기 일정표 — 볼 수 있는 기간 (종강 D-day · 개강 · 종강 칸)", () => {
  const sec = (term_id: number, opens: string, closes: string, month = 10) => ({ term_id, month, enrollment_opens_at: opens, closes_at: closes });

  it("오늘이 든 기수만, 기수마다 가장 늦은 종강일", () => {
    const terms = replayTerms(
      [
        sec(9, "2026-09-03", "2026-10-03", 9), // 끝난 기수
        sec(10, "2026-10-06", "2026-10-31"),
        sec(10, "2026-10-06", "2026-10-31"), // 주5일 두 반
        sec(11, "2026-11-04", "2026-11-30", 11), // 개강 전 (예비등록)
      ],
      "2026-10-07",
    );
    expect(terms).toEqual([{ termId: 10, month: 10, opens: "2026-10-06", closes: "2026-10-31" }]);
  });

  it("2주완성 학생은 앞 절반 마지막 날이 끝이다 (직접 배정된 반의 종강일)", () => {
    expect(replayTerms([sec(10, "2026-10-06", "2026-10-19")], "2026-10-07")).toEqual([{ termId: 10, month: 10, opens: "2026-10-06", closes: "2026-10-19" }]);
    expect(replayTerms([sec(10, "2026-10-06", "2026-10-19")], "2026-10-20")).toEqual([]);
  });

  it("기수 둘이 겹치면 먼저 끝나는 쪽이 앞 — 종강일 · 개강일 칸", () => {
    const terms = replayTerms([sec(10, "2026-10-06", "2026-10-31"), sec(9, "2026-09-03", "2026-10-06", 9)], "2026-10-06");
    expect(terms.map((t) => t.termId)).toEqual([9, 10]);
    expect(termFlags(terms)).toEqual({ "2026-10-06": ["종강", "개강"], "2026-10-31": ["종강"], "2026-09-03": ["개강"] });
  });
});

describe("다시보기 회차 — 주5일은 월수금 · 화목금을 합친 내 수업일 순서 (2026-10-17 Alan)", () => {
  // 10월 기수(10) — 개강 10/6. 화목금 10/6 · 10/8 · 10/13 · 10/15, 월수금 10/7 · 10/12 · 10/14 · 10/16 (10/9 한글날)
  const TTF = ["2026-10-06", "2026-10-08", "2026-10-13", "2026-10-15"];
  const MWF = ["2026-10-07", "2026-10-12", "2026-10-14", "2026-10-16"];
  const sec = (id: number, track: string, time_block: string, course_id = 650, term_id = 10): Week5Section => ({ id, term_id, course_id, time_block, track });
  // 650 — 묶음 반 10:00~12:10 과 그 안의 시간 단위 반 10:00~11:00 · 11:10~12:10 (월수금 · 화목금)
  const M120 = sec(11, "mwf", "10:00~12:10");
  const T120 = sec(12, "ttf", "10:00~12:10");
  const M10 = sec(21, "mwf", "10:00~11:00");
  const T10 = sec(22, "ttf", "10:00~11:00");
  const M11 = sec(23, "mwf", "11:10~12:10");
  const T11 = sec(24, "ttf", "11:10~12:10");
  const days = (secs: Week5Section[], term = 10) => secs.flatMap((s) => (s.track === "mwf" ? MWF : TTF).map((date) => ({ termId: term, date })));
  const seqOf = (s: Week5Section, date: string) => (s.track === "mwf" ? MWF : TTF).indexOf(date) + 1;
  let nextId = 1;
  const rep = (s: Week5Section, date: string, own = true): RoundInput => ({ id: nextId++, date, seq: seqOf(s, date), section: s, own });
  const rounds = (list: RoundInput[], mine: Week5Section[], classDays = days(mine)) => {
    const out = replayRounds(list, mine, classDays);
    return list.map((r) => out.get(r.id));
  };

  it("주5일 120분 — 10/6 1회차 · 10/7 2회차 · 10/8 3회차 · 10/12 4회차, 같은 날 RC · LC 는 같은 번호 (Alan 화면)", () => {
    const mine = [M120, T120, M10, T10, M11, T11];
    const list = [rep(T10, "2026-10-06"), rep(T11, "2026-10-06"), rep(M10, "2026-10-07"), rep(M11, "2026-10-07"), rep(T10, "2026-10-08"), rep(M10, "2026-10-12"), rep(M11, "2026-10-16")];
    // 반의 회차는 1 · 1 · 1 · 1 · 2 · 2 · 4 — 트랙마다 따로 센다
    expect(list.map((r) => r.seq)).toEqual([1, 1, 1, 1, 2, 2, 4]);
    expect(rounds(list, mine)).toEqual([1, 1, 2, 2, 3, 4, 8]);
  });

  it("주5일 60분 · 650 + 750 를 함께 듣는 테스트 계정도 날짜 순서 (같은 날 레벨이 달라도 같은 번호)", () => {
    expect(rounds([rep(T10, "2026-10-06"), rep(M10, "2026-10-07"), rep(T10, "2026-10-13")], [M10, T10])).toEqual([1, 2, 5]);
    const M750 = sec(31, "mwf", "10:00~11:00", 750);
    const T750 = sec(32, "ttf", "10:00~11:00", 750);
    expect(rounds([rep(T10, "2026-10-06"), rep(T750, "2026-10-06"), rep(M750, "2026-10-07")], [M10, T10, M750, T750])).toEqual([1, 1, 2]);
  });

  it("주3일은 반의 회차 그대로 — 한 트랙뿐이라 그것이 곧 그 수업의 N번째 날 (내 수업일에 다른 수업의 화목금이 섞여 있어도)", () => {
    const mine = [M120, M10, M11];
    expect(rounds([rep(M10, "2026-10-07"), rep(M11, "2026-10-12"), rep(M10, "2026-10-16")], mine, days([M10, T10]))).toEqual([1, 2, 4]);
  });

  it("단과 두 장(월수금 10:00 RC + 화목금 11:10 RC)은 시간이 달라 주5일이 아니다 — 따로 산 두 과정이라 반의 회차 그대로", () => {
    const mine = [M10, T11];
    expect(rounds([rep(T11, "2026-10-06"), rep(M10, "2026-10-07"), rep(T11, "2026-10-08")], mine)).toEqual([1, 1, 2]);
  });

  it("주5일 650 + 750 월수금 단과 — 650 은 날짜 순서, 750 은 반의 회차", () => {
    const M750 = sec(31, "mwf", "11:10~12:10", 750);
    const list = [rep(T10, "2026-10-06"), rep(M10, "2026-10-07"), rep(M750, "2026-10-07"), rep(M750, "2026-10-12")];
    expect(rounds(list, [M10, T10, M750])).toEqual([1, 2, 1, 2]);
  });

  it("속성반 — 품은 650 · 850 시간 단위 반이 두 트랙 다 내 반이면 날짜 순서", () => {
    const S650M = sec(41, "mwf", "10:00~13:40", 6501);
    const S650T = sec(42, "ttf", "10:00~13:40", 6501);
    const M850 = sec(51, "mwf", "12:30~13:40", 850);
    const T850 = sec(52, "ttf", "12:30~13:40", 850);
    const mine = [S650M, S650T, M10, T10, M11, T11, M850, T850];
    expect(rounds([rep(T850, "2026-10-06"), rep(M850, "2026-10-07"), rep(T10, "2026-10-08")], mine)).toEqual([1, 2, 3]);
  });

  it("저녁 반 학생의 오전 짝 녹화본 — 그 강좌를 저녁 주5일로 들으면 날짜 순서, 저녁 월수금만이면 반의 회차", () => {
    const EM = sec(61, "mwf", "18:30~20:40");
    const ET = sec(62, "ttf", "18:30~20:40");
    const EM1 = sec(63, "mwf", "18:30~19:30");
    const ET1 = sec(64, "ttf", "18:30~19:30");
    const list = [rep(T10, "2026-10-06", false), rep(M10, "2026-10-07", false), rep(T11, "2026-10-08", false)];
    expect(rounds(list, [EM, ET, EM1, ET1])).toEqual([1, 2, 3]);
    const mwfOnly = [rep(M10, "2026-10-07", false), rep(M11, "2026-10-12", false)];
    expect(rounds(mwfOnly, [EM, EM1])).toEqual([1, 2]);
    // 다른 강좌의 오전 반이면 주5일이어도 반의 회차 (짝은 같은 강좌다)
    expect(rounds([rep(sec(71, "mwf", "10:00~11:00", 750), "2026-10-07", false)], [EM, ET])).toEqual([1]);
  });

  it("기수마다 따로 센다 — 9월 종강 · 10월 개강이 겹쳐도 10월은 1회차부터", () => {
    const S9M = sec(81, "mwf", "10:00~11:00", 650, 9);
    const S9T = sec(82, "ttf", "10:00~11:00", 650, 9);
    const sep = [
      { termId: 9, date: "2026-09-28" },
      { termId: 9, date: "2026-09-29" },
      { termId: 9, date: "2026-09-30" },
      { termId: 9, date: "2026-10-01" },
    ];
    const list = [
      { id: 900, date: "2026-10-01", seq: 9, section: S9T, own: true },
      { id: 901, date: "2026-10-06", seq: 1, section: T10, own: true },
    ];
    const out = replayRounds(list, [S9M, S9T, M10, T10], [...sep, ...days([M10, T10])]);
    expect(out.get(900)).toBe(4);
    expect(out.get(901)).toBe(1);
  });

  it("내 수업일에서 그 날을 못 찾으면 반의 회차 — 지어낸 번호를 적지 않는다", () => {
    const mine = [M10, T10];
    // 수업일을 못 읽음
    expect(rounds([rep(M10, "2026-10-12")], mine, [])).toEqual([2]);
    // 수업일에 없는 날에 붙은 녹화본
    expect(replayRounds([{ id: 1, date: "2026-10-10", seq: 3, section: M10, own: true }], mine, days(mine)).get(1)).toBe(3);
    // 내 반을 못 읽음 — 주5일인지 모른다
    expect(rounds([rep(M10, "2026-10-12")], [], days([M10, T10]))).toEqual([2]);
  });

  it("2주완성 — 내 수업일이 앞 절반뿐이어도 날짜 순서 (같은 개강일부터 센다)", () => {
    const TW_M = sec(91, "mwf", "12:30~15:00", 8502);
    const TW_T = sec(92, "ttf", "12:30~15:00", 8502);
    const M850 = sec(51, "mwf", "12:30~13:40", 850);
    const T850 = sec(52, "ttf", "12:30~13:40", 850);
    const half = ["2026-10-06", "2026-10-07", "2026-10-08", "2026-10-12"].map((date) => ({ termId: 10, date }));
    expect(rounds([rep(T850, "2026-10-08"), rep(M850, "2026-10-12")], [TW_M, TW_T, M850, T850], half)).toEqual([3, 4]);
  });
});
