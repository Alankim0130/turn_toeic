import { studentGate } from "@/components/student/StudentGate";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Reveal } from "@/components/ui/Reveal";
import { Icon } from "@/components/ui/Icon";
import { cn, formatDate, formatTime, formatTimeRange, TRACK_LABEL } from "@/lib/utils";
import { studentTrackLabel } from "@/lib/week5";
import { getMyLiveCards, getMyWeek5, getNextSessionBySection, termLabel } from "../_lib/queries";

export const metadata: Metadata = {
  title: "불라방",
  robots: { index: false },
};

export default async function LivePage() {
  // 수강생이 아니면 기능 대신 잠금 안내를 보여준다
  const locked = await studentGate("live");
  if (locked) return locked;

  // 회차 링크(오늘 → 다음 수업) 가 있으면 그것, 없으면 반의 상시 링크 (2026-09-18 Alan)
  const cards = await getMyLiveCards();
  const week5 = await getMyWeek5();
  const next = await getNextSessionBySection(cards.map((c) => c.sectionId));

  return (
    <div className="space-y-8">
      <PageHeader icon="live" title="불라방" description="현장 강의를 실시간 라이브로. 수업이 시작되면 알림으로 알려 드려요." />

      {cards.length === 0 ? (
        <EmptyState
          icon="live"
          title="입장할 수 있는 불라방이 없어요"
          description="등업 전이거나 개강 전이면 표시되지 않아요. 개강일이 지났는데도 보이지 않으면 강사가 입장 링크를 아직 등록하지 않은 것이니 연락해 주세요."
          action={{ href: "/my/verify", label: "등업신청 확인하기" }}
        />
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
                      {c.kind === "today" && s.live_to_replay
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
