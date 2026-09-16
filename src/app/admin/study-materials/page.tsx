import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { todayKST } from "@/lib/utils";
import { PageHeader } from "@/components/ui/PageHeader";
import { Icon } from "@/components/ui/Icon";
import { TermChips } from "@/components/admin/TermChips";
import { CreateStudyCard } from "@/components/admin/studies/StudyKindCard";
import { AddMaterialForm, MaterialRow } from "@/components/admin/studies/MaterialRow";
import { STUDY_STATUS_LABEL, termParam } from "@/lib/study";
import { pickTerm, termLabel } from "../_lib/queries";

export const metadata: Metadata = { title: "비대면 자료", robots: { index: false } };

export default async function StudyMaterialsPage({ searchParams }: { searchParams: Promise<{ term?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const today = todayKST();

  const { data: terms } = await supabase.from("terms").select("id, year, month").order("year", { ascending: false }).order("month", { ascending: false }).limit(24);
  const term = pickTerm(terms ?? [], sp.term, today);

  const header = (
    <PageHeader icon="online" title="비대면 자료" description="비대면스터디 자료를 수업일마다 하루 하나씩 올립니다. 신청한 수강생은 해당 날짜부터 내려받을 수 있어요.">
      <Link href="/admin/homework" className="btn-secondary">
        <Icon name="homework" size={18} />
        숙제점검
      </Link>
    </PageHeader>
  );

  if (!term) {
    return (
      <>
        {header}
        <div className="card flex flex-col items-center gap-2 p-10 text-center">
          <Icon name="calendar" size={48} />
          <p className="font-bold text-ink">아직 만든 기수(월)가 없어요</p>
          <Link href="/admin/sections" className="btn-primary mt-2">반 편성에서 기수 만들기</Link>
        </div>
      </>
    );
  }

  const termKey = termParam(term.year, term.month);
  const [{ data: study }, { data: sections }] = await Promise.all([
    supabase.from("studies").select("id, status").eq("term_id", term.id).eq("kind", "online").maybeSingle(),
    supabase.from("class_sections").select("id").eq("term_id", term.id),
  ]);

  const sectionIds = (sections ?? []).map((s) => s.id);
  const [{ data: sessionDays }, { data: materials }] = await Promise.all([
    sectionIds.length ? supabase.from("session_dates").select("date").in("section_id", sectionIds) : Promise.resolve({ data: [] as { date: string }[] }),
    study
      ? supabase.from("study_materials").select("id, date, title, file_name, file_size, updated_at").eq("study_id", study.id).order("date")
      : Promise.resolve({ data: [] as { id: number; date: string; title: string | null; file_name: string; file_size: number | null; updated_at: string }[] }),
  ]);

  // 수업일(이 달 반들의 수업일 합집합) + 자료가 있는 날짜
  const classDays = new Set((sessionDays ?? []).map((d) => d.date));
  const byDate = new Map((materials ?? []).map((m) => [m.date, m]));
  const dates = [...new Set([...classDays, ...byDate.keys()])].sort();
  const uploaded = (materials ?? []).length;

  return (
    <>
      {header}
      <TermChips basePath="/admin/study-materials" terms={terms ?? []} current={termKey} />

      {!study ? (
        <div className="grid gap-4 md:grid-cols-2">
          <CreateStudyCard kind="online" termId={term.id} termLabel={termLabel(term)} />
          <div className="card flex flex-col justify-center gap-2 p-5 text-sm text-slate">
            <p className="font-bold text-ink">{termLabel(term)} 비대면스터디를 먼저 열어 주세요</p>
            <p>연 뒤에 날짜별로 자료를 올리고, 반 편성 화면에서 공개 상태를 “신청 받기”로 바꾸면 수강생이 신청할 수 있어요.</p>
            <Link href={`/admin/sections?term=${termKey}`} className="font-bold text-brand-600 hover:underline">반 편성 · 스터디 시간 설정으로 →</Link>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <section className="card flex flex-wrap items-center justify-between gap-3 p-5">
            <div className="text-sm text-slate">
              <p>
                <span className="font-black text-ink">{termLabel(term)} 비대면스터디</span> · {STUDY_STATUS_LABEL[study.status] ?? study.status}
              </p>
              <p className="mt-0.5">
                올린 자료 <strong className="text-brand-600">{uploaded}</strong> / 수업일 {classDays.size}일
              </p>
            </div>
            <Link href={`/admin/sections?term=${termKey}`} className="btn-ghost !py-2 text-xs">
              공개 상태·안내 바꾸기 →
            </Link>
          </section>

          {dates.length === 0 ? (
            <div className="card flex flex-col items-center gap-2 p-8 text-center">
              <Icon name="calendar" size={44} />
              <p className="font-bold text-ink">이 달 수업일이 아직 확정되지 않았어요</p>
              <p className="text-sm text-slate">반 편성에서 캘린더를 저장하면 수업일마다 자료 칸이 생겨요. 아래에서 날짜를 직접 골라 올릴 수도 있어요.</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {dates.map((date) => {
                const m = byDate.get(date) ?? null;
                return (
                  <MaterialRow
                    key={`${date}-${m?.id ?? "new"}`}
                    studyId={study.id}
                    date={date}
                    today={today}
                    isClassDay={classDays.has(date)}
                    material={m}
                  />
                );
              })}
            </ul>
          )}

          <section aria-labelledby="add-material-title">
            <h2 id="add-material-title" className="mb-2 text-sm font-black text-ink">다른 날짜에 자료 올리기</h2>
            <AddMaterialForm studyId={study.id} defaultDate={today} />
          </section>
        </div>
      )}
    </>
  );
}
