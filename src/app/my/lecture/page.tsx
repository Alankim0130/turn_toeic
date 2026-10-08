import type { Metadata } from "next";
import Link from "next/link";
import { studentGate } from "@/components/student/StudentGate";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Reveal } from "@/components/ui/Reveal";
import { cn, formatDate, todayKST } from "@/lib/utils";
import {
  ddayLabel,
  formatKstDateTime,
  LECTURE_STATE_CLASS,
  LECTURE_STATE_LABEL,
  lectureCameo,
  lectureOpensAt,
  lectureState,
  lectureTitle,
  needsReviewLink,
  seatsLeft,
  signupDday,
} from "@/lib/lecture";
import { InstructorCameo } from "@/components/ui/InstructorCameo";
import { LectureCancelButton, LectureSignupButton, SignupOpensIn } from "@/components/my/LectureSignup";
import { YBM_REVIEW_GUIDE_ID, YbmReviewGuide } from "@/components/my/YbmReviewGuide";
import { getMyLectures, getMyLectureSignups } from "../_lib/queries";

export const metadata: Metadata = { title: "특강 신청", robots: { index: false } };

export default async function MyLecturePage() {
  const locked = await studentGate("lecture");
  if (locked) return locked;

  const [lectures, mySignups] = await Promise.all([getMyLectures(), getMyLectureSignups()]);
  const today = todayKST();

  // 신청을 받는 특강만. 지난 특강은 내가 신청한 것만 남겨 기록을 보여 준다
  const open = lectures
    .filter((l) => l.signup && (today <= l.date || mySignups.has(l.id)))
    .sort((a, b) => a.date.localeCompare(b.date));
  // 3주차 모의고사 특강은 YBM 수강후기 링크를 올려야 신청된다 (2026-10-08 Alan) — 아직 할 일이 남은 특강이 있을 때만 쓰는 법을 보여 준다
  const reviewFor = (l: (typeof open)[number]) => needsReviewLink(l, l.term?.enrollment_opens_at);
  const showGuide = open.some((l) => reviewFor(l) && !mySignups.has(l.id) && lectureState(l, today) !== "closed");

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
            const review = reviewFor(l);
            const reviewUrl = mySignups.get(l.id) ?? null;
            const left = seatsLeft(l);
            const pct = l.capacity ? Math.min(100, Math.round((l.applied_count / l.capacity) * 100)) : 0;
            // 강사 캐리커처 + 한마디, 잠긴 특강의 D-day (2026-10-02 Alan)
            const cameo = lectureCameo(l.lecturer?.name, l.kinds);
            const dday = signupDday(l, today);
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

                  {/* 신청 현황 왼쪽, 오른쪽에 강사 캐리커처 + 말풍선 — 손짓이 왼쪽을 향하므로 콘텐츠 오른쪽에 둔다 */}
                  <div className="flex items-end gap-3">
                    <div className="min-w-0 flex-1">
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
                    {cameo && (
                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        <p className="relative max-w-[10.5rem] rounded-2xl border border-brand-200 bg-paper px-2.5 py-1.5 text-right text-[11px] font-bold leading-snug text-brand-700 shadow-sm after:absolute after:-bottom-1.5 after:right-5 after:h-3 after:w-3 after:rotate-45 after:border-b after:border-r after:border-brand-200 after:bg-paper">
                          {cameo.line}
                        </p>
                        <InstructorCameo name={cameo.name} pose={cameo.pose} className="h-24 sm:h-28" sizes="96px" />
                      </div>
                    )}
                  </div>

                  {state === "not_open" && dday !== null && (
                    <SignupOpensIn opensAt={lectureOpensAt(l)} label={formatKstDateTime(lectureOpensAt(l))} dday={ddayLabel(dday)} />
                  )}

                  {review && (applied || state !== "closed") && <ReviewLinkNote applied={applied} reviewUrl={reviewUrl} notOpen={state === "not_open"} />}

                  <div className="mt-auto flex flex-wrap items-center justify-end gap-2">
                    {applied ? (
                      state === "open" || state === "full" ? (
                        <LectureCancelButton lectureId={l.id} />
                      ) : (
                        <p className="text-xs text-slate">신청이 마감돼 직접 취소할 수 없어요. 강사에게 말씀해 주세요.</p>
                      )
                    ) : state === "open" || state === "full" ? (
                      <LectureSignupButton lectureId={l.id} full={state === "full"} needsReview={review} />
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

      {showGuide && <YbmReviewGuide />}

      <p className="text-xs text-mist">특강은 강사가 매달 반 편성 달력에서 정합니다. 신청은 특강 7일 전부터 당일까지 받아요 (강사가 따로 정한 특강은 그 시각부터).</p>
    </div>
  );
}

/**
 * 3주차 모의고사 특강 카드의 후기 링크 안내 (2026-10-08 Alan) — 신청 전에는 "후기를 써야 신청돼요" + 쓰는 법으로 가는 길,
 * 신청한 뒤에는 내가 올린 링크. 링크 칸 자체는 `LectureSignupButton` 이 그린다 (신청 받는 중일 때만).
 */
function ReviewLinkNote({ applied, reviewUrl, notOpen }: { applied: boolean; reviewUrl: string | null; notOpen: boolean }) {
  if (applied) {
    return (
      <div className="rounded-xl bg-brand-50 px-3 py-2.5 text-xs">
        <p className="font-bold text-slate">올린 YBM 수강후기 링크</p>
        {reviewUrl ? (
          <a href={reviewUrl} target="_blank" rel="noopener noreferrer" className="mt-0.5 block break-all font-semibold text-ink underline decoration-brand-200 underline-offset-2 hover:decoration-brand-500">
            {reviewUrl}
          </a>
        ) : (
          <p className="mt-0.5 text-mist">링크 없이 신청됐어요.</p>
        )}
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-brand-200 bg-brand-50 px-3 py-2.5 text-xs">
      <p className="font-black text-brand-700">YBM 수강후기를 쓰고 링크를 올려야 신청돼요</p>
      <p className="mt-0.5 text-slate">
        {notOpen ? "신청이 열리기 전에 미리 써 두세요. " : ""}
        <a href={`#${YBM_REVIEW_GUIDE_ID}`} className="font-bold text-brand-600 underline decoration-brand-200 underline-offset-2">
          후기 쓰는 법 보기
        </a>
      </p>
    </div>
  );
}
