import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { Icon } from "@/components/ui/Icon";
import { Reveal } from "@/components/ui/Reveal";
import { getSessionProfile } from "@/lib/auth";
import { StudyForm } from "./StudyForm";

export const metadata: Metadata = {
  title: "스터디 신청하기",
  description: "역전토익 수강생 스터디 신청. 목표 점수와 가능한 시간을 남기면 스터디 편성을 도와드립니다.",
  alternates: { canonical: "/study" },
  openGraph: {
    title: "스터디 신청하기 | 역전토익",
    description: "목표 점수와 가능한 시간을 남기면 스터디 편성을 도와드립니다.",
    url: "/study",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "역전토익" }],
  },
};

const STEPS = [
  { icon: "study", title: "신청서 작성", desc: "이름·연락처·목표 점수·가능한 시간을 남겨 주세요." },
  { icon: "contact", title: "담당자 연락", desc: "역전토익에서 연락드려 스터디 방식과 일정을 안내합니다." },
  { icon: "target", title: "스터디 시작", desc: "비슷한 목표의 수강생끼리 묶어 함께 점수를 올립니다." },
] as const;

export default async function StudyPage() {
  const { user, profile } = await getSessionProfile();
  return (
    <section className="container-x py-10 sm:py-14">
      <PageHeader icon="study" title="스터디 신청하기" description="혼자보다 함께. 목표가 같은 수강생과 스터디를 만들어 드립니다." />

      <div className="grid gap-8 lg:grid-cols-[1fr_1.2fr]">
        <div className="space-y-4">
          {STEPS.map((s, i) => (
            <Reveal key={s.title} delay={i * 90}>
              <article className="card flex gap-4 p-5">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-50">
                  <Icon name={s.icon} size={30} />
                </span>
                <div>
                  <p className="text-xs font-black text-brand-600">STEP {i + 1}</p>
                  <h2 className="text-lg font-black text-ink">{s.title}</h2>
                  <p className="mt-1 text-sm text-slate">{s.desc}</p>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
        <Reveal delay={120} className="card p-6 sm:p-8">
          <StudyForm signedIn={!!user} defaults={{ name: profile?.name ?? "", phone: profile?.phone ?? "" }} />
        </Reveal>
      </div>
    </section>
  );
}
