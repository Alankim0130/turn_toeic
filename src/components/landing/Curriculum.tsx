import { Reveal } from "@/components/ui/Reveal";
import { Icon } from "@/components/ui/Icon";

const LEVELS = [
  { score: 650, name: "650 목표", tag: "초급 · 중급속성", pct: 55, desc: "기초부터 차근차근. 토익이 처음이어도 파트별 핵심 유형을 잡아 650을 넘깁니다." },
  { score: 750, name: "750 목표", tag: "중급속성 · 실전속성", pct: 75, desc: "실전 문제 풀이 비중을 높여 시간 관리와 오답 패턴을 잡습니다. 가장 많은 수강생이 선택하는 반." },
  { score: 850, name: "850 목표", tag: "고급", pct: 95, desc: "고난도 Part 3·4·7 집중. 850 이상을 안정적으로 만드는 마무리 과정." },
];

export function Curriculum() {
  return (
    <section aria-labelledby="curriculum-title" className="bg-ink py-20 text-white">
      <div className="container-x">
        <Reveal className="max-w-2xl">
          <p className="chip !border-brand-400/40 !bg-white/10 !text-brand-200">커리큘럼</p>
          <h2 id="curriculum-title" className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">
            목표 점수별로 딱 맞게
          </h2>
          <p className="mt-3 text-white/70">
            650 · 750 · 850 목표반과 프리미어반. 매달 새 기수가 열리고, 주3일(월수금 또는 화목금) 또는 주5일로 들을 수 있습니다.
          </p>
        </Reveal>

        <div className="mt-10 grid gap-5 lg:grid-cols-3">
          {LEVELS.map((l, i) => (
            <Reveal key={l.score} delay={i * 110}>
              <article className="group relative h-full overflow-hidden rounded-xl3 border border-white/10 bg-white/5 p-7 transition hover:border-brand-400/60 hover:bg-white/10">
                <div className="flex items-baseline justify-between">
                  <p className="text-5xl font-black tracking-tight text-brand-300">{l.score}</p>
                  <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white/80">{l.tag}</span>
                </div>
                <h3 className="mt-3 text-xl font-black">{l.name}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/70">{l.desc}</p>
                <div className="mt-6 h-2 overflow-hidden rounded-full bg-white/10" aria-hidden>
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-300 transition-[width] duration-1000 ease-out group-hover:w-full"
                    style={{ width: `${l.pct}%` }}
                  />
                </div>
              </article>
            </Reveal>
          ))}
        </div>

        <Reveal delay={200} className="mt-5">
          <div className="flex flex-col gap-4 rounded-xl3 border border-brand-400/40 bg-gradient-to-r from-brand-600 to-brand-500 p-7 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15">
                <Icon name="rank1" size={36} className="brightness-0 invert" />
              </span>
              <div>
                <h3 className="text-xl font-black">프리미어반</h3>
                <p className="text-sm text-white/85">1개월 등록 시 토익 응시권 증정. 750 목표 실전 집중 과정.</p>
              </div>
            </div>
            <p className="text-sm font-semibold text-white/80">자세한 개설 정보는 YBM 공식 사이트에서</p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
