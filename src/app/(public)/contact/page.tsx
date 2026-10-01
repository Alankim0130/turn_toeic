import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Reveal } from "@/components/ui/Reveal";
import { KakaoMark } from "@/components/ui/BrandMarks";
import { ExternalMark } from "@/components/layout/NavLinks";
import { CONTACT_OPTIONS, type ContactOption } from "@/lib/site";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "연락하기",
  description: "역전토익에 연락하기 — 카카오톡 상담, 이메일·전화 문의, 네이버 예약 대면 상담 중 편한 방법을 골라 주세요.",
  alternates: { canonical: "/contact" },
  openGraph: {
    title: "연락하기 | 역전토익",
    description: "카카오톡 상담, 이메일·전화 문의, 네이버 예약 대면 상담 중 편한 방법을 골라 주세요.",
    url: "/contact",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "역전토익" }],
  },
};

/**
 * 카드마다 들어가는 강사 캐리커처 장면 (2026-10-01 Alan — "쌤들 캐리커처를 합성해서 넣어 주면 귀엽게. 카톡상담 · 전화상담 · 대면상담, 웃기게").
 * 힉스필드 GPT Image 2.5 로 기존 캐리커처를 참조해 만든 장면이다 — CLAUDE.md "강사 캐리커처". 글자·로고는 넣지 않는다 (AI 가 그린 글자는 깨진다).
 */
const ART: Record<ContactOption["key"], { src: string; alt: string; kind: string; cta: string; panel: string }> = {
  kakao: {
    src: "/contact/kakao.webp",
    alt: "휴대폰으로 신나게 채팅하는 이혜영 강사 캐리커처",
    kind: "비대면상담",
    cta: "카카오톡 열기",
    panel: "from-[#FFF6BF] to-[#FEE500]/70",
  },
  email: {
    src: "/contact/inquiry.webp",
    alt: "전화선에 감긴 채 편지를 흔드는 이영수 강사 캐리커처",
    kind: "비대면상담",
    cta: "문의 남기기",
    panel: "from-brand-50 to-brand-100",
  },
  naver: {
    src: "/contact/visit.webp",
    alt: "상담 책상 앞에서 손을 흔드는 두 강사 캐리커처",
    kind: "대면상담",
    cta: "네이버로 예약하기",
    panel: "from-emerald-50 to-emerald-100",
  },
};

/**
 * 연락하기 허브 — **카드 세 장만 화면 가운데에** (2026-10-01 Alan — "연락하기 페이지를 누르면 카드 3개만 딱 중간에").
 * 목록은 `CONTACT_OPTIONS` 한곳. 카카오톡·네이버는 새 창, 이메일·전화 문의는 전용 페이지(`/contact/inquiry`)로 간다 —
 * 폼을 여기 같이 두면 카드를 누르지 않아도 폼이 보여 헷갈린다 (그래서 뗐다).
 */
export default function ContactPage() {
  return (
    <section className="container-x flex min-h-[calc(100dvh-14rem)] flex-col items-center justify-center py-10 sm:py-14">
      <div className="text-center">
        <p className="chip">연락하기</p>
        <h1 className="mt-4 text-3xl font-black tracking-tight text-ink sm:text-4xl">어떻게 연락할까요?</h1>
        <p className="mt-3 text-slate">세 가지 중 편한 방법을 골라 주세요.</p>
      </div>

      <ul className="mt-10 grid w-full max-w-5xl gap-5 sm:grid-cols-3">
        {CONTACT_OPTIONS.map((o, i) => {
          const art = ART[o.key];
          const body = (
            <>
              <div className={cn("relative aspect-square w-full bg-gradient-to-b", art.panel)}>
                <Image
                  src={art.src}
                  alt={art.alt}
                  fill
                  sizes="(max-width: 640px) 90vw, 340px"
                  className="object-contain p-5 transition-transform duration-500 ease-out group-hover:scale-[1.06]"
                />
              </div>
              <div className="flex flex-1 flex-col p-5 sm:p-6">
                <p className="text-xs font-bold tracking-wide text-mist">{art.kind}</p>
                <h2 className="mt-1 text-xl font-black text-ink">{o.label}</h2>
                <p className="mt-1.5 text-sm text-slate">{o.summary}</p>
                <span
                  className={cn(
                    "mt-5 inline-flex items-center gap-2 self-start rounded-full px-4 py-2 text-sm font-bold transition",
                    o.key === "kakao" ? "bg-[#FEE500] text-black/85 group-hover:bg-[#F2DA00]" : "bg-brand-500 text-white shadow-pink group-hover:bg-brand-600",
                  )}
                >
                  {o.key === "kakao" && <KakaoMark size={18} />}
                  {art.cta}
                  {o.external && <ExternalMark className={o.key === "kakao" ? "text-black/60" : "text-white/80"} />}
                </span>
              </div>
            </>
          );
          const className = "group card flex h-full flex-col overflow-hidden transition duration-300 hover:-translate-y-1.5 hover:shadow-pink";
          return (
            <Reveal key={o.key} delay={i * 90} as="li">
              {o.external ? (
                <a href={o.href} target="_blank" rel="noopener noreferrer" className={className}>
                  {body}
                  <span className="sr-only">(새 창)</span>
                </a>
              ) : (
                <Link href={o.href} className={className}>
                  {body}
                </Link>
              )}
            </Reveal>
          );
        })}
      </ul>
    </section>
  );
}
