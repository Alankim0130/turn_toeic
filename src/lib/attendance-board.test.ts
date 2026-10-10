import { describe, expect, it } from "vitest";
import {
  absenceNoticeMessage,
  absenteesOf,
  attendancePct,
  boardDates,
  classDone,
  countDays,
  dayMark,
  kstNow,
  monthCells,
  monthsBetween,
  pickRecordTerms,
  rankBoard,
  streakOf,
  type BoardDay,
  type RosterLike,
} from "./attendance-board";

const day = (d: string, st: string | null, opts: Partial<BoardDay & { order: string }> = {}): BoardDay & { order?: string } => ({ d, s: 1, done: true, st, late: false, ...opts });

describe("dayMark — 한 칸의 표시 (한 번 찍으면 출석, 2026-10-10)", () => {
  it("찍었거나(present) 출석 인정이면 출석, 지각했으면 지각 출석", () => {
    expect(dayMark(day("2026-10-06", "present"))).toBe("present");
    expect(dayMark(day("2026-10-06", "manual"))).toBe("present");
    expect(dayMark(day("2026-10-06", "present", { late: true }))).toBe("late");
  });
  it("찍는 순간 정해진다 — 수업 중이어도 출석 (입실만 · 수업 중 입실 같은 중간 표시는 없다)", () => {
    expect(dayMark(day("2026-10-06", "present", { done: false }))).toBe("present");
    expect(dayMark(day("2026-10-06", "present", { done: false, late: true }))).toBe("late");
  });
  it("기록이 없으면 끝난 수업은 결석, 아직 안 끝난 수업은 예정 — 선생님이 정한 결석도 같은 결석 (한 단어, 2026-10-10)", () => {
    expect(dayMark(day("2026-10-06", null))).toBe("absent");
    expect(dayMark(day("2026-10-06", null, { done: false }))).toBe("upcoming");
    expect(dayMark(day("2026-10-06", "absent"))).toBe("absent");
    expect(dayMark(day("2026-10-06", "absent", { done: false }))).toBe("absent");
  });
});

describe("countDays — DB my_attendance_summary 와 같은 셈", () => {
  it("끝난 수업만 세고, 출석 = 찍음 + 출석 인정, 지각은 따로 센다", () => {
    const days = [
      day("2026-10-06", "present"),
      day("2026-10-07", "present", { late: true }),
      day("2026-10-08", "manual"),
      day("2026-10-09", "present", { late: true }),
      day("2026-10-10", "absent"),
      day("2026-10-12", null),
      day("2026-10-13", null, { done: false }),
      day("2026-10-14", "present", { done: false }),
    ];
    // 결석 2 = 선생님이 정한 결석 1 + 끝났는데 안 찍음 1 (따로 세지 않는다)
    expect(countDays(days)).toEqual({ total: 8, past: 6, present: 4, late: 2, absent: 2 });
  });
  it("출석률은 끝난 수업 중 출석 — 끝난 수업이 없으면 null", () => {
    expect(attendancePct({ past: 0, present: 0 })).toBeNull();
    expect(attendancePct({ past: 3, present: 2 })).toBe(67);
    expect(attendancePct({ past: 2, present: 2 })).toBe(100);
  });
});

describe("rankBoard — 결석 → 지각 → 이름, 테스터는 맨 아래", () => {
  it("관리할 학생이 위로 온다", () => {
    const rows = [
      { student_id: "a", student_name: "가나다", tester: false, section_ids: [1], days: [day("2026-10-06", "present")] },
      { student_id: "b", student_name: "라마바", tester: false, section_ids: [1], days: [day("2026-10-06", "present", { late: true })] },
      { student_id: "c", student_name: "사아자", tester: false, section_ids: [1], days: [day("2026-10-06", null), day("2026-10-07", "absent")] },
      { student_id: "d", student_name: "차카타", tester: false, section_ids: [1], days: [day("2026-10-06", null)] },
      { student_id: "t", student_name: "가가가", tester: true, section_ids: [1], days: [day("2026-10-06", null), day("2026-10-07", null)] },
      { student_id: "e", student_name: "파하", tester: false, section_ids: [1], days: [day("2026-10-06", "manual")] },
    ];
    expect(rankBoard(rows).map((r) => r.student_id)).toEqual(["c", "d", "b", "a", "e", "t"]);
  });
  it("앞날 수업은 결석으로 세지 않는다", () => {
    const rows = [
      { student_id: "a", student_name: "가", tester: false, section_ids: [1], days: [day("2026-10-20", null, { done: false })] },
      { student_id: "b", student_name: "나", tester: false, section_ids: [1], days: [day("2026-10-06", null)] },
    ];
    expect(rankBoard(rows)[0].student_id).toBe("b");
    expect(rankBoard(rows)[1].counts.absent).toBe(0);
  });
});

