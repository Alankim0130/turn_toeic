import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { site } from "@/lib/site";

export function Footer() {
  return (
    <footer className="mt-20 border-t border-line bg-paper">
      <div className="container-x grid gap-8 py-12 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Logo height={26} />
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-slate">
            {site.academy.name} 역전토익. 이혜영(LC) · 이영수(RC) 강사가 함께하는 토익 전문 프로그램입니다.
          </p>
          <p className="mt-3 text-xs text-mist">
            수강 신청과 결제는{" "}
            <a href={site.academy.ybmUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-600 underline-offset-2 hover:underline">
              YBM어학원 공식 사이트
            </a>
            에서만 진행됩니다.
          </p>
        </div>
        <nav aria-label="바로가기">
          <p className="text-sm font-bold text-ink">바로가기</p>
          <ul className="mt-3 space-y-2 text-sm text-slate">
            <li><Link href="/" className="hover:text-brand-600">역전토익 소개</Link></li>
            <li><Link href="/my/verify" className="hover:text-brand-600">등업신청</Link></li>
            <li><Link href="/student" className="hover:text-brand-600">수강생전용</Link></li>
            <li><Link href="/my/live" className="hover:text-brand-600">불라방</Link></li>
            <li><Link href="/my/replay" className="hover:text-brand-600">강의 다시보기</Link></li>
            <li><Link href="/study" className="hover:text-brand-600">스터디 신청하기</Link></li>
            <li><Link href="/contact" className="hover:text-brand-600">연락하기</Link></li>
          </ul>
        </nav>
        <div>
          <p className="text-sm font-bold text-ink">오시는 길</p>
          <p className="mt-3 text-sm leading-relaxed text-slate">
            {site.academy.name}
            <br />
            {site.academy.address}
          </p>
        </div>
      </div>
      <div className="border-t border-line">
        <div className="container-x flex flex-col gap-2 py-5 text-xs text-mist sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} 역전토익. All rights reserved.</p>
          <p>본 사이트는 수강생 학습 관리를 위한 페이지입니다.</p>
        </div>
      </div>
    </footer>
  );
}
