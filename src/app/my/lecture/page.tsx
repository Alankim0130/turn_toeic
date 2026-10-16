import type { Metadata } from "next";
import Link from "next/link";
import { loadGated } from "@/components/student/StudentGate";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Reveal } from "@/components/ui/Reveal";
import { cn, formatDate, lectureWayLabel, todayKST } from "@/lib/utils";
import {
  LECTURE_STATE_CLASS,
  LECTURE_STATE_LABEL,
  lectureCameo,
  lectureCondition,
  lectureConditionOf,
  lectureListed,
  lectureState,
  lectureSubjectBlock,
  lectureSubjectNote,
  lectureTitle,
  seatsLeft,
  snsFollowShort,
  sortLectures,
  wayFull,
  YBM_REVIEW_LINK_HINT,
  type LectureCondition,
} from "@/lib/lecture";
import { site } from "@/lib/site";
import { MaterialNote } from "@/components/class-materials/MaterialNote";
import { InstructorCameo } from "@/components/ui/InstructorCameo";
import { LectureCancelButton, LectureSignupFlow, type WayChoice } from "@/components/my/LectureSignup";
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

  // **강사가 '신청 받기' 를 누른 특강만** 선다 (2026-10-16 Alan — "일정표에는 특강이 표시되도록 하는데, 실제 신청받는곳에서는 전부 안보이도록해줘 …
  // 강사가 직접 '신청받기' 버튼을 누르면 바로 오픈"). 신청 받기 전 · 지난 특강은 내가 신청한 것만 기록으로 남긴다. 같은 날은 RC · LC · 1차 · 2차 순 (sortLectures)
  const shown = sortLectures(lectures.filter((l) => mySignups.has(l.id) || lectureListed(l, today)));
  // 받는 방식 중 후기 조건이 있는 특강이 남았을 때만 후기 쓰는 법을 보여 준다
  const showGuide = shown.some(
    (l) =>
      !mySignups.has(l.id) &&
      lectureListed(l, today) &&
      blockedFor(l).length === 0 &&
      l.ways.some((w) => w.enabled && !wayFull(w) && lectureCondition(w.signup_condition) === "review"),
  );
  // 방식을 고르면 뜨는 조건 상자 — 조건마다 한 번 그려 신청 칸(클라이언트)에 넘긴다
  const conditionBoxes: Partial<Record<LectureCondition, React.ReactNode>> = {
    review: <ReviewConditionBox />,
    sns: <SnsConditionBox />,
    none: <p>{lectureConditionOf("none").student}</p>,
  };

  return (
    <div className="space-y-6">
      <PageHeader icon="bolt" title="특강 신청" description="강사님이 신청을 연 특강과 모의고사를 신청해요. 신청 방식을 고르고, 그 방식의 조건을 마친 뒤 신청하기를 눌러 주세요.">
        <Link href="/my/class" className="btn-secondary">
          내 시간표
        </Link>
      </PageHeader>

      {shown.length === 0 ? (
        <EmptyState
          icon="calendar"
          title="지금 신청할 수 있는 특강이 없어요"
          description="강사님이 신청을 열면 여기에 바로 나타나요. 이번 달 특강 날짜는 내 시간표에서 볼 수 있어요."
          action={{ href: "/my/class", label: "내 시간표 보기" }}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {shown.map((l, i) => {
            const state = lectureState(l, l.ways, today);
            const mine = mySignups.get(l.id) ?? [];
            const applied = mine.length > 0;
            // 학생이 고를 수 있는 방식 — 강사가 켠 것만, 방식 순서대로
            const open = l.ways.filter((w) => w.enabled);
            const choices: WayChoice[] = open.map((w) => {
              const condition = lectureCondition(w.signup_condition);
              return {
                way: w.way,
                label: lectureWayLabel(w.way),
                condition,
                conditionLabel: lectureConditionOf(condition).label,
                full: wayFull(w),
                left: seatsLeft(w),
                applied: w.applied_count,
              };
            });
            // 강사 캐리커처 + 한마디 (2026-10-02 Alan)
            const cameo = lectureCameo(l.lecturer?.name, l.kinds);
            const blocked = blockedFor(l);
            const mySubjects = subjectsByTerm.get(l.term_id) ?? new Set<string>();
            const canCancel = state === "open" || state === "full";
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

                  {/* 강사님 안내 — 수업자료실 안내와 같은 서식 글 (2026-10-15). 길면 앞 네 줄만 보이고 펼친다.
                      글 속 주소는 누르면 새 창으로 간다 (2026-10-16 Alan — "안내글에서 링크가 있다면 클릭했을때 바로가기가 되면 좋겠어") */}
                  {l.notice && <MaterialNote note={l.notice} linkify className="bg-violet-50/70" />}

                  {/* 신청 방식마다 신청 현황 왼쪽, 오른쪽에 강사 캐리커처 + 말풍선 — 손짓이 왼쪽을 향하므로 콘텐츠 오른쪽에 둔다 */}
                  <div className="flex items-end gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate">신청 방식</p>
                      <ul className="mt-1 space-y-1">
                        {open.map((w) => (
                          <li key={w.way} className="flex items-baseline justify-between gap-2 text-sm">
                            <span className="font-bold text-ink">{lectureWayLabel(w.way)}</span>
                            <span className="shrink-0 font-black tabular-nums text-brand-600">
                              {w.applied_count}
                              <span className="text-ink">{w.capacity !== null ? ` / ${w.capacity}명` : "명"}</span>
                            </span>
                          </li>
                        ))}
                        {open.length === 0 && <li className="text-xs text-mist">지금은 받는 방식이 없어요.</li>}
                      </ul>
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
                  ) : applied ? (
                    <div className="mt-auto space-y-2">
                      {mine.map((m) => (
                        <div key={m.way} className="rounded-xl bg-brand-50 px-3 py-2.5 text-xs">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-black text-brand-700">
                              내 신청 <span className="text-ink">· {lectureWayLabel(m.way)}</span>
                            </p>
                            {canCancel && <LectureCancelButton lectureId={l.id} way={m.way} />}
                          </div>
                          <MySignupRecord reviewUrl={m.reviewUrl} snsFollow={m.snsFollow} />
                          {/* 강사 · 관리자가 학생 모드로 눌러 본 신청 — 신청 수가 그대로인 까닭 (2026-10-16 Alan "강사가 테스트로 특강신청을 눌러본거는 집계에서 빼줘") */}
                          {m.staffTest && <p className="mt-1 text-slate">강사 · 관리자 계정의 시험 신청이라 신청 수에 세지 않아요.</p>}
                        </div>
                      ))}
                      {!canCancel && <p className="text-right text-xs text-slate">신청이 마감돼 직접 취소할 수 없어요. 강사에게 말씀해 주세요.</p>}
                    </div>
                  ) : state === "open" || state === "full" ? (
                    <div className="mt-auto">
                      <LectureSignupFlow lectureId={l.id} ways={choices} conditionBoxes={conditionBoxes} />
                    </div>
                  ) : (
                    <p className="mt-auto text-right text-xs font-semibold text-slate">{state === "closed" ? "신청이 마감됐어요" : "지금은 신청을 받지 않아요"}</p>
                  )}
                </article>
              </Reveal>
            );
          })}
        </div>
      )}

      {showGuide && <YbmReviewGuide />}

      <p className="text-xs text-mist">특강 날짜는 강사가 매달 반 편성 달력에서 정해요. 신청은 강사님이 신청을 열면 특강 당일까지 받아요.</p>
    </div>
  );
}

