import type { Metadata } from "next";
import Link from "next/link";
import { loadGated } from "@/components/student/StudentGate";
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
  lectureCondition,
  lectureOpensAt,
  lectureState,
  lectureSubjectBlock,
  lectureSubjectNote,
  lectureTitle,
  seatsLeft,
  signupDday,
  snsFollowShort,
  sortLectures,
  YBM_REVIEW_LINK_HINT,
} from "@/lib/lecture";
import { site } from "@/lib/site";
import { MaterialNote } from "@/components/class-materials/MaterialNote";
import { InstructorCameo } from "@/components/ui/InstructorCameo";
import { LectureCancelButton, LectureSignupButton, SignupOpensIn } from "@/components/my/LectureSignup";
import { BreakableUrl, YBM_REVIEW_GUIDE_ID, YbmReviewGuide } from "@/components/my/YbmReviewGuide";
import { getMyLectures, getMyLectureSignups, getMyStudyEligibility } from "../_lib/queries";

export const metadata: Metadata = { title: "특강 신청", robots: { index: false } };

export default async function MyLecturePage() {
  // 잠금 판정과 데이터를 함께 받는다 (loadGated)
  const g = await loadGated("lecture", () => Promise.all([getMyLectures(), getMyLectureSignups(), getMyStudyEligibility()]));
  if (g.locked) return g.locked;
  const [lectures, mySignups, { subjectsByTerm }] = g.data;
  const today = todayKST();
  // 단과 학생은 제 과목 특강만 (2026-10-12 Alan — "RC 단과반은 LC특강신청이 안되고, LC단과는 RC특강신청이 안되도록"). 막는 것은 DB 트리거이고 여기서는 버튼을 그리지 않는다
  const blockedFor = (l: (typeof lectures)[number]) => (mySignups.has(l.id) ? [] : lectureSubjectBlock(l.kinds, subjectsByTerm.get(l.term_id) ?? new Set<string>()));

  // 신청을 받는 특강만. 지난 특강은 내가 신청한 것만 남겨 기록을 보여 준다. 같은 날은 RC 현강 · 녹화영상 · … 순으로 (sortLectures)
  const open = sortLectures(lectures.filter((l) => l.signup && (today <= l.date || mySignups.has(l.id))));
  // 신청 조건은 강사가 특강마다 고른다 (2026-10-15 — review · sns · none). 후기 조건이 남은 특강이 있을 때만 후기 쓰는 법을 보여 준다
  const reviewFor = (l: (typeof open)[number]) => lectureCondition(l.signup_condition) === "review";
  const showGuide = open.some((l) => reviewFor(l) && !mySignups.has(l.id) && lectureState(l, today) !== "closed" && blockedFor(l).length === 0);

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
            const condition = lectureCondition(l.signup_condition);
            const mine = mySignups.get(l.id);
            const left = seatsLeft(l);
            const pct = l.capacity ? Math.min(100, Math.round((l.applied_count / l.capacity) * 100)) : 0;
            // 강사 캐리커처 + 한마디, 잠긴 특강의 D-day (2026-10-02 Alan)
            const cameo = lectureCameo(l.lecturer?.name, l.kinds);
            const dday = signupDday(l, today);
            const blocked = blockedFor(l);
            const mySubjects = subjectsByTerm.get(l.term_id) ?? new Set<string>();
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
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2.5 py-1 text-xs font-bold",
                        applied ? "bg-brand-500 text-white" : blocked.length > 0 ? "bg-line text-slate" : LECTURE_STATE_CLASS[state],
                      )}
                    >
                      {applied ? "신청 완료" : blocked.length > 0 ? "내 과목 아님" : LECTURE_STATE_LABEL[state]}
                    </span>
                  </div>

                  {/* 강사님 안내 — 수업자료실 안내와 같은 서식 글 (2026-10-15). 길면 앞 네 줄만 보이고 펼친다 */}
                  {l.notice && <MaterialNote note={l.notice} className="bg-violet-50/70" />}

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

                  {blocked.length > 0 ? (
                    <p className="rounded-xl bg-line/60 px-3 py-2.5 text-xs font-semibold text-slate">
                      {lectureSubjectNote(blocked, mySubjects)} <span className="font-normal text-mist">내 수업 과목의 특강과 모의고사는 신청할 수 있어요.</span>
                    </p>
                  ) : (
                    <>
                      {state === "not_open" && dday !== null && (
                        <SignupOpensIn opensAt={lectureOpensAt(l)} label={formatKstDateTime(lectureOpensAt(l))} dday={ddayLabel(dday)} />
                      )}

                      {condition === "review" && (applied || state !== "closed") && (
                        <ReviewLinkNote applied={applied} reviewUrl={mine?.reviewUrl ?? null} notOpen={state === "not_open"} />
                      )}
                      {condition === "sns" && (applied || state !== "closed") && <SnsFollowNote applied={applied} follow={mine?.snsFollow ?? null} notOpen={state === "not_open"} />}
                    </>
                  )}

                  <div className="mt-auto flex flex-wrap items-center justify-end gap-2">
                    {blocked.length > 0 ? null : applied ? (
                      state === "open" || state === "full" ? (
                        <LectureCancelButton lectureId={l.id} />
                      ) : (
                        <p className="text-xs text-slate">신청이 마감돼 직접 취소할 수 없어요. 강사에게 말씀해 주세요.</p>
                      )
                    ) : state === "open" || state === "full" ? (
                      <LectureSignupButton lectureId={l.id} full={state === "full"} condition={condition} />
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
 * 후기 조건(review) 특강 카드의 후기 링크 안내 (2026-10-08 Alan — 그때는 3주차 모의고사, 2026-10-15 부터 강사가 특강마다 고른다) — 신청 전에는 "후기를 써야 신청돼요" + 쓰는 법으로 가는 길,
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
        후기 링크는{" "}
        <span className="font-semibold text-ink">
          <BreakableUrl url={YBM_REVIEW_LINK_HINT} />
        </span>{" "}
        처럼 생겼어요.{" "}
        {notOpen ? "신청이 열리기 전에 미리 써 두세요. " : ""}
        <a href={`#${YBM_REVIEW_GUIDE_ID}`} className="font-bold text-brand-600 underline decoration-brand-200 underline-offset-2">
          후기 쓰는 법 보기
        </a>
      </p>
    </div>
  );
}

