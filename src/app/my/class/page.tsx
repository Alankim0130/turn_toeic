import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Reveal } from "@/components/ui/Reveal";
import { Icon } from "@/components/ui/Icon";
import { type CalendarMark } from "@/components/my/MonthCalendar";
import { MonthSchedule, type DayRow, type LectureRow } from "@/components/my/MonthSchedule";
import { formatTime, formatTimeRange, todayKST, TRACK_LABEL } from "@/lib/utils";
import { lectureTitle } from "@/lib/lecture";
import { classHours, toClassHours, type ClassHour } from "@/lib/class-hours";
import { initialDay } from "@/lib/class-day";
import { studentTrackLabel, week5SectionIds } from "@/lib/week5";
import { getMyLectures, getMyLectureSignupIds, getMyOrders, getMySectionIncludes, getMySessions, termLabel } from "../_lib/queries";

export const metadata: Metadata = {
  title: "내 시간표",
  robots: { index: false },
};

export default async function ClassPage() {
  const [sessionRows, lectures, mySignups, orders] = await Promise.all([getMySessions(), getMyLectures(), getMyLectureSignupIds(), getMyOrders()]);
  // 학생에게는 월수금·화목금 대신 "주5일" 로 보여 준다 (2026-09-16 Alan) — 판정은 lib/week5.ts.
  // **내가 등록한 반**으로 본다 — 스태프는 RLS 가 모든 반을 내려 줘서 남의 반까지 짝으로 잡힌다
  const week5 = week5SectionIds(
    orders.flatMap((o) => o.enrollments.filter((e) => e.section).map((e) => e.section!)),
  );
  /**
   * 묶음 반(120분) · 스파르타반 학생은 함께 열리는 반(60분 시간 단위, 650·850 …)의 수업일이 같은 날 함께 내려온다.
   * 시간표에는 **내가 등록한 반**(직접 배정된 반) 줄만 두고, 함께 열리는 반은 그 줄의 설명으로 붙인다 —
   * 120분 주5일 학생이 하루에 60분 줄 두 개를 보면 회차 수가 두 배로 보인다.
   */
  const direct = new Set(
    orders.flatMap((o) => (o.status === "active" || o.status === "preliminary" ? o.enrollments.filter((e) => e.status === "active" && e.section).map((e) => e.section!.id) : [])),
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

  // 신청을 받는 특강은 위로 따로 모아 보여 준다 (지난 특강은 빼고)
  const signupLectures = lectures
    .filter((l) => l.signup && (today <= l.date || mySignups.has(l.id)))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (sessions.length === 0 && lectures.length === 0) {
    return (
      <div className="space-y-8">
        <PageHeader icon="calendar" title="내 시간표" description="배정된 반의 수업일을 보여드려요." />
        <EmptyState
          icon="calendar"
          title="아직 볼 수 있는 시간표가 없어요"
          description="등업신청이 승인되고 개강일이 되면 여기에 수업일이 표시됩니다. 개강 전이라면 개강일에 자동으로 열려요."
          action={{ href: "/my/verify", label: "등업신청 하러 가기" }}
        />
      </div>
    );
  }

  const nextId = sessions.find((s) => s.date >= today)?.id ?? null;

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
  const ordered = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, g]) => g);

  const total = sessions.length;
  const done = sessions.filter((s) => s.date < today).length;

  return (
    <div className="space-y-8">
      <PageHeader icon="calendar" title="내 시간표" description="이번 달 수업일이에요. 주5일 수강생은 두 타임의 수업일이 모두 표시됩니다.">
        <span className="chip">
          <Icon name="success" size={16} />
          {done} / {total}회 진행
        </span>
      </PageHeader>

      {signupLectures.length > 0 && (
        <Link
          href="/my/lecture"
          className="card flex items-center gap-3 p-4 transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-pink"
        >
          <Icon name="bolt" size={28} />
          <span className="min-w-0 flex-1">
            <span className="block font-black text-ink">
              신청할 수 있는 특강 {signupLectures.filter((l) => !mySignups.has(l.id)).length}개
            </span>
            <span className="block text-sm text-slate">
              {mySignups.size > 0 ? `신청한 특강 ${mySignups.size}개 · ` : ""}특강 신청에서 신청하고 취소할 수 있어요
            </span>
          </span>
          <span className="shrink-0 text-sm font-black text-brand-600">신청하러 가기 ›</span>
        </Link>
      )}

      {ordered.map((g, gi) => {
        const marks: CalendarMark[] = [
          ...g.list.map((s) => ({
            date: s.date,
            // 달력은 주5일이어도 **트랙 색을 나눈다** (2026-09-17 Alan — 2026-09-16 의 "한 색" 을 뒤집었다).
            // 줄의 배지는 그대로 `주5일` 이다 — 색은 "무슨 요일에 가나", 배지는 "무엇을 등록했나"
            track: s.section!.track,
            label: [s.section!.course?.name ?? "수업", formatTime(s.start_time) || s.section!.time_block].filter(Boolean).join(" "),
          })),
          ...g.lectures.map((l) => ({ date: l.date, track: "lecture", label: lectureTitle(l) })),
        ];
        /**
         * 줄은 **서버에서 다 만들어** 넘긴다 — 클라이언트로는 Map·중첩 객체가 못 넘어가고,
         * 넘길 수 있더라도 반·기수 전체를 실어 보낼 이유가 없다.
         */
        const days: DayRow[] = g.list.map((s) => ({
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
        }));
        const lectureRows: LectureRow[] = g.lectures.map((l) => ({
          id: l.id,
          date: l.date,
          title: lectureTitle(l),
          lecturer: l.lecturer?.name ?? null,
          signed: mySignups.has(l.id),
        }));
        return (
          <Reveal key={`${g.year}-${g.month}`} delay={gi * 80}>
            <MonthSchedule
              year={g.year}
              month={g.month}
              today={today}
              marks={marks}
              days={days}
              lectures={lectureRows}
              // 처음 고르는 날짜는 특강만 있는 날도 센다 (달력에서 누를 수 있는 날과 같은 집합)
              initial={initialDay([...g.list.map((s) => s.date), ...g.lectures.map((l) => l.date)], today)}
            />
          </Reveal>
        );
      })}

      <p className="text-xs text-mist">수업일·특강은 강사가 매달 반 편성 달력에서 직접 정합니다. 달력이 바뀌면 이 시간표에 바로 반영돼요.</p>
    </div>
  );
}
