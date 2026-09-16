import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Reveal } from "@/components/ui/Reveal";
import { Icon } from "@/components/ui/Icon";
import { MonthCalendar, type CalendarMark } from "@/components/my/MonthCalendar";
import { cn, formatDate, formatTime, formatTimeRange, todayKST, TRACK_LABEL } from "@/lib/utils";
import { lectureTitle } from "@/lib/lecture";
import { dashLabel } from "@/lib/time-blocks";
import { getMyLectures, getMyLectureSignupIds, getMyOrders, getMySessions, termLabel } from "../_lib/queries";

export const metadata: Metadata = {
  title: "내 시간표",
  robots: { index: false },
};

export default async function ClassPage() {
  const [sessionRows, lectures, mySignups, orders] = await Promise.all([getMySessions(), getMyLectures(), getMyLectureSignupIds(), getMyOrders()]);
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
  const partsOf = new Map<number, string[]>();
  const sessions: typeof rows = [];
  for (const list of byDay.values()) {
    const own = direct.size ? list.filter((s) => direct.has(s.section!.id)) : [];
    if (own.length === 0) {
      // 등록 정보를 못 읽은 경우: 같은 날 실제 수업(점수보장반)이 있으면 스파르타 반 줄만 뺀다
      const hasReal = list.some((s) => s.section!.course?.program !== "sparta");
      sessions.push(...list.filter((s) => !(hasReal && s.section!.course?.program === "sparta")));
      continue;
    }
    const others = list.filter((s) => !direct.has(s.section!.id)).sort((a, b) => (a.section!.time_block ?? "").localeCompare(b.section!.time_block ?? ""));
    for (const o of own) {
      const parts = others
        .map((s) => [s.section!.course?.name !== o.section!.course?.name ? s.section!.course?.name : null, s.section!.time_block ? dashLabel(s.section!.time_block) : null].filter(Boolean).join(" "))
        .filter(Boolean);
      if (parts.length) partsOf.set(o.id, parts);
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
      <PageHeader icon="calendar" title="내 시간표" description="주5일 수강생은 월수금·화목금 두 트랙이 함께 표시됩니다.">
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
            track: s.section!.track,
            label: [s.section!.course?.name ?? "수업", formatTime(s.start_time) || s.section!.time_block].filter(Boolean).join(" "),
          })),
          ...g.lectures.map((l) => ({ date: l.date, track: "lecture", label: lectureTitle(l) })),
        ];
        return (
          <Reveal key={`${g.year}-${g.month}`} delay={gi * 80} className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
            <MonthCalendar year={g.year} month={g.month} marks={marks} today={today} />

            <section className="card overflow-hidden">
              <div className="border-b border-line bg-brand-50/60 px-4 py-3">
                <p className="font-black text-ink">
                  {g.year}년 {g.month}월 수업일 <span className="text-sm font-semibold text-slate">· {g.list.length}회</span>
                  {g.lectures.length > 0 && <span className="text-sm font-semibold text-violet-700"> · 특강 {g.lectures.length}개</span>}
                </p>
              </div>
              <ol className="divide-y divide-line">
                {g.list.map((s) => {
                  const isToday = s.date === today;
                  const isNext = s.id === nextId && !isToday;
                  const past = s.date < today;
                  return (
                    <li
                      key={s.id}
                      className={cn(
                        "flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm",
                        isToday && "bg-brand-50",
                        isNext && "bg-surface",
                        past && "opacity-55",
                      )}
                    >
                      <span className="w-12 font-black text-brand-600">{s.seq}회차</span>
                      <span className="font-semibold text-ink">{formatDate(s.date)}</span>
                      {s.start_time && s.end_time ? (
                        <span className="text-slate">{formatTimeRange(s.start_time, s.end_time)}</span>
                      ) : (
                        s.section!.time_block && <span className="tabular-nums text-slate">{s.section!.time_block}</span>
                      )}
                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold text-white", s.section!.track === "mwf" ? "bg-brand-500" : "bg-ink")}>
                        {TRACK_LABEL[s.section!.track] ?? s.section!.track}
                      </span>
                      <span className="text-slate">{s.section!.course?.name ?? termLabel(s.section!.term)}</span>
                      {isToday && <span className="ml-auto rounded-full bg-brand-500 px-2 py-0.5 text-xs font-black text-white">오늘</span>}
                      {isNext && <span className="ml-auto rounded-full bg-ink px-2 py-0.5 text-xs font-black text-white">다음 수업</span>}
                      {partsOf.has(s.id) && (
                        <span className="basis-full pl-12 text-xs text-mist">함께 듣는 시간: {partsOf.get(s.id)!.join(" · ")}</span>
                      )}
                    </li>
                  );
                })}
              </ol>

              {g.lectures.length > 0 && (
                <div className="border-t border-line">
                  <p className="bg-violet-50/60 px-4 py-2 text-sm font-black text-violet-800">특강 · 모의고사</p>
                  <ul className="divide-y divide-line">
                    {g.lectures.map((l) => (
                      <li
                        key={l.id}
                        className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm", l.date === today && "bg-violet-50", l.date < today && "opacity-55")}
                      >
                        <span className="font-semibold text-ink">{formatDate(l.date)}</span>
                        <span className="min-w-0 flex-1 text-slate">{lectureTitle(l)}</span>
                        {mySignups.has(l.id) && <span className="rounded-full bg-brand-500 px-2 py-0.5 text-xs font-bold text-white">신청함</span>}
                        {l.lecturer?.name && <span className="text-xs font-bold text-violet-700">{l.lecturer.name}</span>}
                        {l.date === today && <span className="rounded-full bg-violet-600 px-2 py-0.5 text-xs font-black text-white">오늘</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          </Reveal>
        );
      })}

      <p className="text-xs text-mist">수업일·특강은 강사가 매달 반 편성 달력에서 직접 정합니다. 달력이 바뀌면 이 시간표에 바로 반영돼요.</p>
    </div>
  );
}
