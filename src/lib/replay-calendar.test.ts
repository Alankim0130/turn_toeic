import { describe, expect, it } from "vitest";
import { dayMarks, daysUntil, monthsOf, replayEmbed, replayInitialDay, replayParts, replayTerms, sortReplays, termFlags, type ReplayEntry } from "./replay-calendar";

const entry = (over: Partial<ReplayEntry>): ReplayEntry => ({
  id: 1,
  sessionId: 100,
  date: "2026-10-07",
  seq: 1,
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
