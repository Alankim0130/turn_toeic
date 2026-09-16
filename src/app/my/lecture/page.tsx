import type { Metadata } from "next";
import Link from "next/link";
import { studentGate } from "@/components/student/StudentGate";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Reveal } from "@/components/ui/Reveal";
import { cn, formatDate, todayKST } from "@/lib/utils";
import { formatKstDateTime, LECTURE_STATE_CLASS, LECTURE_STATE_LABEL, lectureState, lectureTitle, seatsLeft } from "@/lib/lecture";
import { LectureCancelButton, LectureSignupButton, SignupOpensIn } from "@/components/my/LectureSignup";
import { getMyLectures, getMyLectureSignupIds } from "../_lib/queries";

export const metadata: Metadata = { title: "특강 신청", robots: { index: false } };

export default async function MyLecturePage() {
  const locked = await studentGate("lecture");
  if (locked) return locked;

  const [lectures, mySignups] = await Promise.all([getMyLectures(), getMyLectureSignupIds()]);
  const today = todayKST();

  // 신청을 받는 특강만. 지난 특강은 내가 신청한 것만 남겨 기록을 보여 준다
  const open = lectures
    .filter((l) => l.signup && (today <= l.date || mySignups.has(l.id)))
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="space-y-6">
      <PageHeader icon="bolt" title="특강 신청" description="그 달에 열리는 특강과 모의고사를 신청해요. 정원이 있는 특강은 먼저 신청한 순서대로 자리가 찹니다.">
        <Link href="/my/class" className="btn-secondary">
          내 시간표
        </Link>
      </PageHeader>

      {open.length === 0 ? (
        <EmptyState
          icon="calendar"
          title="지금 신청할 수 있는 특강이 없어요"
          description="특강이 열리면 여기에 바로 나타납니다. 이번 달 수업일은 내 시간표에서 볼 수 있어요."
          action={{ href: "/my/class", label: "내 시간표 보기" }}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {open.map((l, i) => {
            const state = lectureState(l, today);
            const applied = mySignups.has(l.id);
            const left = seatsLeft(l);
            const pct = l.capacity ? Math.min(100, Math.round((l.applied_count / l.capacity) * 100)) : 0;
            return (
              <Reveal key={l.id} delay={i * 60}>
                <article className={cn("card flex h-full flex-col gap-3 p-4", applied && "border-brand-300 bg-brand-50/40")}>
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
                        <span className="text-ink">{l.capacity !== null ? ` / ${l.capacity}명` : "명"}</span>
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

                  {state === "not_open" && l.signup_opens_at && <SignupOpensIn opensAt={l.signup_opens_at} label={formatKstDateTime(l.signup_opens_at)} />}

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
              </Reveal>
            );
          })}
        </div>
      )}

      <p className="text-xs text-mist">특강은 강사가 매달 반 편성 달력에서 정합니다. 신청 받는 기간은 신청 시작부터 특강 당일까지예요.</p>
    </div>
  );
}
