import { describe, expect, it } from "vitest";
import { compareSessions, forInstructor, isYoutubeUrl, isZoomUrl, linkKindLabel, nowKst, pickFocus, sessionState } from "./live-links";

const at = (h: number, m = 0) => h * 60 + m;
const row = (id: number, date: string, time_block: string | null) => ({ id, date, time_block });

describe("isYoutubeUrl — 다시보기로 올라가는 주소 (DB private.is_youtube_url 과 같은 규칙)", () => {
  it.each([
    "https://www.youtube.com/live/abc123",
    "https://youtube.com/watch?v=abc",
    "https://m.youtube.com/watch?v=abc",
    "https://youtu.be/abc123",
    "http://www.youtube.com/watch?v=abc",
  ])("%s 는 유튜브", (u) => expect(isYoutubeUrl(u)).toBe(true));

  it.each([
    "https://us06web.zoom.us/j/81234567890?pwd=abc",
    "https://zoom.us/j/123",
    "https://notyoutube.com/watch?v=abc",
    "https://youtube.com.evil.example/watch",
    "javascript:alert(1)",
    "not a url",
    "",
    null,
  ])("%s 는 유튜브가 아니다", (u) => expect(isYoutubeUrl(u)).toBe(false));
});

describe("isZoomUrl · linkKindLabel", () => {
  it("Zoom 주소와 하위 도메인", () => {
    expect(isZoomUrl("https://us06web.zoom.us/j/81234567890?pwd=abc")).toBe(true);
    expect(isZoomUrl("https://zoom.us/j/1")).toBe(true);
    expect(isZoomUrl("https://zoom.us.evil.example/j/1")).toBe(false);
  });
  it("칩 이름", () => {
    expect(linkKindLabel("https://us02web.zoom.us/j/1")).toBe("Zoom");
    expect(linkKindLabel("https://youtu.be/x")).toBe("유튜브");
    expect(linkKindLabel("https://meet.google.com/abc")).toBe("링크");
  });
});

describe("nowKst — 한국 날짜와 분", () => {
  it("UTC 15:30 은 한국 다음 날 00:30", () => {
    expect(nowKst(new Date("2026-09-30T15:30:00Z"))).toEqual({ date: "2026-10-01", minutes: 30 });
  });
  it("UTC 01:05 는 한국 10:05", () => {
    expect(nowKst(new Date("2026-09-30T01:05:00Z"))).toEqual({ date: "2026-09-30", minutes: 605 });
  });
});

describe("sessionState — 지난 수업 · 지금 · 앞으로", () => {
  const today = "2026-10-07";
  const s = row(1, today, "10:00~11:00");
  it("시작 30분 전부터 끝까지 지금", () => {
    expect(sessionState(s, today, at(9, 29))).toBe("later");
    expect(sessionState(s, today, at(9, 30))).toBe("now");
    expect(sessionState(s, today, at(11, 0))).toBe("now");
    expect(sessionState(s, today, at(11, 1))).toBe("past");
  });
  it("다른 날은 날짜로", () => {
    expect(sessionState(row(2, "2026-10-06", "10:00~11:00"), today, at(9))).toBe("past");
    expect(sessionState(row(3, "2026-10-08", "10:00~11:00"), today, at(23))).toBe("later");
  });
  it("시간을 모르는 오늘 회차는 지난 것으로 치우지 않는다", () => {
    expect(sessionState(row(4, today, null), today, at(23, 59))).toBe("later");
  });
});

describe("pickFocus — 맨 위에 올릴 회차", () => {
  const today = "2026-10-07";
  const rows = [
    row(1, today, "10:00~11:00"),
    row(2, today, "11:10~12:10"),
    row(3, today, "18:30~19:30"),
    row(4, "2026-10-08", "10:00~11:00"),
  ];

  it("수업 중이면 그 회차", () => {
    expect(pickFocus(rows, today, at(10, 20))).toEqual({ focus: [rows[0]], state: "now" });
  });

  it("10:50 이면 진행 중인 10:00 과 곧 시작할 11:10 이 함께 선다", () => {
    expect(pickFocus(rows, today, at(10, 50)).focus.map((r) => r.id)).toEqual([1, 2]);
  });

  it("수업 사이 빈 시간이면 다음 수업", () => {
    expect(pickFocus(rows, today, at(13, 0))).toEqual({ focus: [rows[2]], state: "next" });
  });

  it("오늘 수업이 다 끝났으면 다음 수업일의 첫 수업", () => {
    expect(pickFocus(rows, today, at(21, 0))).toEqual({ focus: [rows[3]], state: "next" });
  });

  it("같은 시각에 시작하는 회차는 함께 (관리자 화면 — 두 강사 수업이 겹친다)", () => {
    const both = [row(10, today, "12:30~13:40"), row(11, today, "12:30~13:40"), row(12, today, "13:50~15:00")];
    expect(pickFocus(both, today, at(12, 0)).focus.map((r) => r.id)).toEqual([10, 11]);
    expect(pickFocus(both, today, at(11, 0)).focus.map((r) => r.id)).toEqual([10, 11]);
  });

  it("앞으로 올 수업이 없으면 비어 있다", () => {
    expect(pickFocus([row(1, "2026-10-06", "10:00~11:00")], today, at(9))).toEqual({ focus: [], state: null });
  });

  it("넘겨받은 순서와 상관없이 시각 순으로 고른다", () => {
    expect(pickFocus([...rows].reverse(), today, at(13, 0)).focus.map((r) => r.id)).toEqual([3]);
  });
});

describe("forInstructor — 강사 화면은 내 반 + 담당이 빈 반만", () => {
  const rows = [
    { id: 1, instructorId: "hy" },
    { id: 2, instructorId: "ys" },
    { id: 3, instructorId: null },
  ];
  it("다른 강사 반은 빠진다", () => {
    expect(forInstructor(rows, "hy").map((r) => r.id)).toEqual([1, 3]);
    expect(forInstructor(rows, "ys").map((r) => r.id)).toEqual([2, 3]);
  });
});

describe("compareSessions", () => {
  it("날짜 → 시작 시각, 시간을 모르면 그 날 맨 뒤", () => {
    const list = [row(1, "2026-10-08", "10:00~11:00"), row(2, "2026-10-07", null), row(3, "2026-10-07", "18:30~19:30"), row(4, "2026-10-07", "10:00~11:00")];
    expect([...list].sort(compareSessions).map((r) => r.id)).toEqual([4, 3, 2, 1]);
  });
});
