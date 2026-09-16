import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Reveal } from "@/components/ui/Reveal";
import { Icon } from "@/components/ui/Icon";
import { MonthCalendar, type CalendarMark } from "@/components/my/MonthCalendar";
import { cn, formatDate, formatTime, formatTimeRange, todayKST, TRACK_LABEL } from "@/lib/utils";
import { formatKstDateTime, LECTURE_STATE_CLASS, LECTURE_STATE_LABEL, lectureState, lectureTitle, seatsLeft } from "@/lib/lecture";
import { LectureCancelButton, LectureSignupButton, SignupOpensIn } from "@/components/my/LectureSignup";
import { getMyLectures, getMyLectureSignupIds, getMySessions, termLabel } from "../_lib/queries";

export const metadata: Metadata = {
  title: "내 시간표",
  robots: { index: false },
};

export default async function ClassPage() {
  const [sessionRows, lectures, mySignups] = await Promise.all([getMySessions(), getMyLectures(), getMyLectureSignupIds()]);
  const sessions = sessionRows.filter((s) => s.section);
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
        <section aria-labelledby="lecture-signup-title" className="space-y-3">
          <h2 id="lecture-signup-title" className="text-lg font-black text-ink">
            특강 신청 <span className="text-sm font-semibold text-slate">— 신청을 받는 특강이에요</span>
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {signupLectures.map((l) => {
              const state = lectureState(l, today);
              const applied = mySignups.has(l.id);
              const left = seatsLeft(l);
              const pct = l.capacity ? Math.min(100, Math.round((l.applied_count / l.capacity) * 100)) : 0;
              return (
                <article key={l.id} className={cn("card flex flex-col gap-3 p-4", applied && "border-brand-300 bg-brand-50/40")}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-black text-ink">{lectureTitle(l)}</p>
                      <p className="mt-0.5 text-sm text-slate">
                        {formatDate(l.date)}
                        {l.lecturer?.name && <span className="ml-2 font-bold text-violet-700">{l.lecturer.name}</span>}
                      </p>
                    </div>
                    <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-bold", applied ? "bg-brand-500 text-white" : LECTURE_STATE_CLASS[state])}>
                      {applied ? "신청 완료" : LECTURE_STATE_LABEL[state]}
                    </span>
                  </div>

                  <div>
                    <p className="flex items-baseline justify-between text-sm">
                      <span className="font-semibold text-slate">신청 현황</span>
                      <span className="font-black tabular-nums text-brand-600">
                        {l.applied_count}
                        {l.capacity !== null && <span className="text-ink"> / {l.capacity}명</span>}
                        {l.capacity === null && <span className="text-ink">명</span>}
                      </span>
                    </p>
                    {l.capacity !== null && (
                      <>
                        <span className="mt-1.5 block h-2 w-full overflow-hidden rounded-full bg-line">
                          <span className="block h-full rounded-full bg-brand-500 transition-all" style={{ width: `${pct}%` }} />
                        </span>
                        {left !== null && left > 0 && <p className="mt-1 text-xs font-bold text-emerald-600">{left}자리 남았어요</p>}
                      </>
                    )}
                  </div>

                  {state === "not_open" && l.signup_opens_at && (
                    <SignupOpensIn opensAt={l.signup_opens_at} label={formatKstDateTime(l.signup_opens_at)} />
                  )}

                  <div className="mt-auto flex flex-wrap items-center justify-end gap-2">
                    {applied ? (
                      state === "open" || state === "full" ? (
                        <LectureCancelButton lectureId={l.id} />
                      ) : (
                        <p className="text-xs text-slate">신청이 마감돼 직접 취소할 수 없어요. 강사에게 말씀해 주세요.</p>
                      )
                    ) : state === "open" || state === "full" ? (
                      <LectureSignupButton lectureId={l.id} full={state === "full"} />
                    ) : (
                      <p className="text-xs font-semibold text-slate">{state === "closed" ? "신청이 마감됐어요" : "아직 신청 전이에요"}</p>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {ordered.map((g, gi) => {
        const marks: CalendarMark[] = [
          ...g.list.map((s) => ({
            date: s.date,
            track: s.section!.track,
            label: [s.section!.course?.name ?? "수업", formatTime(s.start_time)].filter(Boolean).join(" "),
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
                      {s.start_time && s.end_time && <span className="text-slate">{formatTimeRange(s.start_time, s.end_time)}</span>}
                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold text-white", s.section!.track === "mwf" ? "bg-brand-500" : "bg-ink")}>
                        {TRACK_LABEL[s.section!.track] ?? s.section!.track}
                      </span>
                      <span className="text-slate">{s.section!.course?.name ?? termLabel(s.section!.term)}</span>
                      {isToday && <span className="ml-auto rounded-full bg-brand-500 px-2 py-0.5 text-xs font-black text-white">오늘</span>}
                      {isNext && <span className="ml-auto rounded-full bg-ink px-2 py-0.5 text-xs font-black text-white">다음 수업</span>}
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
