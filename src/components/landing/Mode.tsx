import Image from "next/image";
import Link from "next/link";
import { Reveal } from "@/components/ui/Reveal";
import { Icon } from "@/components/ui/Icon";

export function Mode() {
  return (
    <section aria-labelledby="mode-title" className="container-x py-20">
      <div className="grid items-center gap-10 md:grid-cols-2">
        <Reveal>
          <Image
            src="/illustrations/live-class.png"
            alt="노트북으로 불라방 실시간 라이브 강의를 듣는 수강생 일러스트"
            width={1600}
            height={1200}
            sizes="(max-width: 768px) 90vw, 45vw"
            className="h-auto w-full animate-float-slow"
          />
        </Reveal>
        <div>
          <Reveal>
            <p className="chip">수업 방식</p>
            <h2 id="mode-title" className="mt-4 text-3xl font-black tracking-tight text-ink sm:text-4xl">
              현장에서도, 집에서도
              <br />
              <span className="text-gradient-brand">같은 강의를 실시간으로</span>
            </h2>
          </Reveal>
          <div className="mt-8 space-y-4">
            <Reveal delay={80}>
              <article className="card flex gap-4 p-5">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-50">
                  <Icon name="location" size={30} />
                </span>
                <div>
                  <h3 className="text-lg font-black text-ink">어학원 현강</h3>
                  <p className="mt-1 text-sm leading-relaxed text-slate">
                    부산 서면 YBM어학원 강의실에서 듣는 오프라인 직강. 교재는 개강일 강의실에서 받습니다.
                  </p>
                </div>
              </article>
            </Reveal>
            <Reveal delay={160}>
              <article className="card flex gap-4 border-brand-200 p-5">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-50">
                  <Icon name="live" size={30} />
                </span>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-black text-ink">불라방</h3>
                    <span className="rounded-full bg-brand-500 px-2.5 py-0.5 text-xs font-black text-white">20% 할인</span>
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-slate">
                    현장 강의를 실시간 라이브로 수강하는 방식. 불라방 수강생은 사이트에서 입장 링크와 교재 배송 신청을 이용할 수 있어요.
                  </p>
                  <Link href="/my/live" className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-brand-600 hover:underline">
                    불라방 입장하기 →
                  </Link>
                </div>
              </article>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}
