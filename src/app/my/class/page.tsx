import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Reveal } from "@/components/ui/Reveal";
import { Icon } from "@/components/ui/Icon";
import { MonthSchedule } from "@/components/my/MonthSchedule";
import { getMySchedule } from "../_lib/schedule";

export const metadata: Metadata = {
  title: "내 시간표",
  robots: { index: false },
};

export default async function ClassPage() {
  // 줄을 만드는 일은 `_lib/schedule.ts` 한곳이 한다 — `/my` 대시보드도 같은 것을 쓴다
  const { months, today, signupLectures, mySignups, total, done, hasAny } = await getMySchedule();

  if (!hasAny) {
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

      {months.map((g, gi) => (
        <Reveal key={`${g.year}-${g.month}`} delay={gi * 80}>
          <MonthSchedule
            year={g.year}
            month={g.month}
            today={today}
            marks={g.marks}
            days={g.days}
            lectures={g.lectures}
            initial={g.initial}
          />
        </Reveal>
      ))}

      <p className="text-xs text-mist">수업일·특강은 강사가 매달 반 편성 달력에서 직접 정합니다. 달력이 바뀌면 이 시간표에 바로 반영돼요.</p>
    </div>
  );
}