/** 내가 신청할 때 올린 것 — 후기 링크 · 구독 · 팔로우. 조건이 없던 방식이면 그리지 않는다 */
function MySignupRecord({ reviewUrl, snsFollow }: { reviewUrl: string | null; snsFollow: string | null }) {
  if (reviewUrl) {
    return (
      <p className="mt-1 text-slate">
        올린 YBM 수강후기 링크{" "}
        <a
          href={reviewUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block break-all font-semibold text-ink underline decoration-brand-200 underline-offset-2 hover:decoration-brand-500"
        >
          {reviewUrl}
        </a>
      </p>
    );
  }
  const follow = snsFollowShort(snsFollow);
  if (follow) return <p className="mt-1 font-semibold text-ink">유튜브 구독 · 인스타그램 {follow}</p>;
  return null;
}

/** 후기 조건(review) 방식을 고르면 뜨는 안내 (2026-10-08 Alan — 그때는 3주차 모의고사, 2026-10-16 부터 방식마다) — 링크 꼴 + 쓰는 법으로 가는 길 */
function ReviewConditionBox() {
  return (
    <>
      <p>{lectureConditionOf("review").student}</p>
      <p className="mt-1">
        후기 링크는{" "}
        <span className="font-semibold text-ink">
          <BreakableUrl url={YBM_REVIEW_LINK_HINT} />
        </span>{" "}
        처럼 생겼어요.{" "}
        <a href={`#${YBM_REVIEW_GUIDE_ID}`} className="font-bold text-brand-600 underline decoration-brand-200 underline-offset-2">
          후기 쓰는 법 보기
        </a>
      </p>
    </>
  );
}

/**
 * 유튜브 구독 · 인스타그램 팔로우 조건(sns) 방식을 고르면 뜨는 안내 (2026-10-15 Alan 이 보낸 그림 — "댓글달기전 1) 역전토익 유튜브 구독을 눌러주세요
 * 2) 역전토익 인스타그램을 팔로우 해주세요 (기존 팔로우는 "기존"으로 표기 해주세요)"). 두 곳으로 가는 버튼 — 주소는 `site.social` 한곳.
 */
function SnsConditionBox() {
  return (
    <>
      <p>{lectureConditionOf("sns").student}</p>
      <p className="mt-1">이미 팔로우하고 있었다면 &lsquo;기존&rsquo; 으로 골라 주세요.</p>
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
    </>
  );
}