describe("boardDates", () => {
  it("누군가 수업이 있는 날만 날짜순으로", () => {
    expect(boardDates([{ days: [day("2026-10-08", null), day("2026-10-06", null)] }, { days: [day("2026-10-07", null), day("2026-10-06", null)] }])).toEqual([
      "2026-10-06",
      "2026-10-07",
      "2026-10-08",
    ]);
  });
});

describe("classDone — 수업이 끝났나 · DB 와 같은 규칙 (2026-10-10 — 끝나면 더 못 찍으니 그때부터 결석)", () => {
  const at = (date: string, hhmm: string) => ({ date, minutes: Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5)) });
  it("수업 끝 시각부터 끝난 수업이다 (퇴실 마감 30분은 없다)", () => {
    expect(classDone("2026-10-06", "10:00~12:10", at("2026-10-06", "12:09"))).toBe(false);
    expect(classDone("2026-10-06", "10:00~12:10", at("2026-10-06", "12:10"))).toBe(true);
    expect(classDone("2026-10-06", "10:00~12:10", at("2026-10-07", "00:00"))).toBe(true);
    expect(classDone("2026-10-07", "10:00~12:10", at("2026-10-06", "23:59"))).toBe(false);
  });
  it("밤늦게 끝나는 수업은 다음 날로 넘어가도 맞게 센다", () => {
    expect(classDone("2026-10-06", "22:00~23:50", at("2026-10-06", "23:49"))).toBe(false);
    expect(classDone("2026-10-06", "22:00~23:50", at("2026-10-07", "00:00"))).toBe(true);
  });
  it("시간을 못 읽는 반은 끝난 것으로 보지 않는다 (출석을 찍을 수 없는 반이다)", () => {
    expect(classDone("2026-10-01", null, at("2026-10-06", "12:00"))).toBe(false);
    expect(classDone("2026-10-01", "오전반", at("2026-10-06", "12:00"))).toBe(false);
  });
  it("kstNow 는 한국 시간으로 잡는다", () => {
    // 2026-10-06 15:20 UTC = 2026-10-07 00:20 KST
    expect(kstNow(new Date("2026-10-06T15:20:00Z"))).toEqual({ date: "2026-10-07", minutes: 20 });
  });
});

describe("absenteesOf — 결석 알림 받을 사람", () => {
  const row = (student_id: string, section_id: number, status: string | null, time_block = "10:00~12:10", tester = false, decided_note: string | null = null): RosterLike => ({
    section_id,
    course_name: "650+ 왕기초반",
    track: section_id % 2 ? "mwf" : "ttf",
    time_block,
    student_id,
    student_name: `학생${student_id}`,
    tester,
    status,
    decided_note,
  });
  const after = { date: "2026-10-06", minutes: 13 * 60 };

  it("끝난 수업에 안 찍은 학생 + 선생님이 결석으로 정한 학생 — 출석·출석 인정은 넣지 않는다", () => {
    const list = absenteesOf([row("a", 1, null), row("b", 1, "absent", "10:00~12:10", false, " 병원 "), row("c", 1, "present"), row("d", 1, "present"), row("e", 1, "manual")], "2026-10-06", after);
    expect(list.map((a) => a.student_id)).toEqual(["a", "b"]);
    // 둘 다 "결석" 한 단어다 — 다른 것은 선생님이 적은 사유뿐
    expect(list.find((a) => a.student_id === "a")?.note).toBeNull();
    expect(list.find((a) => a.student_id === "b")?.note).toBe("병원");
  });
  it("아직 안 끝난 수업은 넣지 않는다 (올 시간이 남았다)", () => {
    const list = absenteesOf([row("a", 1, null), row("b", 3, null, "18:30~20:40")], "2026-10-06", after);
    expect(list.map((a) => a.student_id)).toEqual(["a"]);
  });
  it("한 사람이 두 반을 빠졌으면 한 줄로 합친다", () => {
    const list = absenteesOf([row("a", 1, null), row("a", 3, "absent", "12:30~13:40")], "2026-10-06", { date: "2026-10-06", minutes: 15 * 60 });
    expect(list).toHaveLength(1);
    expect(list[0].sectionIds).toEqual([1, 3]);
    expect(list[0].labels).toEqual(["650+ 왕기초반 월수금 10:00~12:10", "650+ 왕기초반 월수금 12:30~13:40"]);
  });
  it("테스터는 맨 아래", () => {
    const list = absenteesOf([row("t", 1, null, "10:00~12:10", true), row("b", 1, null)], "2026-10-06", after);
    expect(list.map((a) => a.student_id)).toEqual(["b", "t"]);
  });
});

