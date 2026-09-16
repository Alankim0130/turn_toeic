import Link from "next/link";
import { Reveal } from "@/components/ui/Reveal";
import { Icon } from "@/components/ui/Icon";
import { Symbol } from "@/components/ui/Logo";
import { InstructorCameo } from "@/components/ui/InstructorCameo";
import { site } from "@/lib/site";

export function CTA() {
  return (
    <section aria-labelledby="cta-title" className="container-x pb-8 pt-4">
      <Reveal>
        <div className="relative overflow-hidden rounded-xl3 bg-gradient-to-br from-brand-500 via-brand-500 to-brand-700 p-8 text-white shadow-pink sm:p-12">
          <div aria-hidden className="absolute -right-10 -top-10 opacity-20">
            <Symbol size={260} className="brightness-0 invert" />
          </div>
          <div aria-hidden className="absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-white/10 blur-2xl animate-blob" />
          <div className="relative max-w-2xl">
            <h2 id="cta-title" className="text-3xl font-black tracking-tight sm:text-4xl">
              이번 달, 점수를 뒤집을 차례
            </h2>
            <p className="mt-3 text-white/85">
              수강 신청과 결제는 YBM어학원 공식 사이트에서 진행됩니다. 신청 후 수강증을 올리면 이 사이트의 불라방·다시보기가 열립니다.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href={site.academy.ybmUrl} target="_blank" rel="noopener noreferrer" className="btn bg-white text-brand-700 hover:bg-brand-50 !px-6 !py-3.5 text-base">
                YBM 공식 사이트에서 수강 신청
              </a>
              <Link href="/my/verify" className="btn border border-white/50 text-white hover:bg-white/10 !px-6 !py-3.5 text-base">
                <Icon name="verify" size={22} className="brightness-0 invert" />
                수강증 올리고 등업하기
              </Link>
            </div>
          </div>
          {/* 모바일은 버튼 아래 오른쪽, PC 는 배너 오른쪽. 배너 아래 가장자리에 무릎이 잘리도록 바닥에 붙인다 */}
          <InstructorCameo
            name="이영수"
            pose="thumbsup"
            fade={false}
            sizes="(min-width: 1024px) 200px, 120px"
            className="relative -mb-8 ml-auto mt-4 block h-56 drop-shadow-[0_12px_24px_rgba(92,7,48,0.35)] sm:-mb-12 lg:absolute lg:bottom-0 lg:right-12 lg:mb-0 lg:mt-0 lg:h-[92%] xl:right-20"
          />
        </div>
      </Reveal>
    </section>
  );
}
