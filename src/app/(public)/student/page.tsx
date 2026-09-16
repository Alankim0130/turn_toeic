import type { Metadata } from "next";
import Link from "next/link";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Reveal } from "@/components/ui/Reveal";
import { InstructorCameo } from "@/components/ui/InstructorCameo";
import { FeatureCard } from "@/components/student/FeatureCard";
import { UnlockActions, unlockState } from "@/components/student/unlock";
import { getStudentAccess, type StudentAccess } from "@/lib/auth";
import { site, STUDENT_FEATURES, STUDENT_HUB } from "@/lib/site";
import { cn, formatDate } from "@/lib/utils";

const featureNames = STUDENT_FEATURES.map((f) => f.label).join(", ");

export const metadata: Metadata = {
  title: STUDENT_HUB.label,
  description: `역전토익 수강생만 이용하는 ${featureNames}. 수강증을 올려 등업하면 바로 열립니다.`,
  alternates: { canonical: STUDENT_HUB.href },
  openGraph: {
    title: `${STUDENT_HUB.label} | ${site.name}`,
    description: `수강생에게만 열리는 ${featureNames}.`,
    url: STUDENT_HUB.href,
    images: [{ url: "/og.png", width: 1200, height: 630, alt: site.name }],
  },
};

const UNLOCK_STEPS: { icon: IconName; title: string; desc: string }[] = [
  { icon: "profile", title: "회원가입", desc: "실명으로 가입해요. 수강증의 이름과 같아야 해요." },
  { icon: "location", title: "YBM에서 수강 신청", desc: "수강 신청과 결제는 YBM어학원 공식 사이트에서 해요." },
  { icon: "upload", title: "수강증 올리기", desc: "등업신청에 수강증 사진이나 PDF를 올려요." },
  { icon: "success", title: "수강생전용 열림", desc: "확인이 끝나면 개강일부터 모든 기능이 열려요." },
];

function StatusBanner({ access }: { access: StudentAccess }) {
  const state = unlockState(access);
  if (state === "open") {
    return (
      <div className="flex items-center gap-3 rounded-xl2 border border-brand-200 bg-brand-50 p-4">
        <Icon name="success" size={30} />
        <p className="text-sm font-bold text-ink sm:text-base">지금 모든 수강생전용 기능을 이용할 수 있어요.</p>
      </div>
    );
  }

  const text =
    state === "preliminary"
      ? `예비등록생이에요. ${formatDate(access.opensOn!, { month: "long", day: "numeric" })} 개강일부터 모든 기능이 열리고, 스터디는 지금 신청할 수 있어요.`
      : state === "alumni"
        ? "지난 수강 기간이 끝났어요. 다시 등록하고 수강증을 올리면 바로 열려요."
        : state === "member"
          ? "아직 등업 전이에요. YBM에서 받은 수강증을 올리면 바로 열려요."
          : "아래 기능은 역전토익 수강생만 이용할 수 있어요. 가입하고 수강증을 올리면 열려요.";

  return (
    <div className="flex flex-col gap-4 rounded-xl2 border border-line bg-paper p-4 shadow-soft sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <Icon name="lock" size={30} className="mt-0.5" />
        <p className="text-sm font-semibold leading-relaxed text-ink sm:text-base">{text}</p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <UnlockActions access={access} />
      </div>
    </div>
  );
}

