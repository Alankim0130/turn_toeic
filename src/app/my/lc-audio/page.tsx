import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Reveal } from "@/components/ui/Reveal";
import { Icon } from "@/components/ui/Icon";
import { formatDate } from "@/lib/utils";
import { termIndex } from "@/lib/study";
import { getMyAudioTracks, getMyOrders, getMyStudyEligibility, termLabel, type MyAudioTrack } from "../_lib/queries";

export const metadata: Metadata = {
  title: "LC 음원듣기",
  robots: { index: false },
};

export default async function LcAudioPage() {
  const [tracks, orders] = await Promise.all([getMyAudioTracks(), getMyOrders()]);
  const header = <PageHeader icon="headphones" title="LC 음원듣기" description="수업과 스터디에 쓰는 LC 음원을 언제든 들을 수 있어요." />;

  if (tracks.length === 0) {
    const { accessTerms } = await getMyStudyEligibility(orders);
    return (
      <div className="space-y-8">
        {header}
        {accessTerms.size === 0 ? (
          <EmptyState icon="headphones" title="수강 중인 수강생만 들을 수 있어요" description="등업신청이 승인되고 개강일이 되면 LC 음원이 열려요." action={{ href: "/my/verify", label: "등업신청 확인하기" }} />
        ) : (
          <EmptyState icon="headphones" title="아직 올라온 음원이 없어요" description="강사가 음원을 올리면 여기에서 바로 들을 수 있어요." />
        )}
      </div>
    );
  }

  // 상시 음원 먼저, 그다음 최근 달부터
  const groups = new Map<string, { label: string; order: number; list: MyAudioTrack[] }>();
  for (const t of tracks) {
    const key = t.term_id ? `t${t.term_id}` : "always";
    const g = groups.get(key) ?? {
      label: t.term ? `${termLabel(t.term)} 음원` : "상시 음원",
      order: t.term ? -termIndex(t.term) : -Infinity,
      list: [],
    };
    g.list.push(t);
    groups.set(key, g);
  }
  const sortedGroups = [...groups.values()].sort((a, b) => a.order - b.order);

  return (
    <div className="space-y-8">
      {header}
      {sortedGroups.map((g, gi) => (
        <Reveal key={g.label} delay={gi * 80}>
          <section aria-label={g.label} className="card overflow-hidden">
            <div className="flex items-center gap-2 border-b border-line bg-brand-50/60 px-5 py-3">
              <Icon name="headphones" size={22} />
              <h2 className="font-black text-ink">{g.label}</h2>
              <span className="text-sm font-semibold text-slate">· {g.list.length}개</span>
            </div>
            <ul className="divide-y divide-line">
              {g.list.map((t) => (
                <li key={t.id} className="grid gap-3 px-5 py-4 md:grid-cols-[16rem_1fr] md:items-center">
                  <div className="min-w-0">
                    <p className="font-bold text-ink">{t.title}</p>
                    {t.date && <p className="text-xs text-slate">{formatDate(t.date)}</p>}
                  </div>
                  <audio controls preload="none" src={`/files/audio/${t.id}`} className="w-full">
                    브라우저가 음원 재생을 지원하지 않아요.
                  </audio>
                </li>
              ))}
            </ul>
          </section>
        </Reveal>
      ))}
      <p className="text-xs text-mist">음원은 수강생 본인만 들을 수 있습니다. 파일을 외부에 공유하지 마세요.</p>
    </div>
  );
}
