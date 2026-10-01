import { CountUp } from "@/components/ui/CountUp";
import { Reveal } from "@/components/ui/Reveal";
import { ExternalMark } from "@/components/layout/NavLinks";
import { site } from "@/lib/site";
import type { YbmReviewStatsRow } from "@/lib/ybm-stats-data";

/**
 * YBM 공식 페이지의 수강후기 통계 — 누적 후기 수 + 후기 태그 8개 (2026-10-01 Alan — "YBM 홈페이지에서 실제 데이터를 매일 한 번씩
 * 가지고 와서 … 8개 항목의 숫자를 다 반영"). 숫자는 `ybm_review_stats`(크론이 매일 갱신)에서 오고 **코드에 적지 않는다** —
 * 2026-09 에는 7,356건 등 네 숫자가 여기 하드코딩되어 있었다 (작업 원칙 4 위반이었다). 읽지 못하면 구간을 아예 그리지 않는다.
 * `후기 바로보기` 는 YBM 페이지의 후기 탭(`site.academy.ybmReviewUrl`)을 새 창으로 연다 (같은 날 Alan 제공 링크).
 */
export function Stats({ stats }: { stats: YbmReviewStatsRow | null }) {
  if (!stats) return null;
  const updated = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric" }).format(new Date(stats.fetchedAt));

  return (
    <section aria-labelledby="stats-title" className="container-x py-16">
      <Reveal className="card relative overflow-hidden p-6 sm:p-8">
        <div aria-hidden className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-brand-50" />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="chip">YBM 공식 수강후기</p>
            <h2 id="stats-title" className="mt-4 text-sm font-bold text-slate">누적 수강후기</h2>
            <p className="mt-1 text-5xl font-black tracking-tight text-brand-600 sm:text-6xl">
              <CountUp value={stats.total} suffix="건" />
            </p>
            <p className="mt-3 text-xs text-mist">YBM 공식 홈페이지 기준 · {updated} 갱신 · 매일 자동으로 가져와요</p>
          </div>
          <a href={site.academy.ybmReviewUrl} target="_blank" rel="noopener noreferrer" className="btn-primary shrink-0 !px-6 !py-3.5 text-base">
            후기 바로보기
            <ExternalMark className="text-white/80" />
            <span className="sr-only">(새 창)</span>
          </a>
        </div>
      </Reveal>

      {/* 후기 태그 8개 — YBM 페이지의 순서 그대로. 수강생이 후기에 붙인 평가 태그와 그 수 */}
      <ul className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="수강생이 남긴 평가">
        {stats.tags.map((t, i) => (
          <Reveal key={t.key} delay={i * 60} as="li" className="card relative overflow-hidden p-4 sm:p-5">
            <div aria-hidden className="absolute -right-5 -top-5 h-16 w-16 rounded-full bg-brand-50" />
            <p className="relative text-2xl font-black tracking-tight text-ink sm:text-3xl">
              <CountUp value={t.count} suffix="명" />
            </p>
            <p className="relative mt-1 text-sm font-semibold text-slate">“{t.label}”</p>
          </Reveal>
        ))}
      </ul>
    </section>
  );
}
