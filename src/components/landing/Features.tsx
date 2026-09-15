import { Icon, type IconName } from "@/components/ui/Icon";
import { Reveal } from "@/components/ui/Reveal";

const FEATURES: { icon: IconName; title: string; desc: string }[] = [
  {
    icon: "target",
    title: "족집게식 핵심 학습",
    desc: "시험에 나오는 것만 정확히. 문법 포인트 정리와 오답 분석법까지, 실전에서 자주 나오는 유형 위주로 수업합니다.",
  },
  {
    icon: "bolt",
    title: "최신 경향 실시간 반영",
    desc: "매달 바뀌는 토익 출제 경향을 커리큘럼에 바로 반영합니다. 역전토익 자체 교재로 이번 달 시험에 딱 맞춘 학습.",
  },
  {
    icon: "rank1",
    title: "몰입도 높은 고퀄 강의",
    desc: "귀에 꽂히는 압도적인 전달력. 완전 초보도 이해가 쏙쏙 되는 설명으로 YBM서면 전체 1위를 지키고 있습니다.",
  },
];

export function Features() {
  return (
    <section aria-labelledby="features-title" className="container-x py-16">
      <Reveal className="mx-auto max-w-2xl text-center">
        <p className="chip">역전토익이 다른 이유</p>
        <h2 id="features-title" className="mt-4 text-3xl font-black tracking-tight text-ink sm:text-4xl">
          왜 <span className="text-gradient-brand">역전</span>이 가능한가
        </h2>
        <p className="mt-3 text-slate">점수가 안 오르는 이유는 공부량이 아니라 방향입니다. 방향을 잡아주는 세 가지.</p>
      </Reveal>

      <div className="mt-10 grid gap-5 md:grid-cols-3">
        {FEATURES.map((f, i) => (
          <Reveal key={f.title} delay={i * 110}>
            <article className="group card h-full p-7 transition duration-300 hover:-translate-y-1.5 hover:shadow-pink">
              <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 ring-1 ring-brand-100 transition group-hover:scale-105">
                <Icon name={f.icon} size={42} />
              </span>
              <h3 className="mt-5 text-xl font-black text-ink">{f.title}</h3>
              <p className="mt-2 leading-relaxed text-slate">{f.desc}</p>
            </article>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
