import { type CalendarMark } from "@/components/my/MonthCalendar";
import { type DayRow, type LectureRow } from "@/components/my/MonthSchedule";
import { formatTime, formatTimeRange, todayKST, TRACK_LABEL } from "@/lib/utils";
import { lectureTitle } from "@/lib/lecture";
import { classHours, toClassHours, type ClassHour } from "@/lib/class-hours";
import { initialDay } from "@/lib/class-day";
import { studentTrackLabel, week5SectionIds } from "@/lib/week5";
import { getMyLectures, getMyLectureSignupIds, getMyOrders, getMySectionIncludes, getMySessions, termLabel } from "./queries";

/** 달력 한 달치 — 화면이 그대로 `MonthSchedule` 에 넘길 수 있는 모양 */
export type ScheduleMonth = {
  year: number;
  month: number;
  marks: CalendarMark[];
  days: DayRow[];
  lectures: LectureRow[];
  initial: string | null;
};

/**
 * 내 시간표 한 벌. **`/my/class`(전체)와 `/my` 대시보드(이번 달 한 칸)가 함께 쓴다** —
 * 주5일 합치기 · 직접 배정된 반만 남기기 · 함께 듣는 시간 계산이 섬세해서 두 곳에 베껴 두면 반드시 갈라진다.
 *
 * 줄은 **여기서 다 만들어** 넘긴다 — 클라이언트로는 Map·중첩 객체가 못 넘어가고,
 * 넘길 수 있더라도 반·기수 전체를 실어 보낼 이유가 없다.
 */