/**
 * 유튜브 구독 · 인스타그램 팔로우 조건 특강 카드의 안내 (2026-10-15 Alan 이 보낸 그림 — "댓글달기전 1) 역전토익 유튜브 구독을 눌러주세요
 * 2) 역전토익 인스타그램을 팔로우 해주세요 (기존 팔로우는 "기존"으로 표기 해주세요)"). 신청 전에는 두 곳으로 가는 버튼, 신청한 뒤에는 내가 고른 것.
 * 체크 칸 자체는 `LectureSignupButton` 이 그린다 (신청 받는 중일 때만). 주소는 `site.social` 한곳.
 */
function SnsFollowNote({ applied, follow, notOpen }: { applied: boolean; follow: string | null; notOpen: boolean }) {
  if (applied) {
    return (
      <div className="rounded-xl bg-brand-50 px-3 py-2.5 text-xs">
        <p className="font-bold text-slate">신청 조건</p>
        <p className="mt-0.5 font-semibold text-ink">
          유튜브 구독 · 인스타그램 {snsFollowShort(follow) ?? "팔로우"}
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-brand-200 bg-brand-50 px-3 py-2.5 text-xs">
      <p className="font-black text-brand-700">역전토익 유튜브 구독 · 인스타그램 팔로우를 하고 신청해요</p>
      <p className="mt-0.5 text-slate">
        이미 팔로우하고 있었다면 신청할 때 &lsquo;기존&rsquo; 으로 골라 주세요.{notOpen ? " 신청이 열리기 전에 미리 해 두세요." : ""}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {site.social.youtube && (
          <a href={site.social.youtube} target="_blank" rel="noopener noreferrer" className="btn-secondary !px-3 !py-1.5 text-xs">
            역전토익 유튜브
          </a>
        )}
        {site.social.instagram && (
          <a href={site.social.instagram} target="_blank" rel="noopener noreferrer" className="btn-secondary !px-3 !py-1.5 text-xs">
            역전토익 인스타그램
          </a>
        )}
      </div>
    </div>
  );
}
