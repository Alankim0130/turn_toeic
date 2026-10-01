import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { Icon } from "@/components/ui/Icon";
import { Reveal } from "@/components/ui/Reveal";
import { getSessionProfile } from "@/lib/auth";
import { CONTACT_OPTIONS, site } from "@/lib/site";
import { cn } from "@/lib/utils";
import { KakaoMark } from "@/components/ui/BrandMarks";
import { ExternalMark } from "@/components/layout/NavLinks";
import { ContactForm } from "./ContactForm";
import Link from "next/link";

export const metadata: Metadata = {
  title: "연락하기",
  description: "역전토익에 문의하기. 수강, 불라방, 다시보기, 교재 관련 궁금한 점을 남겨 주세요.",
  alternates: { canonical: "/contact" },
  openGraph: {
    title: "연락하기 | 역전토익",
    description: "수강, 불라방, 다시보기, 교재 관련 궁금한 점을 남겨 주세요.",
    url: "/contact",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "역전토익" }],
  },
};

export default async function ContactPage() {
  const { user, profile } = await getSessionProfile();
  return (
    <section className="container-x py-10 sm:py-14">
      <PageHeader icon="contact" title="연락하기" description="카카오톡 · 이메일 · 네이버 예약 중 편한 방법으로 연락 주세요." />

      {/* 세 갈래 고르기 (2026-10-01 Alan — "셋 중에서 하나 선택"). 목록은 CONTACT_OPTIONS 한곳 — 이메일은 아래 문의 폼으로 내려간다 */}
      <ul className="mb-8 grid gap-3 sm:grid-cols-3">
        {CONTACT_OPTIONS.map((o, i) => {
          const body = (
            <>
              <span
                className={cn(
                  "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl",
                  o.key === "kakao" ? "bg-[#FEE500]" : "bg-brand-50",
                )}
              >
                {o.key === "kakao" ? <KakaoMark size={26} /> : <Icon name={o.icon} size={30} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-base font-black text-ink">
                  {o.label}
                  {o.external && <ExternalMark className="text-mist" />}
                </span>
                <span className="block text-sm text-slate">{o.summary}</span>
              </span>
            </>
          );
          const className = "card flex h-full items-center gap-4 p-4 transition hover:-translate-y-0.5 hover:shadow-pink";
          return (
            <Reveal key={o.key} delay={i * 80} as="li">
              {o.external ? (
                <a href={o.href} target="_blank" rel="noopener noreferrer" className={className}>
                  {body}
                  <span className="sr-only">(새 창)</span>
                </a>
              ) : (
                <a href="#contact-form" className={className}>
                  {body}
                </a>
              )}
            </Reveal>
          );
        })}
      </ul>

      <div id="contact-form" className="grid scroll-mt-24 gap-8 lg:grid-cols-[1fr_1.2fr]">
        <div className="space-y-4">
          <Reveal>
            <article className="card p-6">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50">
                <Icon name="location" size={30} />
              </span>
              <h2 className="mt-4 text-lg font-black text-ink">{site.academy.name}</h2>
              <p className="mt-1 text-sm text-slate">{site.academy.address}</p>
              <a href={site.academy.ybmUrl} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex text-sm font-bold text-brand-600 hover:underline">
                YBM 공식 페이지에서 수강 신청 →
              </a>
            </article>
          </Reveal>
          <Reveal delay={90}>
            <article className="card p-6">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50">
                <Icon name="bolt" size={30} />
              </span>
              <h2 className="mt-4 text-lg font-black text-ink">자주 묻는 질문</h2>
              <ul className="mt-3 space-y-3 text-sm text-slate">
                <li>
                  <p className="font-bold text-ink">등업이 안 돼요</p>
                  가입한 실명과 수강증의 이름이 같은지 확인해 주세요. 개강일 전에 올리면 예비등록생으로 표시되고 개강일에 자동 전환됩니다.
                </li>
                <li>
                  <p className="font-bold text-ink">다시보기는 언제까지 볼 수 있나요</p>
                  강사가 지정한 종강일까지 볼 수 있어요. 마이페이지에서 종강일을 확인할 수 있습니다.
                </li>
                <li>
                  <p className="font-bold text-ink">불라방 교재는 어떻게 받나요</p>
                  불라방 수강생은 교재신청 메뉴에서 배송지를 남기면 보내드립니다.
                </li>
              </ul>
            </article>
          </Reveal>
        </div>
        <Reveal delay={120} className="card p-6 sm:p-8">
          {/* 답변이 어디로 오나 (2026-09-30 Alan — "회원가입을 하면 답변을 여기로 바로 받을 수 있다고 안내도 같이").
              로그인하고 보낸 문의만 답변이 알림함으로 간다 — 비회원 문의는 남긴 연락처로 연락한다 */}
          {user ? (
            <p className="mb-5 flex items-start gap-2 rounded-xl bg-brand-50 px-4 py-3 text-sm text-ink">
              <Icon name="bell" size={20} className="mt-0.5" />
              <span>
                답변은 <b>마이페이지 → 알림</b>으로 바로 보내드려요.
              </span>
            </p>
          ) : (
            <div className="mb-5 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-ink">
              <p className="flex items-start gap-2">
                <Icon name="bell" size={20} className="mt-0.5" />
                <span>
                  <b>로그인하고 문의하면 답변을 사이트 알림함으로 바로 받아요.</b> 비회원 문의는 남겨 주신 연락처로 답변드려요.
                </span>
              </p>
              <div className="mt-2.5 flex flex-wrap gap-2 pl-7">
                <Link href="/login?next=%2Fcontact" className="btn-primary !px-4 !py-1.5 text-xs">로그인</Link>
                <Link href="/signup" className="btn-secondary !px-4 !py-1.5 text-xs">회원가입</Link>
              </div>
            </div>
          )}
          <ContactForm signedIn={!!user} defaults={{ name: profile?.name ?? "", phone: profile?.phone ?? "", email: user?.email ?? "" }} />
        </Reveal>
      </div>
    </section>
  );
}
