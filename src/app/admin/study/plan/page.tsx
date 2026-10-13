import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/auth";
import { todayKST } from "@/lib/utils";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { TermChips } from "@/components/admin/TermChips";
import { StudyPlanner, type CopySource, type PlannerStudy } from "@/components/admin/studies/StudyPlanner";
import { copyStudyMessage, pickCopySource, termParam } from "@/lib/study";
import { pickTerm, termLabel } from "../../_lib/queries";

export const metadata: Metadata = { title: "스터디 시간 설정", robots: { index: false } };

/**
 * 스터디 시간 설정 — 전용 화면 (2026-09-18 Alan 요청).
 *
 * 그전에는 반 편성(`/admin/sections`) 맨 아래에만 있어서, 스터디 신청자 명단에서 "시간대 추가하기" 를 누르면
 * 반 편성으로 가서 달력·반 목록을 지나 한참 스크롤해야 했다. 여기서는 그것만 한다.
 * 반 편성 화면의 같은 영역(`StudyPlanner`)은 그대로 두었다 — 편성하면서 바로 여는 흐름도 쓰이기 때문이다.
 *
 * 조교는 못 쓴다 — 시간대 · 레벨은 강사 · 관리자가 정한다 (등급 체계).
 */
export default async function StudyPlanPage({ searchParams }: { searchParams: Promise<{ term?: string; copied?: string; n?: string }> }) {
  await requireStaff();
  const sp = await searchParams;
  const supabase = await createClient();
  const today = todayKST();

  // 스터디는 기수에 붙는다 — 달력을 저장한 기수만 고를 수 있다 (최근 달부터)
  const { data: termRows } = await supabase
    .from("terms")
    .select("id, year, month, enrollment_opens_at, closes_at")
    .not("enrollment_opens_at", "is", null)
    .order("year", { ascending: false })
    .order("month", { ascending: false });
  const terms = termRows ?? [];
  // 메뉴에서 바로 들어오면 **달력의 이번 달**을 연다 (2026-10-02 Alan — "기본설정이 9월로 되어 있는데, 해당 달로 설정되도록").
  // 날짜로 고르면(pickTerm) 9월 반이 10/3 까지 열려 있어 10월 초에도 9월이 잡힌다 — 스터디 시간은 그 달을 미리 짜는 일이라 달력 달이 맞다.
  // 이번 달 기수가 아직 없으면 예전처럼 날짜로 고른다 (?term= 을 들고 오면 그 달)
  const [cy, cm] = today.split("-").map(Number);
  const thisMonth = terms.find((t) => t.year === cy && t.month === cm) ?? null;
  const term = sp.term ? pickTerm(terms, sp.term, today) : (thisMonth ?? pickTerm(terms, undefined, today));

  const header = (
    <PageHeader icon="study" title="스터디 시간 설정" description="단어 스터디의 시간대(레벨 1 · 2)를 만들고, 비대면 스터디를 열어요. 신청은 수강생이 스터디 신청하기에서 합니다." />
  );

  if (!term) {
    return (
      <>
        {header}
        <EmptyState
          icon="calendar"
          title="아직 편성한 달이 없어요"
          description="반 편성 달력에서 개강일·종강일을 먼저 저장하면 그 달 스터디를 열 수 있어요."
          action={{ href: "/admin/sections", label: "반 편성 달력으로" }}
        />
      </>
    );
  }

  const key = termParam(term.year, term.month);
  const [{ data: studyRows }, { data: offlineRows }] = await Promise.all([
    supabase
      .from("studies")
      .select(
        "id, kind, status, notice, study_slots!study_slots_study_id_fkey(id, start_time, end_time, capacity, applied_count, level), study_signups!study_signups_study_id_fkey(count), study_materials(count)",
      )
      .eq("term_id", term.id),
    // 지난달 그대로 가져오기 — 모든 달의 단어 스터디와 시간대 수 (어느 달에서 가져올지는 pickCopySource 가 고른다)
    supabase.from("studies").select("term_id, study_slots!study_slots_study_id_fkey(count)").eq("kind", "offline"),
  ]);
  const byTermId = new Map(terms.map((t) => [t.id, t]));
  const source = pickCopySource(
    term,
    (offlineRows ?? []).flatMap((s) => {
      const t = byTermId.get(s.term_id);
      return t ? [{ term: t, slotCount: s.study_slots?.[0]?.count ?? 0 }] : [];
    }),
  );
  const copySource: CopySource | null = source ? { label: termLabel(source.term, true), slotCount: source.slotCount } : null;

  const studies: PlannerStudy[] = (studyRows ?? []).map((s) => ({
    id: s.id,
    kind: s.kind,
    status: s.status,
    notice: s.notice,
    slots: s.study_slots ?? [],
    signupCount: s.study_signups?.[0]?.count ?? 0,
    materialCount: s.study_materials?.[0]?.count ?? 0,
  }));

  // 방금 '지난달 그대로 가져오기' 를 눌렀으면(서버 액션이 ?copied=달&n=개수 로 돌려보낸다) 바뀐 카드 위에 결과를 적는다 —
  // 가져온 뒤 시간대를 더하거나 지우면(개수가 달라지면) 글을 거둔다 (가져온 것이 아닌 시간대를 세어 말하지 않게)
  const copiedMonth = Number(sp.copied);
  const copiedCount = Number(sp.n);
  const offlineStudy = studies.find((s) => s.kind === "offline") ?? null;
  const copiedNotice =
    offlineStudy && Number.isInteger(copiedMonth) && copiedMonth >= 1 && copiedMonth <= 12 && offlineStudy.slots.length === copiedCount
      ? copyStudyMessage({ month: copiedMonth }, offlineStudy.slots, offlineStudy.notice, term)
      : null;

  return (
    <>
      {header}
      <TermChips basePath="/admin/study/plan" terms={terms} current={key} />
      <StudyPlanner termId={term.id} termLabel={termLabel(term)} termKey={key} studies={studies} copySource={copySource} copiedNotice={copiedNotice} />
    </>
  );
}