export default async function StudentHubPage({ searchParams }: { searchParams: Promise<{ feature?: string }> }) {
  const [access, sp] = await Promise.all([getStudentAccess(), searchParams]);
  const locked = !access.active;
  // 메뉴에서 잠긴 기능을 눌러 왔으면 그 카드를 강조한다
  const highlight = STUDENT_FEATURES.some((f) => f.key === sp.feature) ? sp.feature : null;

  return (
    <section className="relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-40 -top-24 h-[26rem] w-[26rem] rounded-full bg-brand-100 blur-3xl animate-blob" />
        <div className="absolute -right-32 top-40 h-[22rem] w-[22rem] rounded-full bg-brand-200/60 blur-3xl animate-blob" style={{ animationDelay: "-6s" }} />
      </div>

      <div className="container-x py-10 sm:py-14">
        {/* 제목 오른쪽에서 환영하는 강사. 사진 아래는 상태 배너 위에서 흐려진다 */}
        <div className="flex items-end justify-between gap-3">
          <header className="max-w-2xl">
            <p className="chip animate-fade-up">
              <Icon name={STUDENT_HUB.icon} size={18} />
              {STUDENT_HUB.label}
            </p>
            <h1 className="mt-4 animate-fade-up text-3xl font-black leading-tight tracking-tight text-ink sm:text-5xl" style={{ animationDelay: "80ms" }}>
              수강생만 누리는
              <br />
              <span className="text-gradient-brand">{STUDENT_FEATURES.length}가지 학습 공간</span>
            </h1>
            <p className="mt-4 animate-fade-up leading-relaxed text-slate sm:text-lg" style={{ animationDelay: "160ms" }}>
              수업이 끝나도 점수는 계속 올라가야 하니까. 역전토익 수강생에게만 열리는 기능을 한곳에 모았어요.
            </p>
          </header>
          <InstructorCameo
            name="이영수"
            pose="tablet"
            sizes="(min-width: 1024px) 240px, 110px"
            className="-mb-8 h-40 shrink-0 animate-fade-up sm:h-56 lg:mr-8 lg:h-80"
          />
        </div>

        <div className="mt-8 animate-fade-up" style={{ animationDelay: "220ms" }}>
          <StatusBanner access={access} />
        </div>

        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {STUDENT_FEATURES.map((f, i) => {
            const focused = highlight === f.key;
            return (
              <li
                key={f.key}
                id={f.key}
                aria-current={focused ? "true" : undefined}
                className={cn("scroll-mt-24 rounded-xl2 target:ring-4 target:ring-brand-300", focused && "ring-4 ring-brand-300")}
              >
                {/* 강조된 카드는 스크롤로 도착하자마자 보이도록 등장 지연을 없앤다 */}
                <Reveal delay={focused ? 0 : i * 70} className="h-full">
                  <FeatureCard feature={f} access={access} />
                </Reveal>
              </li>
            );
          })}
        </ul>

        {locked && (
          <section aria-labelledby="unlock-title" className="mt-16">
            <Reveal>
              <h2 id="unlock-title" className="text-2xl font-black tracking-tight text-ink sm:text-3xl">
                수강생이 되는 방법
              </h2>
              <p className="mt-2 text-slate">결제는 YBM 공식 사이트에서, 등업은 이 사이트에서 수강증 한 장이면 끝나요.</p>
            </Reveal>
            <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {UNLOCK_STEPS.map((s, i) => (
                <Reveal key={s.title} as="li" delay={i * 90} className="card p-5">
                  <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-50">
                      <Icon name={s.icon} size={28} />
                    </span>
                    <span className="text-xs font-black text-brand-600">STEP {i + 1}</span>
                  </div>
                  <h3 className="mt-3 text-lg font-black text-ink">{s.title}</h3>
                  <p className="mt-1 text-sm text-slate">{s.desc}</p>
                </Reveal>
              ))}
            </ol>
            <div className="mt-6 flex flex-wrap gap-2">
              <UnlockActions access={access} />
              <a href={site.academy.ybmUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost">
                YBM 공식 사이트 바로가기
              </a>
            </div>
          </section>
        )}

        {!locked && (
          <p className="mt-10 text-center text-sm text-slate">
            등록 현황과 시간표는{" "}
            <Link href="/my" className="font-bold text-brand-600 hover:underline">
              마이페이지
            </Link>
            에서 확인할 수 있어요.
          </p>
        )}
      </div>
    </section>
  );
}
