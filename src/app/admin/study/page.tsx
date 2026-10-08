import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDate, todayKST, cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { FilterTabs } from "@/components/admin/FilterTabs";
import { TermChips } from "@/components/admin/TermChips";
import { TableWrap, Th, Td } from "@/components/admin/Table";
import { CancelSignupButton } from "@/components/admin/studies/CancelSignupButton";
import { isSlotKind, slotTime, sortSlots, STUDY_KIND_LABEL, STUDY_STATUS_LABEL, termParam } from "@/lib/study";
import { pickTerm, termLabel, type TermLite } from "../_lib/queries";
import { getProfileNames } from "../_lib/profile-names";
import { isStaff, requireCrew } from "@/lib/auth";

export const metadata: Metadata = { title: "스터디 신청자", robots: { index: false } };

const KIND_ORDER = ["offline", "vocab", "online"] as const;

export default async function StudyRosterPage({ searchParams }: { searchParams: Promise<{ term?: string; kind?: string }> }) {
  // 조교가 운영한다 (2026-10-03 Alan "스터디를 조교가 운영한다") — 신청자 명단 · 신청 취소.
  // 비대면 인증 현황 · 독촉 알림은 2026-10-08 부터 '비대면스터디 인증'(/admin/study-checkins — 조교도 쓴다)에 있다
  // 시간대 설정(/admin/study/plan)은 강사 · 관리자 화면이라 조교에게는 그리로 가는 버튼을 그리지 않는다
  const { profile } = await requireCrew();
  const staff = isStaff(profile.role);
  const sp = await searchParams;
  const supabase = await createClient();
  const today = todayKST();

  // 스터디가 있는 기수만 고른다
  const { data: allStudies } = await supabase.from("studies").select("id, term_id, kind, term:terms(id, year, month, enrollment_opens_at, closes_at)");
  const termMap = new Map<number, TermLite>();
  for (const s of allStudies ?? []) if (s.term) termMap.set(s.term.id, s.term);
  const terms = [...termMap.values()].sort((a, b) => b.year * 12 + b.month - (a.year * 12 + a.month));
  const term = pickTerm(terms, sp.term, today);

  if (!term) {
    return (
      <>
        <PageHeader icon="study" title="스터디 신청자" description="대면·단어 스터디는 시간대별로, 비대면 스터디는 신청자 명단을 보여 드려요. 비대면 인증은 '비대면스터디 인증' 화면에서 봐요." />
        <EmptyState
          icon="study"
          title="아직 만든 스터디가 없어요"
          description={staff ? "스터디 시간 설정에서 그 달 스터디를 열고 시간대를 정하면, 수강생 신청이 여기에 모입니다." : "강사님이 그 달 스터디를 열고 시간대를 정하면, 수강생 신청이 여기에 모입니다."}
          action={staff ? { href: "/admin/study/plan", label: "스터디 시간 설정으로" } : undefined}
        />
      </>
    );
  }

  const termKey = termParam(term.year, term.month);
  const { data: studies } = await supabase
    .from("studies")
    .select("id, kind, status, notice, study_slots!study_slots_study_id_fkey(id, start_time, end_time, capacity, applied_count), study_signups!study_signups_study_id_fkey(count)")
    .eq("term_id", term.id);

  const byKind = new Map((studies ?? []).map((s) => [s.kind, s]));
  const kinds = KIND_ORDER.filter((k) => byKind.has(k));
  const kind = kinds.includes(sp.kind as (typeof KIND_ORDER)[number]) ? (sp.kind as string) : kinds[0];
  const study = byKind.get(kind)!;

  const { data: signups } = await supabase
    .from("study_signups")
    // 연락처는 읽지 않는다 (2026-09-23 Alan — 스터디 신청자 화면에는 전화번호가 필요 없다)
    .select("id, slot_id, user_id, created_at")
    .eq("study_id", study.id)
    .order("created_at");
  // 이름은 이름 · 등급만 주는 함수로 — 조교는 profiles 를 못 읽는다 (2026-10-03, `profile-names.ts`)
  const names = await getProfileNames(supabase, (signups ?? []).map((r) => r.user_id));

  const rows = (signups ?? []).map((r) => ({ ...r, user: { id: r.user_id, name: names.get(r.user_id)?.name ?? "" } }));
  const slots = sortSlots(study.study_slots ?? []);

  return (
    <>
      <PageHeader icon="study" title="스터디 신청자" description="대면·단어 스터디는 시간대별로, 비대면 스터디는 신청자 명단을 보여 드려요. 비대면 인증은 '비대면스터디 인증' 화면에서 봐요.">
        {/* 시간대는 전용 화면에서 (2026-09-18 Alan — 반 편성으로 보내면 한참 스크롤해야 했다). 강사 · 관리자만 */}
        {staff && (
          <Link href={`/admin/study/plan?term=${termKey}`} className="btn-secondary">
            <Icon name="timeslot" size={18} />
            시간대 설정
          </Link>
        )}
      </PageHeader>

      <TermChips basePath="/admin/study" terms={terms} current={termKey} />
      <FilterTabs
        basePath="/admin/study"
        paramKey="kind"
        current={kind}
        keep={{ term: termKey }}
        tabs={kinds.map((k) => ({ value: k, label: STUDY_KIND_LABEL[k], count: byKind.get(k)?.study_signups?.[0]?.count ?? 0 }))}
      />

      <p className="mb-4 flex flex-wrap items-center gap-2 text-sm text-slate">
        <span className="font-black text-ink">{termLabel(term)} {STUDY_KIND_LABEL[kind]}</span>
        <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-bold", study.status === "open" ? "bg-brand-500 text-white" : study.status === "closed" ? "bg-ink text-white" : "bg-line text-slate")}>
          {STUDY_STATUS_LABEL[study.status] ?? study.status}
        </span>
        {study.notice && <span className="text-xs">· {study.notice}</span>}
      </p>

      {isSlotKind(kind) ? (
        slots.length === 0 ? (
          <EmptyState
            icon="timeslot"
            title="시간대가 아직 없어요"
            description={staff ? "시간대를 추가하면 수강생이 골라 신청할 수 있어요." : "강사님이 시간대를 추가하면 수강생이 골라 신청할 수 있어요."}
            action={staff ? { href: `/admin/study/plan?term=${termKey}`, label: "시간대 추가하기" } : undefined}
          />
        ) : (
          <div className="space-y-5">
            {slots.map((slot, i) => {
              const list = rows.filter((r) => r.slot_id === slot.id);
              return (
                <section key={slot.id} aria-labelledby={`slot-${slot.id}`} className="card overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-brand-50/60 px-5 py-3">
                    <h2 id={`slot-${slot.id}`} className="font-black text-ink">
                      <span className="text-brand-600">{i + 1}타임</span> {slotTime(slot)}
                    </h2>
                    <p className="text-sm font-bold tabular-nums text-ink">
                      신청 {slot.applied_count}명{slot.capacity !== null && <span className="text-slate"> / 정원 {slot.capacity}명</span>}
                    </p>
                  </div>
                  {list.length === 0 ? (
                    <p className="px-5 py-6 text-center text-sm text-slate">아직 신청한 수강생이 없어요.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[32rem] text-left text-sm">
                        <thead>
                          <tr>
                            <Th className="w-12">#</Th>
                            <Th>이름</Th>
                            <Th>신청일</Th>
                            <Th className="text-right">관리</Th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-line">
                          {list.map((r, n) => (
                            <tr key={r.id} className="hover:bg-brand-50/40">
                              <Td className="text-xs text-mist">{n + 1}</Td>
                              <Td className="font-bold">{r.user.name || "-"}</Td>
                              <Td className="whitespace-nowrap text-xs text-slate">{formatDate(r.created_at, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</Td>
                              <Td className="text-right"><CancelSignupButton id={r.id} name={r.user.name || "수강생"} /></Td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )
      ) : rows.length === 0 ? (
        <EmptyState icon="online" title="아직 신청한 수강생이 없어요" description="신청 받기 상태로 바꾸면 수강생이 스터디 페이지에서 신청할 수 있어요." />
      ) : (
        <div className="space-y-6">
        {/* 날짜별 인증 현황 · 미인증 독촉은 '비대면스터디 인증' 화면으로 옮겼다 (2026-10-08 Alan — "비대면스터디 인증 카테고리 하나 만들어줘. 별도의 페이지") */}
        <Link
          href={`/admin/study-checkins?term=${termKey}`}
          className="card flex items-center gap-3 p-4 transition hover:border-brand-300 hover:bg-brand-50/40"
        >
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl2 bg-brand-50">
            <Icon name="camera" size={26} />
          </span>
          <span className="min-w-0 flex-1">
            <b className="block text-[15px] font-black text-ink">비대면스터디 인증 보기</b>
            <span className="block text-xs text-slate">학생이 올린 풀이 사진 확인 · 날짜별 인증 현황 · 미인증 학생 알림은 여기서 해요</span>
          </span>
          <svg viewBox="0 0 24 24" aria-hidden className="size-4 shrink-0 fill-none stroke-mist stroke-[2.5]">
            <path d="m9 5 7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
        <section>
        <h2 className="mb-2 text-base font-black text-ink">신청자</h2>
        <TableWrap>
          <thead>
            <tr>
              <Th className="w-12">#</Th>
              <Th>이름</Th>
              <Th>신청일</Th>
              <Th className="text-right">관리</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r, n) => {
              return (
                <tr key={r.id} className="hover:bg-brand-50/40">
                  <Td className="text-xs text-mist">{n + 1}</Td>
                  <Td className="font-bold">{r.user.name || "-"}</Td>
                  <Td className="whitespace-nowrap text-xs text-slate">{formatDate(r.created_at, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</Td>
                  <Td className="text-right"><CancelSignupButton id={r.id} name={r.user.name || "수강생"} /></Td>
                </tr>
              );
            })}
          </tbody>
        </TableWrap>
        </section>
        </div>
      )}
    </>
  );
}
