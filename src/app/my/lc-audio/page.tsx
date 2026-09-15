import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Reveal } from "@/components/ui/Reveal";
import { Icon } from "@/components/ui/Icon";
import { getSessionProfile, isStaff } from "@/lib/auth";
import { cn, todayKST } from "@/lib/utils";
import { pickLevel, sortTracks } from "@/lib/lc-audio";
import { getMyLcAudio, getMyOrders, getMyStudyEligibility } from "../_lib/queries";

export const metadata: Metadata = {
  title: "LC 음원듣기",
  robots: { index: false },
};

export default async function LcAudioPage({ searchParams }: { searchParams: Promise<{ level?: string }> }) {
  const [sp, { profile }, { levels, tracks, images }, orders] = await Promise.all([searchParams, getSessionProfile(), getMyLcAudio(), getMyOrders()]);
  const header = <PageHeader icon="headphones" title="LC 음원듣기" description="내 교재 레벨을 골라 LC 음원을 들어요. 교재 사진을 보고 찾으면 쉬워요." />;

  const { accessTerms } = await getMyStudyEligibility(orders);
  if (accessTerms.size === 0 && !isStaff(profile?.role)) {
    return (
      <div className="space-y-8">
        {header}
        <EmptyState icon="headphones" title="수강 중인 수강생만 들을 수 있어요" description="등업신청이 승인되고 개강일이 되면 LC 음원이 열려요." action={{ href: "/my/verify", label: "등업신청 확인하기" }} />
      </div>
    );
  }

  // 기본 레벨: 지금 듣는 강좌의 목표 점수 → 음원이 있는 첫 레벨 → 첫 레벨
  const today = todayKST();
  const myScores = orders
    .filter((o) => o.status === "active")
    .flatMap((o) => o.enrollments)
    .filter((e) => e.status === "active" && e.section && today <= e.section.closes_at)
    .map((e) => e.section!.course?.target_score)
    .filter((s): s is number => typeof s === "number");
  const preferred = myScores.find((s) => levels.includes(s)) ?? levels.find((l) => tracks.some((t) => t.level === l)) ?? null;
  const level = pickLevel(sp.level, levels, preferred);

  if (level === null) {
    return (
      <div className="space-y-8">
        {header}
        <EmptyState icon="headphones" title="아직 올라온 음원이 없어요" description="강사가 음원을 올리면 여기에서 바로 들을 수 있어요." />
      </div>
    );
  }

  const levelTracks = sortTracks(tracks.filter((t) => t.level === level));
  const levelImages = images.filter((i) => i.level === level);

  return (
    <div className="space-y-8">
      {header}

      {/* 레벨 고르기: 교재 표지로 알아보기 */}
      <nav aria-label="레벨 선택">
        <ul className="grid grid-cols-3 gap-3 sm:gap-4">
          {levels.map((l) => {
            const cover = images.find((i) => i.level === l);
            const count = tracks.filter((t) => t.level === l).length;
            const active = l === level;
            return (
              <li key={l}>
                <Link
                  href={`/my/lc-audio?level=${l}`}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "card flex h-full flex-col items-center gap-2 p-2.5 text-center transition sm:flex-row sm:gap-4 sm:p-4 sm:text-left",
                    active ? "border-brand-400 ring-2 ring-brand-300" : "hover:-translate-y-0.5 hover:border-brand-300",
                  )}
                >
                  <span className="flex aspect-[3/4] w-full max-w-[5.5rem] shrink-0 items-center justify-center overflow-hidden rounded-lg bg-brand-50 sm:w-20">
                    {cover ? (
                      // 비공개 서명 URL 로 리다이렉트되는 이미지라 next/image 최적화를 쓰지 않는다
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/files/textbook/${cover.id}?w=240`} alt={`${l} 교재 표지`} className="h-full w-full object-cover" />
                    ) : (
                      <Icon name="textbook" size={32} />
                    )}
                  </span>
                  <span>
                    <span className={cn("block text-2xl font-black tabular-nums sm:text-3xl", active ? "text-brand-600" : "text-ink")}>{l}</span>
                    <span className="block text-xs font-semibold text-slate">음원 {count}개</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <Reveal key={level}>
        <section aria-labelledby="level-title" className="card overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-line bg-brand-50/60 px-5 py-3">
            <Icon name="headphones" size={22} />
            <h2 id="level-title" className="font-black text-ink">
              {level} 교재 음원
            </h2>
            <span className="text-sm font-semibold text-slate">· {levelTracks.length}개</span>
          </div>

          {levelImages.length > 0 && (
            <ul className="grid grid-cols-2 gap-3 border-b border-line p-5 sm:grid-cols-4">
              {levelImages.map((img) => (
                <li key={img.id}>
                  <a href={`/files/textbook/${img.id}`} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-xl border border-line bg-surface" title="크게 보기">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/files/textbook/${img.id}?w=480`} alt={`${level} 교재 이미지`} loading="lazy" className="aspect-[3/4] w-full object-cover" />
                  </a>
                </li>
              ))}
            </ul>
          )}

          {levelTracks.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-slate">{level} 음원이 아직 없어요. 강사가 올리면 여기에서 바로 들을 수 있어요.</p>
          ) : (
            <ul className="divide-y divide-line">
              {levelTracks.map((t) => (
                <li key={t.id} className="grid gap-3 px-5 py-4 md:grid-cols-[16rem_1fr] md:items-center">
                  <p className="min-w-0 font-bold text-ink">{t.title}</p>
                  <audio controls preload="none" src={`/files/audio/${t.id}`} className="w-full">
                    브라우저가 음원 재생을 지원하지 않아요.
                  </audio>
                </li>
              ))}
            </ul>
          )}
        </section>
      </Reveal>

      <p className="text-xs text-mist">음원과 교재 이미지는 수강생 본인만 이용할 수 있습니다. 파일을 외부에 공유하지 마세요.</p>
    </div>
  );
}
