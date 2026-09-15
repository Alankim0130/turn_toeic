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

      <div className="container-x grid items-center gap-10 py-14 md:grid-cols-[1.1fr_0.9fr] md:py-24">
        <div>
          <p className="animate-fade-up chip" style={{ animationDelay: "0ms" }}>
            <Icon name="rank1" size={18} />
            YBM서면 전체 1위 · 22.01~현재 수강생 수 기준
          </p>
          <h1 className="mt-5 animate-fade-up text-4xl font-black leading-[1.15] tracking-tight text-ink sm:text-5xl lg:text-6xl" style={{ animationDelay: "80ms" }}>
            점수를 뒤집는
            <br />
            가장 확실한 방법,
            <br />
            <span className="text-gradient-brand">역전토익</span>
          </h1>
          <p className="mt-6 max-w-xl animate-fade-up text-base leading-relaxed text-slate sm:text-lg" style={{ animationDelay: "160ms" }}>
            귀에 꽂히는 압도적인 전달력. 족집게식 핵심 학습과 최신 토익 경향을 실시간으로 반영한 커리큘럼으로,
            부산 서면 YBM어학원에서 목표 점수까지 최단 거리로 갑니다.
          </p>
          <div className="mt-8 flex animate-fade-up flex-wrap gap-3" style={{ animationDelay: "240ms" }}>
            <Link href="/my/verify" className="btn-primary !px-6 !py-3.5 text-base">
              <Icon name="verify" size={22} className="brightness-0 invert" />
              수강증으로 등업신청
            </Link>
            <Link href="/study" className="btn-secondary !px-6 !py-3.5 text-base">
              <Icon name="study" size={22} />
              스터디 신청하기
            </Link>
          </div>
          <ul className="mt-8 flex animate-fade-up flex-wrap gap-x-6 gap-y-2 text-sm font-semibold text-ink-soft" style={{ animationDelay: "320ms" }}>
            <li className="flex items-center gap-2"><Icon name="success" size={18} />누적 수강후기 7,356건</li>
            <li className="flex items-center gap-2"><Icon name="success" size={18} />현장 강의 + 불라방 실시간 라이브</li>
            <li className="flex items-center gap-2"><Icon name="success" size={18} />이혜영 LC · 이영수 RC</li>
          </ul>
        </div>

        <div className="relative mx-auto w-full max-w-md md:max-w-none">
          <div aria-hidden className="absolute left-1/2 top-1/2 -z-10 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-300/40 animate-pulse-ring" />
          <div aria-hidden className="absolute left-1/2 top-1/2 -z-10 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-300/30 animate-pulse-ring" style={{ animationDelay: "1.2s" }} />
          <Image
            src="/illustrations/hero-comeback.png"
            alt="역전토익 수강생이 상승 화살표를 따라 900점 목표로 올라가는 일러스트"
            width={1600}
            height={1200}
            priority
            sizes="(max-width: 768px) 90vw, 45vw"
            className="h-auto w-full animate-float drop-shadow-[0_24px_40px_rgba(255,46,136,0.25)]"
          />
          <div className="absolute -left-2 bottom-6 hidden rounded-xl2 bg-paper/90 px-4 py-3 shadow-soft ring-1 ring-brand-100 sm:block animate-float-slow">
            <p className="text-[11px] font-bold text-mist">이번 달 목표</p>
            <p className="text-lg font-black text-brand-600">650 → 750 → 850</p>
          </div>
        </div>
      </div>
    </section>
  );
}
