import Image from "next/image";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { FlipHeadline } from "./FlipHeadline";
import { KakaoChatButton } from "@/components/ui/KakaoChatButton";

/** `reviewTotal` = YBM 공식 페이지의 누적 수강후기 수 (`ybm_review_stats`, 매일 갱신). 못 읽었으면 그 줄을 비운다 — 지어내지 않는다 */
export function Hero({ reviewTotal }: { reviewTotal: number | null }) {
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

      {/* 맨 위 = YBM어학원 서면 로고 + `YBM 부산 전체 1위` 배지.
          - **휴대폰(sm 미만)은 로고가 왼쪽 위 한 줄, 그 아래 배지**다 (2026-10-03 Alan — "모바일버전에 ybm로고를 왼쪽 위로 올리고,
            YBM부산 전체 1등 을 한줄로 펼치고"). 2026-10-01~03 에는 휴대폰에서도 로고가 배지 오른쪽에 서서, 자리가 모자란 배지가
            `YBM 부산 / 전체 1위` 두 줄로 접혔다.
          - sm 부터는 한 줄 = 왼쪽 배지 + 오른쪽 끝 로고 (2026-10-01 Alan "YBM 로고를 1위 줄과 같은 줄로"). 격자(제목 · 사진) 위라
            PC 에서 로고가 화면 맨 오른쪽에 선다. 로고가 DOM 에서 먼저인 것은 휴대폰 순서에 맞춘 것이다 (sm 부터 `order-last`).
          - **배지 문구는 어느 폭에서도 한 줄**이다 (nowrap). 320~359px 은 글자를 줄여(1.4rem) 넣는다 — 1.65rem 이면 320px 에서 넘친다.
          - 로고와 배지 사이(gap-7)를 좁히지 말 것 — 메달이 배지 위로 14px 튀어나오고 뒤에서 금빛 고리가 퍼져서, 좁으면 로고를 덮는다.
          배지: 메달은 힉스필드 GPT Image 2.5 로 만든 투명 컷이고 빛줄기(`.rank-sweep`)가 몇 초마다 지나간다 — CLAUDE.md "1위 배지".
          로고: 외부 브랜드 표식이라 색·모양을 바꾸지 않고, 이미 줄여 둔 PNG 라 `unoptimized` — CLAUDE.md "YBM 로고" */}
      <div className="container-x pt-6 md:pt-10">
        {/* sm 부터는 줄바꿈을 허용해 둔다 — 배지가 한 줄로 고정이라, 혹시 자리가 모자라면 넘치는 대신 로고가 다음 줄로 내려간다 */}
        <div
          className="flex animate-fade-up flex-col items-start gap-7 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-4 sm:gap-y-3"
          style={{ animationDelay: "60ms" }}
        >
          <Image
            src="/partners/ybm-seomyeon.png"
            alt="YBM어학원 서면"
            width={640}
            height={143}
            unoptimized
            priority
            className="h-7 w-auto shrink-0 sm:order-last sm:ml-auto sm:h-9 lg:h-10"
          />
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
              <span className="block whitespace-nowrap text-[1.4rem] font-black leading-[1.1] tracking-tight min-[360px]:text-[1.65rem] sm:text-4xl lg:text-[2.5rem]">
                YBM 부산 전체{" "}
                <span className="bg-gradient-to-b from-yellow-100 via-amber-200 to-amber-400 bg-clip-text text-transparent drop-shadow-[0_2px_0_rgba(143,12,70,0.45)]">
                  1위
                </span>
              </span>
              <span className="mt-1 block text-xs font-bold text-white/85 sm:text-sm">22.01~현재 수강생 수 기준</span>
            </span>
          </p>
        </div>
      </div>

      <div className="container-x grid items-center gap-10 pb-14 pt-7 md:grid-cols-[1.1fr_0.9fr] md:pb-24 md:pt-9">
        <div>
          {/* 헤드라인 — "시작 점수가 달라도, 끝은 역전!" 과 예전 "점수를 뒤집는 가장 확실한 방법, 역전토익" 이 번갈아
              글자마다 뒤집히며 바뀐다 (2026-09-30 Alan). 문구·시간은 src/lib/flip-headline.ts. 들어오는 움직임은 글자 뒤집기가 맡아 fade-up 을 뺐다.
              두 문구 다 3줄이다 — 휴대폰 · PC 모두 (2026-10-03 Alan — `시작 점수가 / 달라도, / 끝은 역전!`).
              그래서 320px 에서도 36px 로 둔다 — 예전에는 `시작 점수가 달라도,` 가 쪼개지지 않게 360px 미만을 32px 로 줄였다 */}
          <FlipHeadline className="text-4xl font-black leading-[1.15] tracking-tight text-ink sm:text-5xl lg:text-6xl" />
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
            {/* 카카오톡 상담 (2026-10-01 Alan) — 랜딩 곳곳의 노란 버튼 중 첫 번째 */}
            <KakaoChatButton size="lg" />
          </div>
          <ul className="mt-8 flex animate-fade-up flex-wrap gap-x-6 gap-y-2 text-sm font-semibold text-ink-soft" style={{ animationDelay: "360ms" }}>
            {reviewTotal !== null && (
              <li className="flex items-center gap-2"><Icon name="success" size={18} />누적 수강후기 {reviewTotal.toLocaleString("ko-KR")}건</li>
            )}
            <li className="flex items-center gap-2"><Icon name="success" size={18} />현장 강의 + 불라방 실시간 라이브</li>
            <li className="flex items-center gap-2"><Icon name="success" size={18} />이혜영 LC · 이영수 RC</li>
          </ul>
        </div>

        {/* 두 강사 투샷 — **두 분 모두 강사프로필 원본 실사**(2026-10-01 Alan — "내가 준 원본 사진으로, 높이·얼굴 크기를 맞춰서").
            머리 높이를 똑같이(445px) 맞춰 sharp 로 합쳤다. 왼쪽 이혜영 팔짱, 오른쪽 이영수 허리에 손 — 참고 사진의 구도.
            CLAUDE.md "히어로 강사 투샷". 여기만 실사이고 다른 강사 그림은 전부 캐리커처다 */}
        <div className="relative mx-auto w-full max-w-md md:max-w-lg">
          <div aria-hidden className="absolute left-1/2 top-1/2 -z-10 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-300/40 animate-pulse-ring" />
          <div aria-hidden className="absolute left-1/2 top-1/2 -z-10 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-300/30 animate-pulse-ring" style={{ animationDelay: "1.2s" }} />
          <Image
            src="/illustrations/hero-instructors.webp"
            alt="역전토익 대표 강사 이혜영(LC)과 이영수(RC)"
            width={1743}
            height={1806}
            priority
            sizes="(max-width: 768px) 90vw, 40vw"
            className="h-auto w-full animate-float drop-shadow-[0_24px_40px_rgba(255,46,136,0.25)]"
          />
          {/* `이번 달 목표 650 → 750 → 850` 카드는 2026-10-01 Alan 요청으로 지웠다 — 다시 넣지 말 것 */}
        </div>
      </div>
    </section>
  );
}
