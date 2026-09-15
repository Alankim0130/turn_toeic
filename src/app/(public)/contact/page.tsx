import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { Icon } from "@/components/ui/Icon";
import { Reveal } from "@/components/ui/Reveal";
import { getSessionProfile } from "@/lib/auth";
import { site } from "@/lib/site";
import { ContactForm } from "./ContactForm";

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
      <PageHeader icon="contact" title="연락하기" description="궁금한 점을 남겨 주시면 확인 후 연락드립니다." />

      <div className="grid gap-8 lg:grid-cols-[1fr_1.2fr]">
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
          <ContactForm defaults={{ name: profile?.name ?? "", phone: profile?.phone ?? "", email: user?.email ?? "" }} />
        </Reveal>
      </div>
    </section>
  );
}
