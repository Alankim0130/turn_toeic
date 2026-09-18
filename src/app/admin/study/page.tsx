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
import { CheckinRoster } from "@/components/admin/studies/CheckinRoster";
import { isSlotKind, slotTime, sortSlots, STUDY_KIND_LABEL, STUDY_STATUS_LABEL, termParam } from "@/lib/study";
import { pickTerm, termLabel } from "../_lib/queries";
import { requireCrew } from "@/lib/auth";

export const metadata: Metadata = { title: "스터디 신청자", robots: { index: false } };

const KIND_ORDER = ["offline", "vocab", "online"] as const;

export default async function StudyRosterPage({ searchParams }: { searchParams: Promise<{ term?: string; kind?: string }> }) {
  // 조교는 이 화면을 쓸 수 없다 — 레이아웃이 조교를 통과시키므로 화면마다 막는다
  await requireCrew();
  const sp = await searchParams;
  const supabase = await createClient();
  const today = todayKST();

  // 스터디가 있는 기수만 고른다
  const { data: allStudies } = await supabase.from("studies").select("id, term_id, kind, term:terms(id, year, month)");
  const termMap = new Map<number, { id: number; year: number; month: number }>();
  for (const s of allStudies ?? []) if (s.term) termMap.set(s.term.id, s.term);
  const terms = [...termMap.values()].sort((a, b) => b.year * 12 + b.month - (a.year * 12 + a.month));
  const term = pickTerm(terms, sp.term, today);

  if (!term) {
    return (
      <>
        <PageHeader icon="study" title="스터디 신청자" description="대면·단어 스터디는 시간대별로, 비대면 스터디는 숙제 제출 현황과 함께 보여 드려요." />
        <EmptyState
          icon="study"
          title="아직 만든 스터디가 없어요"
          description="스터디 시간 설정에서 그 달 스터디를 열고 시간대를 정하면, 수강생 신청이 여기에 모입니다."
          action={{ href: "/admin/study/plan", label: "스터디 시간 설정으로" }}
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
    .select("id, slot_id, created_at, user:profiles!study_signups_user_id_fkey(id, name, phone)")
    .eq("study_id", study.id)
    .order("created_at");

  const rows = signups ?? [];
  const slots = sortSlots(study.study_slots ?? []);

  // 비대면: 자료(날짜)마다 누가 인증했는지 (2026-09-18 Alan — 미인증 학생에게 알림)
  const [{ data: materialRows }, { data: checkinRows }] =
    kind === "online"
      ? await Promise.all([
          supabase.from("study_materials").select("id, date, title").eq("study_id", study.id).order("date", { ascending: false }),
          supabase.from("study_checkins").select("material_id, user_id, created_at, study_checkin_files(count)"),
        ])
      : [{ data: [] as never[] }, { data: [] as never[] }];
  const materialIds = new Set((materialRows ?? []).map((m) => m.id));
  const rosterCheckins = (checkinRows ?? [])
    .filter((c) => materialIds.has(c.material_id))
    .map((c) => ({ material_id: c.material_id, user_id: c.user_id, created_at: c.created_at, files: c.study_checkin_files?.[0]?.count ?? 0 }));
  const rosterStudents = rows.filter((r) => r.user).map((r) => ({ id: r.user!.id, name: r.user!.name, phone: r.user!.phone }));

  return (
    <>
      <PageHeader icon="study" title="스터디 신청자" description="대면·단어 스터디는 시간대별로, 비대면 스터디는 숙제 제출 현황과 함께 보여 드려요.">
        {/* 시간대는 전용 화면에서 (2026-09-18 Alan — 반 편성으로 보내면 한참 스크롤해야 했다) */}
        <Link href={`/admin/study/plan?term=${termKey}`} className="btn-secondary">
          <Icon name="timeslot" size={18} />
          시간대 설정
        </Link>
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
          <EmptyState icon="timeslot" title="시간대가 아직 없어요" description="시간대를 추가하면 수강생이 골라 신청할 수 있어요." action={{ href: `/admin/study/plan?term=${termKey}`, label: "시간대 추가하기" }} />
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
                            <Th>연락처</Th>
                            <Th>신청일</Th>
                            <Th className="text-right">관리</Th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-line">
                          {list.map((r, n) => (
                            <tr key={r.id} className="hover:bg-brand-50/40">
                              <Td className="text-xs text-mist">{n + 1}</Td>
                              <Td className="font-bold">{r.user?.name || "-"}</Td>
                              <Td>{r.user?.phone ? <a href={`tel:${r.user.phone}`} className="text-brand-600 hover:underline">{r.user.phone}</a> : "-"}</Td>
                              <Td className="whitespace-nowrap text-xs text-slate">{formatDate(r.created_at, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</Td>
                              <Td className="text-right"><CancelSignupButton id={r.id} name={r.user?.name ?? "수강생"} /></Td>
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
        <section>
          <h2 className="mb-2 text-base font-black text-ink">날짜별 인증 현황 <span className="text-sm font-semibold text-slate">— 자료를 풀고 인증하지 않은 학생에게 알림을 보낼 수 있어요</span></h2>
          <CheckinRoster students={rosterStudents} materials={materialRows ?? []} checkins={rosterCheckins} />
        </section>
        <section>
        <h2 className="mb-2 text-base font-black text-ink">신청자</h2>
        <TableWrap>
          <thead>
            <tr>
              <Th className="w-12">#</Th>
              <Th>이름</Th>
              <Th>연락처</Th>
              <Th>신청일</Th>
              <Th className="text-right">관리</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r, n) => {
              return (
                <tr key={r.id} className="hover:bg-brand-50/40">
                  <Td className="text-xs text-mist">{n + 1}</Td>
                  <Td className="font-bold">{r.user?.name || "-"}</Td>
                  <Td>{r.user?.phone ? <a href={`tel:${r.user.phone}`} className="text-brand-600 hover:underline">{r.user.phone}</a> : "-"}</Td>
                  <Td className="whitespace-nowrap text-xs text-slate">{formatDate(r.created_at, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</Td>
                  <Td className="text-right"><CancelSignupButton id={r.id} name={r.user?.name ?? "수강생"} /></Td>
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