export async function getMySchedule() {
  const [sessionRows, lectures, mySignups, orders] = await Promise.all([
    getMySessions(),
    getMyLectures(),
    getMyLectureSignupIds(),
    getMyOrders(),
  ]);

  // 학생에게는 월수금·화목금 대신 "주5일" 로 보여 준다 (2026-09-16 Alan) — 판정은 lib/week5.ts.
  // **내가 등록한 반**으로 본다 — 스태프는 RLS 가 모든 반을 내려 줘서 남의 반까지 짝으로 잡힌다
  const week5 = week5SectionIds(orders.flatMap((o) => o.enrollments.filter((e) => e.section).map((e) => e.section!)));

  /**
   * 묶음 반(120분) · 스파르타반 학생은 함께 열리는 반(60분 시간 단위, 650·850 …)의 수업일이 같은 날 함께 내려온다.
   * 시간표에는 **내가 등록한 반**(직접 배정된 반) 줄만 두고, 함께 열리는 반은 그 줄의 설명으로 붙인다 —
   * 120분 주5일 학생이 하루에 60분 줄 두 개를 보면 회차 수가 두 배로 보인다.
   */
  const direct = new Set(
    orders.flatMap((o) =>
      o.status === "active" || o.status === "preliminary"
        ? o.enrollments.filter((e) => e.status === "active" && e.section).map((e) => e.section!.id)
        : [],
    ),
  );
  const rows = sessionRows.filter((s) => s.section);
  const byDay = new Map<string, typeof rows>();
  for (const s of rows) {
    const k = `${s.date}|${s.section!.track}`;
    byDay.set(k, [...(byDay.get(k) ?? []), s]);
  }

  /**
   * 함께 듣는 시간은 **시간대 × 과목**으로 보여 준다 (2026-09-16 Alan 요청 —
   * "10:00-11:00 LC / 11:10-12:10 RC 이거 시간대별로 자동매칭해서 표시해주는게 더 좋을 것 같아").
   *
   * **내 반이 실제로 여는 시간만** 붙인다 — 그 날 내려온 반을 다 붙였더니 등록하지도 않은
   * 750·850·저녁반까지 줄줄이 나왔다 (2026-09-16 Alan 지적). 포함 관계는 DB 가 정한다
   * (`term_section_includes` → `private.section_includes`). 판정은 `lib/class-hours.ts`.
   */
  const includes = await getMySectionIncludes(rows.map((s) => s.section!.term_id));

  const partsOf = new Map<number, ClassHour[]>();
  const sessions: typeof rows = [];
  for (const list of byDay.values()) {
    const own = direct.size ? list.filter((s) => direct.has(s.section!.id)) : [];
    if (own.length === 0) {
      // 등록 정보를 못 읽은 경우: 같은 날 실제 수업(점수보장반)이 있으면 스파르타 반 줄만 뺀다
      const hasReal = list.some((s) => s.section!.course?.program !== "sparta");
      sessions.push(...list.filter((s) => !(hasReal && s.section!.course?.program === "sparta")));
      continue;
    }
    const sameDay = list.map((s) => s.section!);
    for (const o of own) {
      const hours = toClassHours(classHours(o.section!.id, sameDay, includes));
      if (hours.length) partsOf.set(o.id, hours);
      sessions.push(o);
    }
  }
  sessions.sort((a, b) => a.date.localeCompare(b.date) || (a.section!.time_block ?? "").localeCompare(b.section!.time_block ?? ""));

  const today = todayKST();
  const nextId = sessions.find((s) => s.date >= today)?.id ?? null;

  // 신청을 받는 특강은 위로 따로 모아 보여 준다 (지난 특강은 빼고)
  const signupLectures = lectures
    .filter((l) => l.signup && (today <= l.date || mySignups.has(l.id)))
    .sort((a, b) => a.date.localeCompare(b.date));

  // 월별 그룹 — 수업일과 특강을 같은 달력에 함께 보여 준다
  type Group = { year: number; month: number; list: typeof sessions; lectures: typeof lectures };
  const groups = new Map<string, Group>();
  const groupOf = (date: string) => {
    const y = Number(date.slice(0, 4));
    const m = Number(date.slice(5, 7));
    const key = `${y}-${String(m).padStart(2, "0")}`;
    const g = groups.get(key) ?? { year: y, month: m, list: [], lectures: [] };
    groups.set(key, g);
    return g;
  };
  for (const s of sessions) groupOf(s.date).list.push(s);
  for (const l of lectures) groupOf(l.date).lectures.push(l);

  const months: ScheduleMonth[] = [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, g]) => ({
      year: g.year,
      month: g.month,
      marks: [
        ...g.list.map((s) => ({
          date: s.date,
          // 달력은 주5일이어도 **트랙 색을 나눈다** (2026-09-17 Alan — 2026-09-16 의 "한 색" 을 뒤집었다).
          // 줄의 배지는 그대로 `주5일` 이다 — 색은 "무슨 요일에 가나", 배지는 "무엇을 등록했나"
          track: s.section!.track,
          label: [s.section!.course?.name ?? "수업", formatTime(s.start_time) || s.section!.time_block].filter(Boolean).join(" "),
        })),
        ...g.lectures.map((l) => ({ date: l.date, track: "lecture", label: lectureTitle(l) })),
      ],
      days: g.list.map((s) => ({
        id: s.id,
        seq: s.seq,
        date: s.date,
        time: s.start_time && s.end_time ? formatTimeRange(s.start_time, s.end_time) : s.section!.time_block,
        track: studentTrackLabel(s.section!, week5, TRACK_LABEL),
        mwf: s.section!.track === "mwf",
        course: s.section!.course?.name ?? termLabel(s.section!.term),
        recorded: !!s.section!.recorded,
        next: s.id === nextId,
        hours: partsOf.get(s.id) ?? [],
      })),
      lectures: g.lectures.map((l) => ({
        id: l.id,
        date: l.date,
        title: lectureTitle(l),
        lecturer: l.lecturer?.name ?? null,
        signed: mySignups.has(l.id),
      })),
      // 처음 고르는 날짜는 특강만 있는 날도 센다 (달력에서 누를 수 있는 날과 같은 집합)
      initial: initialDay([...g.list.map((s) => s.date), ...g.lectures.map((l) => l.date)], today),
    }));

  return {
    months,
    today,
    // 대시보드가 "내 등록 현황" 에 그대로 쓴다 — 같은 요청에서 두 번 조회하지 않게 함께 돌려준다.
    // (주5일 판정은 넘기지 않는다: 여기 `week5` 는 **등록한 반**으로만 잡은 것이고,
    //  화면이 쓰는 `getMyWeek5()` 는 **접근 가능한 반 전체**로 잡아 서로 다른 집합이다)
    orders,
    signupLectures,
    mySignups,
    total: sessions.length,
    done: sessions.filter((s) => s.date < today).length,
    hasAny: sessions.length > 0 || lectures.length > 0,
  };
}
