import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Reveal } from "@/components/ui/Reveal";
import { Icon } from "@/components/ui/Icon";
import { MonthCalendar, type CalendarMark } from "@/components/my/MonthCalendar";
import { cn, formatDate, formatTime, todayKST, TRACK_LABEL } from "@/lib/utils";
import { getMySessions, termLabel } from "../_lib/queries";

export const metadata: Metadata = {
  title: "내 시간표",
  robots: { index: false },
};

export default async function ClassPage() {
  const sessions = (await getMySessions()).filter((s) => s.section);
  const today = todayKST();

  if (sessions.length === 0) {
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

  // 월별 그룹
  const groups = new Map<string, { year: number; month: number; list: typeof sessions }>();
  for (const s of sessions) {
    const y = Number(s.date.slice(0, 4));
    const m = Number(s.date.slice(5, 7));
    const key = `${y}-${m}`;
    const g = groups.get(key) ?? { year: y, month: m, list: [] };
    g.list.push(s);
    groups.set(key, g);
  }

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

      {[...groups.values()].map((g, gi) => {
        const marks: CalendarMark[] = g.list.map((s) => ({
          date: s.date,
          track: s.section!.track,
          label: `${s.section!.course?.name ?? "수업"} ${formatTime(s.start_time)}`,
        }));
        return (
          <Reveal key={`${g.year}-${g.month}`} delay={gi * 80} className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
            <MonthCalendar year={g.year} month={g.month} marks={marks} today={today} />

            <section className="card overflow-hidden">
              <div className="border-b border-line bg-brand-50/60 px-4 py-3">
                <p className="font-black text-ink">
                  {g.year}년 {g.month}월 수업일 <span className="text-sm font-semibold text-slate">· {g.list.length}회</span>
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
                      <span className="text-slate">
                        {formatTime(s.start_time)}–{formatTime(s.end_time)}
                      </span>
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
            </section>
          </Reveal>
        );
      })}

      <p className="text-xs text-mist">수업일은 강사가 매달 직접 편성합니다. 변경되면 이 시간표에 바로 반영돼요.</p>
    </div>
  );
}
