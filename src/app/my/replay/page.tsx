import { studentGate } from "@/components/student/StudentGate";
import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Reveal } from "@/components/ui/Reveal";
import { Icon } from "@/components/ui/Icon";
import { VideoEmbed } from "@/components/my/VideoEmbed";
import { formatDate, formatTimeRange, TRACK_LABEL } from "@/lib/utils";
import { studentTrackLabel } from "@/lib/week5";
import { RECORDED_LABEL } from "@/lib/utils";
import { getMyAccessibleSections, getMyReplays, getMyWeek5, termLabel, type MyReplay } from "../_lib/queries";

export const metadata: Metadata = {
  title: "강의 다시보기",
  robots: { index: false },
};

export default async function ReplayPage() {
  // 수강생이 아니면 기능 대신 잠금 안내를 보여준다
  const locked = await studentGate("replay");
  if (locked) return locked;

  const replays = (await getMyReplays()).filter((r) => r.session?.section);
  const mySections = await getMyAccessibleSections();
  const week5 = await getMyWeek5(mySections);
  // 저녁 화목금 인강 학생은 오전 짝 반의 다시보기를 본다 (2026-09-18) — 내 반이 아닌 반의 녹화본이면 그렇게 적어 준다
  const mine = new Set(mySections.map((s) => s.id));

  if (replays.length === 0) {
    return (
      <div className="space-y-8">
        <PageHeader icon="replay" title="강의 다시보기" description="놓친 수업은 종강일까지 다시 볼 수 있어요." />
        <EmptyState
          icon="replay"
          title="아직 볼 수 있는 다시보기가 없어요"
          description="수업 녹화본이 등록되면 여기에 표시됩니다. 등업 전이거나 개강 전, 또는 종강일이 지났다면 보이지 않아요."
          action={{ href: "/my", label: "내 등록 현황 보기" }}
        />
      </div>
    );
  }

  // 반별 그룹 (회차 순)
  const groups = new Map<number, { section: NonNullable<NonNullable<MyReplay["session"]>["section"]>; list: MyReplay[] }>();
  for (const r of replays) {
    const s = r.session!.section!;
    const g = groups.get(s.id) ?? { section: s, list: [] };
    g.list.push(r);
    groups.set(s.id, g);
  }
  for (const g of groups.values()) g.list.sort((a, b) => b.session!.seq - a.session!.seq);

  return (
    <div className="space-y-8">
      <PageHeader icon="replay" title="강의 다시보기" description="놓친 수업은 종강일까지 다시 볼 수 있어요." />

      {[...groups.values()].map((g, gi) => (
        <Reveal key={g.section.id} delay={gi * 80}>
          <section className="card overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 border-b border-line bg-brand-50/60 px-5 py-3">
              <span className="chip">{termLabel(g.section.term)}</span>
              <span className="rounded-full bg-ink px-2.5 py-0.5 text-xs font-bold text-white">{studentTrackLabel(g.section, week5, TRACK_LABEL)}</span>
              <p className="font-black text-ink">{g.section.course?.name ?? "강좌"}</p>
              {/* 60분 반은 같은 강좌가 시간마다 따로 있다 — 시간대로 구분한다 */}
              {g.section.time_block && <span className="text-sm font-bold tabular-nums text-ink-soft">{g.section.time_block}</span>}
              {mine.size > 0 && !mine.has(g.section.id) && (
                <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-black text-violet-800" title="교실에 나오지 않고 그 날 오전 수업 녹화본을 봐요">
                  {RECORDED_LABEL} · 오전 수업 녹화본
                </span>
              )}
              <p className="ml-auto flex items-center gap-1 text-xs font-semibold text-slate">
                <Icon name="timeslot" size={16} />
                종강일 {formatDate(g.section.closes_at, { month: "long", day: "numeric" })}까지 시청 가능
              </p>
            </div>
            <ul className="divide-y divide-line">
              {g.list.map((r) => {
                const s = r.session!;
                const title = `${s.seq}회차 · ${formatDate(s.date)} · ${g.section.course?.name ?? "강좌"}`;
                return (
                  <li key={r.id} className="grid gap-4 p-5 lg:grid-cols-[14rem_1fr]">
                    <div className="text-sm">
                      <p className="text-lg font-black text-brand-600">{s.seq}회차</p>
                      <p className="font-semibold text-ink">{formatDate(s.date)}</p>
                      {s.start_time && s.end_time && <p className="text-slate">{formatTimeRange(s.start_time, s.end_time)}</p>}
                      <p className="mt-2 text-xs text-mist">{formatDate(r.published_at, { month: "long", day: "numeric" })} 업로드</p>
                    </div>
                    <VideoEmbed url={r.video_url} title={title} />
                  </li>
                );
              })}
            </ul>
          </section>
        </Reveal>
      ))}

      <p className="text-xs text-mist">녹화본은 수강생 본인만 시청할 수 있습니다. 링크를 외부에 공유하지 마세요.</p>
    </div>
  );
}
