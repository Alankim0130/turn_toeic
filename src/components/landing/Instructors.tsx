import Image from "next/image";
import { Reveal } from "@/components/ui/Reveal";
import { site } from "@/lib/site";

export function Instructors() {
  return (
    <section aria-labelledby="instructors-title" className="relative overflow-hidden bg-brand-50/70 py-20">
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-brand-100 blur-3xl animate-blob" />
      <div className="container-x grid items-center gap-10 md:grid-cols-2">
        <div className="order-2 md:order-1">
          <Reveal>
            <p className="chip">강사 소개</p>
            <h2 id="instructors-title" className="mt-4 text-3xl font-black tracking-tight text-ink sm:text-4xl">
              진짜 토익 강사는
              <br />
              <span className="text-gradient-brand">강의력</span>이다
            </h2>
            <p className="mt-3 text-slate">LC와 RC를 각각 전담하는 두 대표 강사가 한 반을 함께 이끕니다.</p>
          </Reveal>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {site.instructors.map((t, i) => (
              <Reveal key={t.name} delay={i * 120}>
                <article className="card h-full p-6">
                  <span className="inline-flex rounded-full bg-ink px-3 py-1 text-xs font-black tracking-widest text-white">{t.part}</span>
                  <h3 className="mt-3 text-2xl font-black text-ink">{t.name} 강사</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate">{t.desc}</p>
                  <p className="mt-4 text-sm font-bold text-brand-600">“귀에 꽂히는 압도적인 전달력”</p>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
        <Reveal className="order-1 md:order-2">
          <Image
            src="/illustrations/teachers.png"
            alt="LC 담당 이혜영 강사와 RC 담당 이영수 강사 일러스트"
            width={1600}
            height={1200}
            sizes="(max-width: 768px) 90vw, 45vw"
            className="h-auto w-full"
          />
        </Reveal>
      </div>
    </section>
  );
}
