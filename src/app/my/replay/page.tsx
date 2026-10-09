import { loadGated } from "@/components/student/StudentGate";
import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { ReplayCalendar, type ReplayMonth } from "@/components/my/ReplayCalendar";
import { ReplayPeriod } from "@/components/my/ReplayPeriod";
import { formatDate, todayKST } from "@/lib/utils";
import { monthsOf, replayInitialDay, replayTerms, termFlags, type ClassDay, type ReplayEntry } from "@/lib/replay-calendar";
import { getMyAccessibleSections, getMyOrders, getMyReplays, getMySessions, getMyStudyEligibility } from "../_lib/queries";

export const metadata: Metadata = {
  title: "강의 다시보기",
  robots: { index: false },
};

/**
 * 강의 다시보기 — **일정표**다 (2026-10-07 Alan — 첫토익 화면을 보여 주며 "일정표 기반으로 다시보기를 할 수 있으면 좋겠어!
 * 본인 등급에 맞는 과정이 나오도록"). 그전에는 반마다 카드 한 장에 녹화본을 회차순으로 쌓았다 — 120분 · 속성반 학생은 카드가 서넛이라 날짜로 찾기 어려웠다.
 *
 * 맨 위 종강 D-day 띠 → 내 수업일 달력(‹ › 달 넘기기) → 고른 날의 녹화본. 화면은 `ReplayCalendar`, 날짜 계산은 `lib/replay-calendar.ts`.
 * **"내 것" 은 여기서 정한다** — 녹화본은 `getMyReplays`(내 반 + 저녁 반의 오전 짝), 수업일은 `getMySessions`(내 반 — 2주완성은 앞 절반),
 * 둘 다 `my_section_ids()` 로 좁힌 것이다 (등급 체계 10). 레벨 숫자로 따로 거르지 않는다 — 내 반이 곧 내 레벨이다
 * (속성반은 650 + 850 이 저절로 함께 선다).
 */
export default async function ReplayPage() {
  // 수강생이 아니면 기능 대신 잠금 안내를 보여준다 — 잠금 판정과 데이터를 함께 받는다 (loadGated)
  const g = await loadGated("replay", () => Promise.all([getMyReplays(), getMySessions(), getMyAccessibleSections(), getMyOrders()]));
  if (g.locked) return g.locked;
  const [rows, sessions, mySections, orders] = g.data;
  const today = todayKST();

  // 저녁 반 학생은 오전 짝 반의 다시보기를 본다 (화목금 인강 2026-09-18 · 월수금 현장 2026-09-23) — 내 반이 아닌 반의 녹화본이면 그렇게 적어 준다.
  // 짝은 같은 트랙이라(DB `private.recorded_source_section`), 그 트랙에 내 인강 반이 있으면 인강 학생이고 아니면 저녁 현장 학생이다
  const mine = new Set(mySections.map((s) => s.id));
  const recordedTracks = new Set(mySections.filter((s) => s.recorded).map((s) => s.track));

  const replays: ReplayEntry[] = rows.flatMap((r) => {
    const s = r.session;
    const sec = s?.section;
    if (!s || !sec) return [];
    return [
      {
        id: r.id,
        sessionId: s.id,
        date: s.date,
        seq: s.seq,
        level: sec.course?.target_score ?? null,
        subject: sec.subject === "lc" || sec.subject === "rc" ? sec.subject : null,
        // 반 편성에서 시간을 받지 않아 회차 시간은 비어 있다 — 시간대 라벨(`10:00~11:00`)이 곧 수업 시간이다
        time: sec.time_block ?? null,
        track: sec.track,
        url: r.video_url,
        pair: mine.size > 0 && !mine.has(sec.id) ? (recordedTracks.has(sec.track) ? "recorded" : "evening") : null,
      },
    ];
  });

  const classDays: ClassDay[] = [];
  const seen = new Set<string>();
  for (const s of sessions) {
    const track = s.section?.track;
    if (!track || seen.has(`${s.date}|${track}`)) continue;
    seen.add(`${s.date}|${track}`);
    classDays.push({ date: s.date, track });
  }

  if (replays.length === 0 && classDays.length === 0) {
    // 개강 전 배정이 있으면 개강일을 적어 준다 (2026-10-02 Alan — 숙제업로드·LC음원과 같은 안내)
    const { opensOn } = await getMyStudyEligibility(orders);
    const opens = [...opensOn.values()].sort()[0];
    return (
      <div className="space-y-8">
        <PageHeader icon="replay" title="강의 다시보기" description="놓친 수업은 종강일까지 다시 볼 수 있어요." />
        {opens ? (
          <EmptyState
            icon="replay"
            title="개강일부터 볼 수 있어요"
            description={`${formatDate(opens)} 개강부터 수업 녹화본이 여기에 올라와요.`}
            action={{ href: "/my", label: "내 등록 현황 보기" }}
          />
        ) : (
          <EmptyState
            icon="replay"
            title="아직 볼 수 있는 다시보기가 없어요"
            description="수업 녹화본이 등록되면 여기에 표시됩니다. 등업 전이거나 개강 전, 또는 종강일이 지났다면 보이지 않아요."
            action={{ href: "/my", label: "내 등록 현황 보기" }}
          />
        )}
      </div>
    );
  }

  /**
   * 다시보기를 볼 수 있는 기간 = **내가 직접 배정된 반**의 개강일 ~ 종강일 (`replayTerms`) — 2주완성은 앞 절반 마지막 날이 끝이다.
   * 맨 위 띠의 종강 D-day 와 달력 칸의 `개강` · `종강` 이 여기서 나온다.
   */
  const terms = replayTerms(
    orders.flatMap((o) =>
      o.status === "active"
        ? o.enrollments
            .filter((e) => e.status === "active" && e.section)
            .map((e) => ({ term_id: e.section!.term_id, month: e.section!.term?.month ?? null, enrollment_opens_at: e.section!.enrollment_opens_at, closes_at: e.section!.closes_at }))
        : [],
    ),
    today,
  );

  const replayDates = replays.map((r) => r.date);
  const classDates = classDays.map((d) => d.date);
  const months: ReplayMonth[] = monthsOf([...replayDates, ...classDates]).map((m) => ({ ...m, initial: replayInitialDay(replayDates, classDates, today, m) }));
  const first = replayInitialDay(replayDates, classDates, today);
  const start = Math.max(
    0,
    months.findIndex((m) => first?.startsWith(`${m.year}-${String(m.month).padStart(2, "0")}-`)),
  );

  return (
    <div className="space-y-6">
      <PageHeader icon="replay" title="강의 다시보기" description="달력에서 수업일을 누르면 그 날 수업 녹화본을 볼 수 있어요." />

      {/* 종강 D-day — 이 날까지 다시보기를 본다 (첫토익 `수강 종료` 띠 자리) */}
      <ReplayPeriod terms={terms} today={today} />

      <ReplayCalendar today={today} months={months} start={start} classDays={classDays} replays={replays} flags={termFlags(terms)} />

      <p className="text-xs text-mist">녹화본은 수강생 본인만 시청할 수 있습니다. 링크를 외부에 공유하지 마세요.</p>
    </div>
  );
}