describe("absenceNoticeMessage", () => {
  it("날짜와 요일을 넣고 알림함 길이 안에 든다", () => {
    const m = absenceNoticeMessage("2026-10-06");
    expect(m.title).toBe("10월 6일 수업 결석 안내");
    expect(m.body).toContain("10월 6일(화)");
    expect(m.title.length).toBeLessThanOrEqual(80);
    expect(m.body.length).toBeLessThanOrEqual(1000);
  });
});

describe("streakOf — 연속 출석", () => {
  it("가장 최근에 끝난 수업부터 출석(지각 포함)이 이어진 만큼", () => {
    expect(streakOf([day("2026-10-06", null), day("2026-10-07", "present"), day("2026-10-08", "present", { late: true }), day("2026-10-09", "manual")])).toBe(3);
  });
  it("가장 최근 수업을 빠졌으면 0", () => {
    expect(streakOf([day("2026-10-06", "present"), day("2026-10-07", "absent")])).toBe(0);
    expect(streakOf([day("2026-10-06", "present"), day("2026-10-07", null)])).toBe(0);
  });
  it("아직 안 끝난 수업은 세지도 끊지도 않는다", () => {
    expect(streakOf([day("2026-10-06", "present"), day("2026-10-07", "present"), day("2026-10-08", null, { done: false })])).toBe(2);
    expect(streakOf([day("2026-10-08", null, { done: false })])).toBe(0);
  });
  it("같은 날 두 수업은 시작 순서로 본다", () => {
    expect(streakOf([day("2026-10-06", null, { order: "18:30~20:40" }), day("2026-10-06", "present", { order: "10:00~12:10" })])).toBe(0);
    expect(streakOf([day("2026-10-06", "present", { order: "18:30~20:40" }), day("2026-10-06", null, { order: "10:00~12:10" })])).toBe(1);
  });
});

describe("pickRecordTerms — 지금 기수, 없으면 가장 가까운 다음 기수", () => {
  const sep = { term_id: 9, opens: "2026-09-03", closes: "2026-09-30" };
  const oct = { term_id: 10, opens: "2026-10-06", closes: "2026-10-31" };
  it("오늘이 든 기수", () => {
    expect(pickRecordTerms([sep, oct], "2026-09-15")).toEqual([9]);
    expect(pickRecordTerms([sep, oct], "2026-09-30")).toEqual([9]);
  });
  it("종강일이 지나면 다음 기수 (개강 전이어도)", () => {
    expect(pickRecordTerms([oct], "2026-10-01")).toEqual([10]);
    expect(pickRecordTerms([sep, oct], "2026-10-02")).toEqual([10]);
  });
  it("두 기수가 겹치는 며칠은 둘 다", () => {
    expect(pickRecordTerms([{ ...sep, closes: "2026-10-08" }, oct], "2026-10-07")).toEqual([9, 10]);
  });
  it("아무것도 없으면 빈 목록", () => {
    expect(pickRecordTerms([], "2026-10-01")).toEqual([]);
  });
});

describe("monthCells · monthsBetween", () => {
  it("2026년 10월은 목요일에 시작해 칸이 7의 배수다", () => {
    const cells = monthCells(2026, 10);
    expect(cells.slice(0, 4)).toEqual([null, null, null, null]);
    expect(cells[4]).toEqual({ day: 1, date: "2026-10-01" });
    expect(cells.length % 7).toBe(0);
  });
  it("기간이 걸친 달 — 해를 넘겨도", () => {
    expect(monthsBetween("2026-09-28", "2026-10-31")).toEqual([
      { year: 2026, month: 9 },
      { year: 2026, month: 10 },
    ]);
    expect(monthsBetween("2026-12-29", "2027-01-30")).toEqual([
      { year: 2026, month: 12 },
      { year: 2027, month: 1 },
    ]);
  });
});
