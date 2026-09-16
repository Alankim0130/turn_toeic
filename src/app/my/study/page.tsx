import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Reveal } from "@/components/ui/Reveal";
import { Alert } from "@/components/ui/Alert";
import { Icon } from "@/components/ui/Icon";
import { cn, formatDate, todayKST } from "@/lib/utils";
import { formatBytes, isSlotKind, slotTime, STUDY_KIND_ICON, STUDY_KIND_LABEL, STUDY_STATUS_LABEL, termIndex } from "@/lib/study";
import { getMyOrders, getMyStudyEligibility, getMyStudyMaterials, getMyStudySignups, termLabel } from "../_lib/queries";

export const metadata: Metadata = {
  title: "내 스터디",
  robots: { index: false },
};

export default async function MyStudyPage() {
  const [orders, signups, materials] = await Promise.all([getMyOrders(), getMyStudySignups(), getMyStudyMaterials()]);
  const { accessTerms, opensOn } = await getMyStudyEligibility(orders);
  const today = todayKST();

  const header = (
    <PageHeader icon="study" title="내 스터디" description="신청한 스터디와 비대면스터디 자료를 한곳에서 확인하세요.">
      <Link href="/study" className="btn-secondary">
        <Icon name="timeslot" size={18} />
        신청·변경
      </Link>
    </PageHeader>
  );

  if (signups.length === 0) {
    return (
      <div className="space-y-8">
        {header}
        <EmptyState
          icon="study"
          title="아직 신청한 스터디가 없어요"
          description="대면·비대면·단어 스터디 중 원하는 스터디를 골라 신청해 보세요. 그 달 수강생이면 개강 전에도 신청할 수 있어요."
          action={{ href: "/study", label: "스터디 신청하러 가기" }}
        />
      </div>
    );
  }

  const sorted = [...signups].sort((a, b) => termIndex(b.study!.term ?? { year: 0, month: 0 }) - termIndex(a.study!.term ?? { year: 0, month: 0 }));
  const onlineSignups = sorted.filter((s) => s.study!.kind === "online");

  return (
    <div className="space-y-8">
      {header}

      {/* 신청 현황 */}
      <section aria-labelledby="my-signups-title">
        <h2 id="my-signups-title" className="mb-3 text-lg font-black text-ink">신청한 스터디</h2>
        <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {sorted.map((s, i) => {
            const study = s.study!;
            return (
              <Reveal key={s.id} delay={i * 60} as="li">
                <article className="card flex h-full flex-col p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-50">
                        <Icon name={STUDY_KIND_ICON[study.kind]} size={28} />
                      </span>
                      <div>
                        <p className="text-xs font-bold text-slate">{termLabel(study.term)}</p>
                        <h3 className="font-black text-ink">{STUDY_KIND_LABEL[study.kind]}</h3>
                      </div>
                    </div>
                    <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold", study.status === "open" ? "bg-brand-100 text-brand-700" : "bg-line text-slate")}>
                      {STUDY_STATUS_LABEL[study.status] ?? study.status}
                    </span>
                  </div>
                  {isSlotKind(study.kind) && s.slot && (
                    <p className="mt-3 flex items-center gap-2 text-lg font-black tabular-nums text-brand-600">
                      <Icon name="timeslot" size={22} />
                      {slotTime(s.slot)}
                    </p>
                  )}
                  {study.kind === "online" && <p className="mt-3 text-sm font-semibold text-ink">수업일마다 그날 자료가 열려요</p>}
                  {study.notice && <p className="mt-2 whitespace-pre-wrap text-sm text-slate">{study.notice}</p>}
                </article>
              </Reveal>
            );
          })}
        </ul>
      </section>

      {/* 비대면 자료 */}
      {onlineSignups.map((s) => {
        const study = s.study!;
        const list = materials.filter((m) => m.study_id === study.id);
        const waitingFrom = opensOn.get(study.term_id);
        return (
          <section key={s.id} aria-labelledby={`materials-${study.id}`} className="card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-brand-50/60 px-5 py-3">
              <h2 id={`materials-${study.id}`} className="flex items-center gap-2 font-black text-ink">
                <Icon name="online" size={24} />
                {termLabel(study.term)} 비대면스터디 자료
              </h2>
              <Link href="/my/homework" className="text-sm font-bold text-brand-600 hover:underline">
                풀이는 숙제업로드에 →
              </Link>
            </div>

            {!accessTerms.has(study.term_id) ? (
              <div className="p-5">
                <Alert kind="info" title={waitingFrom ? `개강일 ${formatDate(waitingFrom, { month: "long", day: "numeric" })}부터 자료가 열려요` : "지금은 자료를 받을 수 없어요"}>
                  {waitingFrom ? "예비등록생은 개강일에 수강생으로 바뀌면 자료를 받을 수 있어요." : "수강 기간(종강일)이 지났거나 수강 정보가 바뀌었어요. 궁금하면 강사에게 문의해 주세요."}
                </Alert>
              </div>
            ) : list.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-slate">아직 열린 자료가 없어요. 수업일마다 그날 자료가 열립니다.</p>
            ) : (
              <ul className="divide-y divide-line">
                {list.map((m) => {
                  const isToday = m.date === today;
                  return (
                    <li key={m.id} className={cn("flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center", isToday && "bg-brand-50/50")}>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-ink">
                          {formatDate(m.date)}
                          {isToday && <span className="ml-2 rounded-full bg-brand-500 px-2 py-0.5 text-[11px] font-black text-white">오늘</span>}
                        </p>
                        <p className="truncate text-sm text-slate">
                          {m.title ? `${m.title} · ` : ""}
                          {m.file_name} · {formatBytes(m.file_size)}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <a href={`/files/material/${m.id}?download=1`} className="btn-primary !px-4 !py-2 text-sm">
                          <Icon name="download" size={18} className="brightness-0 invert" />
                          자료 받기
                        </a>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
