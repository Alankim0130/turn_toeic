import Image from "next/image";
import { Reveal } from "@/components/ui/Reveal";
import { Icon } from "@/components/ui/Icon";
import { site } from "@/lib/site";
import { cn } from "@/lib/utils";

/**
 * 강사별 카드 색. 흰 재킷(이혜영)은 핫핑크 위에서, 핫핑크 재킷(이영수)은 잉크 위에서 살아난다.
 * 사진이 바뀌면 여기 색 조합도 함께 확인할 것.
 */
const TONE = {
  LC: {
    word: "LISTENING",
    card: "bg-gradient-to-br from-brand-400 via-brand-500 to-brand-700 shadow-pink",
    glow: "bg-white/25",
    fade: "from-brand-800/60",
    panel: "bg-white/90 text-ink",
    badge: "bg-brand-500 text-white",
    desc: "text-slate",
  },
  RC: {
    word: "READING",
    card: "bg-ink shadow-soft",
    glow: "bg-brand-500/40",
    fade: "from-ink",
    panel: "border border-white/10 bg-ink/75 text-white",
    badge: "bg-white text-ink",
    desc: "text-white/75",
  },
} as const;

export function Instructors() {
  return (
    <section aria-labelledby="instructors-title" className="relative overflow-hidden bg-brand-50/70 py-20">
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-brand-100 blur-3xl animate-blob" />
      <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-24 h-96 w-96 rounded-full bg-brand-100/70 blur-3xl animate-blob" />

      <div className="container-x relative">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="chip">강사 소개</p>
          <h2 id="instructors-title" className="mt-4 text-3xl font-black tracking-tight text-ink sm:text-4xl">
            진짜 토익 강사는 <span className="text-gradient-brand">강의력</span>이다
          </h2>
          <p className="mt-3 text-slate">LC와 RC를 각각 전담하는 두 대표 강사가 한 반을 함께 이끕니다.</p>
        </Reveal>

        <div className="mx-auto mt-12 grid max-w-md gap-6 md:max-w-5xl md:grid-cols-2 lg:gap-8">
          {site.instructors.map((t, i) => {
            const tone = TONE[t.part];
            return (
              <Reveal key={t.name} delay={i * 140}>
                <article className={cn("group relative isolate aspect-[3/4] overflow-hidden rounded-xl3 md:aspect-[4/5]", tone.card)}>
                  {/* 배경 장식: 파트 글자, 세로 영문, 머리 뒤 후광과 링 */}
                  <span
                    aria-hidden
                    className="absolute -left-2 -top-5 select-none text-[9rem] font-black leading-none tracking-tighter text-white/15 sm:text-[11rem]"
                  >
                    {t.part}
                  </span>
                  <span
                    aria-hidden
                    className="absolute right-5 top-6 select-none text-[0.7rem] font-black tracking-[0.4em] text-white/60 [writing-mode:vertical-rl]"
                  >
                    {tone.word}
                  </span>
                  <span aria-hidden className={cn("absolute left-1/2 top-[8%] aspect-square w-[62%] -translate-x-1/2 rounded-full blur-2xl", tone.glow)} />
                  <span
                    aria-hidden
                    className="absolute left-1/2 top-[4%] aspect-square w-[74%] -translate-x-1/2 rounded-full border border-white/20 transition-transform duration-700 ease-out group-hover:scale-105"
                  />

                  {/* 사진: 카드 바닥에 세우고, 두 사진의 머리 크기가 같도록 높이를 맞춘다 */}
                  <div className="absolute inset-x-0 bottom-0 top-[7%] origin-bottom transition-transform duration-700 ease-out group-hover:scale-[1.04]">
                    <Image
                      src={t.photo.src}
                      alt={`${t.part} 담당 ${t.name} 강사`}
                      fill
                      sizes="(max-width: 768px) 90vw, 500px"
                      className="object-contain object-bottom drop-shadow-[0_18px_30px_rgba(23,18,31,0.25)]"
                    />
                  </div>
                  <div aria-hidden className={cn("absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t to-transparent", tone.fade)} />

                  {/* 이름·소개. 2열일 때 소개 줄 수가 달라도 두 카드의 박스 높이를 맞춘다 */}
                  <div className={cn("absolute inset-x-3 bottom-3 rounded-2xl p-5 backdrop-blur-md sm:inset-x-4 sm:bottom-4 sm:p-6 md:min-h-[10.5rem] xl:min-h-0", tone.panel)}>
                    <div className="flex items-center gap-2">
                      <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-black tracking-widest", tone.badge)}>{t.part}</span>
                      <span className="text-xs font-bold tracking-wide opacity-70">{t.part} 담당</span>
                    </div>
                    <h3 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">
                      {t.name}
                      <span className="ml-1 text-lg font-bold opacity-80 sm:text-xl">강사</span>
                    </h3>
                    <p className={cn("mt-1.5 text-sm leading-relaxed", tone.desc)}>{t.desc}</p>
                  </div>
                </article>
              </Reveal>
            );
          })}
        </div>

        {/* 강사님들 인스타그램 (2026-09-17 Alan 제공). 주소가 비면 아예 그리지 않는다.
            인스타 로고를 따라 그리지 않고 힉스필드 `camera` 아이콘을 쓴다 — 글자가 어디로 가는지 말해 준다 */}
        {site.social.instagram && (
          <Reveal delay={320} className="mt-10 text-center">
            <a
              href={site.social.instagram}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary !py-2.5"
            >
              <Icon name="camera" size={20} />
              강사님 인스타그램
              {/* 계정명은 400px 부터 — 그보다 좁으면(320·360px) 버튼이 두 줄로 접힌다. 푸터에는 늘 적혀 있다 */}
              <span className="hidden font-bold text-slate min-[400px]:inline">{site.social.instagramHandle}</span>
            </a>
          </Reveal>
        )}
      </div>
    </section>
  );
}
