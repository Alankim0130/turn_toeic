import { CountUp } from "@/components/ui/CountUp";
import { Reveal } from "@/components/ui/Reveal";

/** YBM 공식 페이지의 누적 수강후기 통계 (2026-09 기준) */
const STATS = [
  { value: 7356, label: "누적 수강후기", suffix: "건" },
  { value: 1038, label: "“커리큘럼이 탄탄해요”", suffix: "명" },
  { value: 556, label: "“목표 달성에 도움이 돼요”", suffix: "명" },
  { value: 254, label: "“피드백이 상세해요”", suffix: "명" },
];

export function Stats() {
  return (
    <section aria-labelledby="stats-title" className="container-x py-16">
      <h2 id="stats-title" className="sr-only">수강생 평가</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STATS.map((s, i) => (
          <Reveal key={s.label} delay={i * 90} className="card relative overflow-hidden p-6">
            <div aria-hidden className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-brand-50" />
            <p className="relative text-4xl font-black tracking-tight text-brand-600">
              <CountUp value={s.value} suffix={s.suffix} />
            </p>
            <p className="relative mt-2 text-sm font-semibold text-slate">{s.label}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
