import { loadGated } from "@/components/student/StudentGate";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Reveal } from "@/components/ui/Reveal";
import { Icon } from "@/components/ui/Icon";
import { cn, formatDate, formatTime, formatTimeRange, TRACK_LABEL } from "@/lib/utils";
import { studentTrackLabel } from "@/lib/week5";
import { isYoutubeUrl, liveIdleState, nowKst, sessionStartLabel } from "@/lib/live-links";
import { getMyLiveCards, getMySessions, getMyStudyEligibility, getMyWeek5, getNextSessionBySection, termLabel } from "../_lib/queries";

export const metadata: Metadata = {
  title: "불라방",
  robots: { index: false },
};

export default async function LivePage() {
  // 수강생이 아니면 기능 대신 잠금 안내를 보여준다 — 잠금 판정과 데이터를 함께 받는다 (loadGated)
  // 회차 링크(오늘 → 다음 수업) 가 있으면 그것, 없으면 반의 상시 링크 (2026-09-18 Alan)
  const g = await loadGated("live", () => Promise.all([getMyLiveCards(), getMyWeek5(), getMyStudyEligibility()]));
  if (g.locked) return g.locked;
  const [cards, week5, eligibility] = g.data;
  // 끝난 수업의 링크는 카드에서 빠진다 (2026-10-19 Alan "지금은 불라방이 있는시간대가 아닌데") — 그래서 수업 밖 시간에는 카드가 없고,
  // 지금 수강 중이면 '지금은 불라방 수업 시간이 아니에요' 와 다음 수업을 적는다 (내 수업일 — 인강 반은 라이브가 없어 뺀다)
  const now = nowKst();
  const enrolled = eligibility.accessTerms.size > 0;
  const [next, idle] = await Promise.all([
    getNextSessionBySection(
      cards.map((c) => c.sectionId),
      new Map(cards.flatMap((c) => (c.until ? [[c.sectionId, c.until] as const] : []))),
      new Map(cards.map((c) => [c.sectionId, c.section.time_block] as const)),
    ),
    cards.length === 0 && enrolled
      ? getMySessions().then((sessions) => {
          const live = sessions.flatMap((x) => (x.section && !x.section.recorded ? [{ date: x.date, time_block: x.section.time_block }] : []));
          // 인강 반만 듣는 학생(저녁 화목금 주3일)은 라이브가 없다 — '남은 수업이 없어요' 가 아니라 녹화본으로 안내
          return sessions.length > 0 && live.length === 0 ? ({ state: "recorded" } as const) : liveIdleState(live, now.date, now.minutes);
        })
      : null,
  ]);
  // 개강 전 배정이 있으면 개강일을 적어 준다 (2026-10-02 Alan — 숙제업로드·LC음원과 같은 안내)
  const opens = cards.length === 0 ? [...eligibility.opensOn.values()].sort()[0] : undefined;

  return (
    <div className="space-y-8">
      <PageHeader icon="live" title="불라방" description="현장 강의를 실시간 라이브로. 수업이 시작되면 알림으로 알려 드려요." />

      {cards.length === 0 ? (
        idle ? (
          idle.state === "soon" ? (
            <EmptyState icon="live" title="곧 불라방이 열려요" description="선생님이 방송을 시작하면 알림이 오고, 여기에 입장 버튼이 생겨요." />
          ) : idle.state === "next" ? (
            <EmptyState
              icon="timeslot"
              title="지금은 불라방 수업 시간이 아니에요"
              description={`다음 수업은 ${sessionStartLabel(idle.session, now.date, (d) => formatDate(d))}이에요. 수업이 시작되면 알림이 오고, 여기에 입장 버튼이 생겨요.`}
            />
          ) : idle.state === "recorded" ? (
            <EmptyState
              icon="replay"
              title="인강 반은 불라방이 없어요"
              description="그 날 오전 수업 녹화본을 아래 '지난 수업 다시보기' 에서 봐요."
            />
          ) : (
            <EmptyState
              icon="timeslot"
              title="남은 불라방 수업이 없어요"
              description={
                opens
                  ? `${formatDate(opens)} 개강부터 다시 여기에 입장 버튼이 생겨요. 지난 수업은 다시보기에서 볼 수 있어요.`
                  : "지난 수업은 종강일까지 다시보기에서 볼 수 있어요."
              }
            />
          )
        ) : opens ? (
          <EmptyState
            icon="live"
            title="개강일부터 입장할 수 있어요"
            description={`${formatDate(opens)} 개강부터 불라방 입장 링크가 여기에 보여요.`}
            action={{ href: "/my", label: "내 등록 현황 보기" }}
          />
        ) : (
          <EmptyState
            icon="live"
            title="입장할 수 있는 불라방이 없어요"
            description="등업 전이거나 개강 전이면 표시되지 않아요. 개강일이 지났는데도 보이지 않으면 강사가 입장 링크를 아직 등록하지 않은 것이니 연락해 주세요."
            action={{ href: "/my/verify", label: "등업신청 확인하기" }}
          />
        )
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {cards.map((c, i) => {
            const s = c.section;
            const n = next.get(c.sectionId);
            return (
              <Reveal key={c.sectionId} delay={i * 80} as="li">
                <article className="card relative overflow-hidden p-5 sm:p-6">
                  <div aria-hidden className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-brand-50" />
                  <div className="relative">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="chip">{termLabel(s.term)}</span>
                      <span className="rounded-full bg-ink px-2.5 py-0.5 text-xs font-bold text-white">{studentTrackLabel(s, week5, TRACK_LABEL)}</span>
                      {/* 어느 링크인지 — 오늘 회차 라이브는 끝나면 그대로 다시보기가 된다 */}
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-0.5 text-xs font-black",
                          c.kind === "today" ? "bg-brand-500 text-white" : c.kind === "next" ? "bg-brand-50 text-brand-700" : "bg-line text-slate",
                        )}
                      >
                        {c.kind === "today"
                          ? `오늘 ${c.seq}회차 라이브`
                          : c.kind === "next"
                            ? `${formatDate(c.date!, { month: "numeric", day: "numeric" })} ${c.seq}회차 링크`
                            : "상시 입장 링크"}
                      </span>
                    </div>
                    <h2 className="mt-3 text-xl font-black text-ink">{s.course?.name ?? "강좌"}</h2>
                    {(s.start_time || s.time_block) && (
                      <p className="mt-1 text-sm text-slate">{[formatTimeRange(s.start_time, s.end_time), s.time_block].filter(Boolean).join(" · ")}</p>
                    )}

                    <div className="mt-4 flex items-center gap-3 rounded-xl bg-surface p-3 text-sm">
                      <Icon name="timeslot" size={26} />
                      {n ? (
                        <p>
                          <span className="font-bold text-ink">다음 수업</span>{" "}
                          <span className="text-slate">
                            {n.seq}회차 · {formatDate(n.date)}
                            {n.start_time ? ` ${formatTime(n.start_time)}` : ""}
                          </span>
                        </p>
                      ) : (
                        <p className="text-slate">남은 수업일이 없어요. 종강일 {formatDate(s.closes_at, { month: "long", day: "numeric" })}까지 다시보기를 이용하세요.</p>
                      )}
                    </div>

                    <a href={c.url} target="_blank" rel="noopener noreferrer" className="btn-primary mt-5 w-full !py-4 text-base">
                      <Icon name="live" size={24} className="brightness-0 invert" />
                      불라방 입장
                    </a>
                    <p className="mt-2 text-center text-xs text-mist">
                      {/* 유튜브 라이브만 끝나면 그 주소가 녹화본이다 — Zoom 입장 링크는 다시보기로 올라가지 않는다 (2026-09-30) */}
                      {c.kind === "today" && s.live_to_replay && isYoutubeUrl(c.url)
                        ? "수업이 끝나면 이 주소가 그대로 다시보기에 올라와요. "
                        : ""}
                      수업이 시작되면 알림이 와요. 링크는 본인만 사용해 주세요.
                    </p>
                  </div>
                </article>
              </Reveal>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap gap-3 text-sm">
        <Link href="/my/textbook" className="btn-secondary">
          <Icon name="textbook" size={20} />
          불라방 교재신청
        </Link>
        <Link href="/my/replay" className="btn-secondary">
          <Icon name="replay" size={20} />
          지난 수업 다시보기
        </Link>
      </div>
    </div>
  );
}
