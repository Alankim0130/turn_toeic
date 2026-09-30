import Image from "next/image";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* 배경 블롭 */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-40 -top-24 h-[28rem] w-[28rem] rounded-full bg-brand-100 blur-3xl animate-blob" />
        <div className="absolute -right-32 top-24 h-[26rem] w-[26rem] rounded-full bg-brand-200/70 blur-3xl animate-blob" style={{ animationDelay: "-5s" }} />
        <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-white blur-3xl animate-blob" style={{ animationDelay: "-9s" }} />
        <div
          className="absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,46,136,0.18) 1px, transparent 0)",
            backgroundSize: "26px 26px",
          }}
        />
      </div>

      {/* YBM어학원 서면 로고 (2026-09-30 Alan 제공) — 역전토익이 어느 학원 소속인지 첫 화면에서 보여 준다.
          **히어로 맨 오른쪽 위** 한 줄이다 (같은 날 Alan "YBM 로고 맨 오른쪽으로 빼줘" — 처음에는 왼쪽 1위 배지 위에 있었다).
          외부 브랜드 표식이라 색·모양을 바꾸지 않고, 이미 줄여 둔 PNG 라 `unoptimized` — CLAUDE.md "YBM 로고" */}
      <div className="container-x flex justify-end pt-5 md:pt-8">
        <Image
          src="/partners/ybm-seomyeon.png"
          alt="YBM어학원 서면"
          width={640}
          height={143}
          unoptimized
          priority
          className="h-9 w-auto animate-fade-up sm:h-10"
          style={{ animationDelay: "0ms" }}
        />
      </div>

      <div className="container-x grid items-center gap-10 pb-14 pt-8 md:grid-cols-[1.1fr_0.9fr] md:pb-24 md:pt-12">
        <div>
          {/* `YBM 부산 전체 1위` 배지 (2026-09-30 Alan — "금색 메달 + 밑에 빨간 리본, 눈에 잘 띄는 게 키 포인트, 문구는 확실하게 크게").
              메달은 힉스필드 GPT Image 2.5 로 만든 투명 컷이다. 배지를 가로지르는 빛줄기(`.rank-sweep`)가 몇 초마다 지나가고
              메달 뒤에서 금빛 고리가 퍼진다 — CLAUDE.md "1위 배지" */}
          <div className="animate-fade-up" style={{ animationDelay: "60ms" }}>
            <p className="relative inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-brand-600 to-brand-500 py-2.5 pl-2 pr-5 text-white shadow-pink ring-2 ring-amber-300 sm:gap-3 sm:pr-7">
              <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
                <span className="rank-sweep" />
              </span>
              <span aria-hidden className="relative isolate -my-6 -ml-2 shrink-0 animate-pop sm:-my-7 sm:-ml-4 lg:-my-8" style={{ animationDelay: "320ms" }}>
                <span className="absolute left-1/2 top-[36%] -z-10 h-14 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-300/70 animate-pulse-ring" />
                <Image
                  src="/illustrations/medal-first.webp"
                  alt=""
                  width={228}
                  height={360}
                  unoptimized
                  priority
                  className="h-[6.5rem] w-auto drop-shadow-[0_8px_14px_rgba(143,12,70,0.35)] sm:h-28 lg:h-32"
                />
              </span>
              <span className="relative">
                <span className="block text-[1.65rem] font-black leading-[1.1] tracking-tight sm:text-4xl lg:text-[2.5rem]">
                  <span className="whitespace-nowrap">YBM 부산</span>{" "}
                  <span className="whitespace-nowrap">
                    전체{" "}
                    <span className="bg-gradient-to-b from-yellow-100 via-amber-200 to-amber-400 bg-clip-text text-transparent drop-shadow-[0_2px_0_rgba(143,12,70,0.45)]">
                      1위
                    </span>
                  </span>
                </span>
                <span className="mt-1 block text-xs font-bold text-white/85 sm:text-sm">22.01~현재 수강생 수 기준</span>
              </span>
            </p>
          </div>
          {/* 헤드라인 (2026-09-30 Alan — "점수를 뒤집는 가장 확실한 방법, 역전토익" 에서 바꿈). 강조색은 예전처럼 끝의 `역전!` 한 곳.
              360px 미만은 32px — 36px 이면 첫 줄이 `시작 점수가 / 달라도,` 로 쪼개진다 */}
          <h1 className="mt-7 animate-fade-up text-[2rem] font-black leading-[1.15] tracking-tight text-ink min-[360px]:text-4xl sm:text-5xl lg:text-6xl" style={{ animationDelay: "120ms" }}>
            시작 점수가 달라도,
            <br />
            끝은 <span className="text-gradient-brand">역전!</span>
          </h1>
          <p className="mt-6 max-w-xl animate-fade-up text-base leading-relaxed text-slate sm:text-lg" style={{ animationDelay: "200ms" }}>
            귀에 꽂히는 압도적인 전달력. 족집게식 핵심 학습과 최신 토익 경향을 실시간으로 반영한 커리큘럼으로,
            부산 서면 YBM어학원에서 목표 점수까지 최단 거리로 갑니다.
          </p>
          <div className="mt-8 flex animate-fade-up flex-wrap gap-3" style={{ animationDelay: "280ms" }}>
            <Link href="/my/verify" className="btn-primary !px-6 !py-3.5 text-base">
              <Icon name="verify" size={22} className="brightness-0 invert" />
              수강증으로 등업신청
            </Link>
            <Link href="/study" className="btn-secondary !px-6 !py-3.5 text-base">
              <Icon name="study" size={22} />
              스터디 신청하기
            </Link>
          </div>
          <ul className="mt-8 flex animate-fade-up flex-wrap gap-x-6 gap-y-2 text-sm font-semibold text-ink-soft" style={{ animationDelay: "360ms" }}>
            <li className="flex items-center gap-2"><Icon name="success" size={18} />누적 수강후기 7,356건</li>
            <li className="flex items-center gap-2"><Icon name="success" size={18} />현장 강의 + 불라방 실시간 라이브</li>
            <li className="flex items-center gap-2"><Icon name="success" size={18} />이혜영 LC · 이영수 RC</li>
          </ul>
        </div>

        {/* 두 강사 투샷 (2026-09-17 Alan — 일러스트 소녀 대신 "우리 강사님 두 분이 같이 있는 이미지").
            힉스필드 GPT Image 2.5 로 원본 사진 두 장을 참조해 한 장으로 합친 투명 배경 컷 — CLAUDE.md "히어로 강사 투샷" */}
        <div className="relative mx-auto w-full max-w-md md:max-w-lg">
          <div aria-hidden className="absolute left-1/2 top-1/2 -z-10 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-300/40 animate-pulse-ring" />
          <div aria-hidden className="absolute left-1/2 top-1/2 -z-10 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-300/30 animate-pulse-ring" style={{ animationDelay: "1.2s" }} />
          <Image
            src="/illustrations/hero-instructors.webp"
            alt="역전토익 대표 강사 이혜영(LC)과 이영수(RC)"
            width={1600}
            height={1806}
            priority
            sizes="(max-width: 768px) 90vw, 40vw"
            className="h-auto w-full animate-float drop-shadow-[0_24px_40px_rgba(255,46,136,0.25)]"
          />
          {/* 왼쪽 아래(페이드로 녹아드는 치마 자리)에 둔다 — 위쪽은 두 분 얼굴·머리라 카드를 올리면 가린다 */}
          <div className="absolute -left-2 bottom-6 hidden rounded-xl2 bg-paper/90 px-4 py-3 shadow-soft ring-1 ring-brand-100 sm:block animate-float-slow">
            <p className="text-[11px] font-bold text-mist">이번 달 목표</p>
            <p className="text-lg font-black text-brand-600">650 → 750 → 850</p>
          </div>
        </div>
      </div>
    </section>
  );
}
