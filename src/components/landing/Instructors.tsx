import Image from "next/image";
import { CountUp } from "@/components/ui/CountUp";
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
    tile: "bg-brand-500 text-white",
  },
  RC: {
    word: "READING",
    card: "bg-ink shadow-soft",
    glow: "bg-brand-500/40",
    fade: "from-ink",
    panel: "border border-white/10 bg-ink/75 text-white",
    badge: "bg-white text-ink",
    tile: "bg-ink text-white",
  },
} as const;

type Instructor = (typeof site.instructors)[number];

/** 한 줄 캐치프레이즈에서 강조어를 찾아 형광펜(`.mark-sweep`)을 씌운다. 못 찾으면 그대로 */
function Tagline({ text, mark }: { text: string; mark: string }) {
  const at = text.indexOf(mark);
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <span className="mark-sweep">{mark}</span>
      {text.slice(at + mark.length)}
    </>
  );
}

/**
 * 강사 소개 블록 (2026-09-17 Alan 제공 소개 슬라이드). 사진 카드 옆에 선다.
 *
 * 위에서부터 **캐치프레이즈 → 학력·경력 → 강점 두 묶음 → 수상**. 스크롤로 들어오면
 * 형광펜이 강조어 밑을 긋고(`.mark-sweep`), 경력 햇수가 세어 올라가고(`CountUp`),
 * 강점 카드와 그 안의 줄, 수상 알약이 **차례로**(`.stagger`) 떠오른다.
 * 움직임 줄이기를 켠 사람에게는 전부 바로 보인다 (globals.css).
 */
function Intro({ t, tone }: { t: Instructor; tone: (typeof TONE)[Instructor["part"]] }) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="chip">{t.part} 담당</span>
        <span className="chip">
          토익 강의&nbsp;
          <CountUp value={t.years} suffix="년" duration={1400} className="font-black text-brand-600" />
        </span>
      </div>

      <h3 className="mt-4 text-2xl font-black leading-snug tracking-tight text-ink sm:text-3xl lg:text-[2.1rem]">
        <Tagline text={t.tagline} mark={t.taglineMark} />
      </h3>
      <p className="mt-2 text-sm font-semibold text-slate">{t.education}</p>

      {/* 강점. 카드가 차례로 뜨고, 카드 안의 줄이 그 뒤를 잇는다 */}
      <div className="stagger mt-6 grid gap-3 sm:grid-cols-2">
        {t.highlights.map((h, j) => (
          <div key={h.title} style={{ transitionDelay: `${320 + j * 140}ms` }} className="card p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", tone.tile)}>
                <Icon name={h.icon} size={22} className="brightness-0 invert" />
              </span>
              <h4 className="pt-1.5 text-[0.95rem] font-black leading-snug text-ink">{h.title}</h4>
            </div>
            <ul className="stagger mt-3 space-y-1.5">
              {h.points.map((pt, k) => (
                <li key={pt} style={{ transitionDelay: `${480 + j * 140 + k * 80}ms` }} className="flex gap-2 text-sm leading-relaxed text-slate">
                  {/* 글머리는 브랜드색 점 — 이모지를 쓰지 않는다 */}
                  <span aria-hidden className="mt-[0.55em] h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                  {pt}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* 수상·추천. 월계관 아이콘 알약이 차례로 뜬다 */}
      <ul className="stagger mt-5 flex flex-wrap gap-2" aria-label="수상 · 추천">
        {t.awards.map((a, j) => (
          <li
            key={a}
            style={{ transitionDelay: `${760 + j * 90}ms` }}
            className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-bold text-brand-700"
          >
            <Icon name="rank1" size={16} />
            {a}
          </li>
        ))}
      </ul>
    </div>
  );
}

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

        {/* 강사마다 한 줄 — 사진 카드 + 소개. 사진이 왼쪽·오른쪽으로 번갈아 서서 리듬이 생긴다 (lg 이상) */}
        <div className="mt-12 space-y-16 lg:space-y-24">
          {site.instructors.map((t, i) => {
            const tone = TONE[t.part];
            const flip = i % 2 === 1;
            return (
              <div
                key={t.name}
                className={cn(
                  "grid items-center gap-8 lg:gap-12",
                  flip ? "lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]" : "lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]",
                )}
              >
                <Reveal className={cn("mx-auto w-full max-w-md", flip && "lg:order-2")}>
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
                        sizes="(max-width: 768px) 90vw, 450px"
                        className="object-contain object-bottom drop-shadow-[0_18px_30px_rgba(23,18,31,0.25)]"
                      />
                    </div>
                    <div aria-hidden className={cn("absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t to-transparent", tone.fade)} />

                    {/* 이름표. 소개는 옆 블록이 맡으므로 여기는 짧게 */}
                    <div className={cn("absolute inset-x-3 bottom-3 rounded-2xl p-5 backdrop-blur-md sm:inset-x-4 sm:bottom-4 sm:p-6", tone.panel)}>
                      <div className="flex items-center gap-2">
                        <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-black tracking-widest", tone.badge)}>{t.part}</span>
                        <span className="text-xs font-bold tracking-wide opacity-70">{tone.word}</span>
                      </div>
                      <h3 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">
                        {t.name}
                        <span className="ml-1 text-lg font-bold opacity-80 sm:text-xl">강사</span>
                      </h3>
                      <p className="mt-1 text-sm font-semibold opacity-75">역전토익 대표 강사 · {t.part} 전담</p>
                    </div>
                  </article>
                </Reveal>

                <Reveal delay={140} className={cn(flip && "lg:order-1")}>
                  <Intro t={t} tone={tone} />
                </Reveal>
              </div>
            );
          })}
        </div>

        {/* 강사님들 인스타그램 (2026-09-17 Alan 제공). 주소가 비면 아예 그리지 않는다.
            인스타 로고를 따라 그리지 않고 힉스필드 `camera` 아이콘을 쓴다 — 글자가 어디로 가는지 말해 준다 */}
        {site.social.instagram && (
          <Reveal delay={200} className="mt-14 text-center">
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
