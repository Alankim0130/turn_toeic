import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { todayKST } from "@/lib/utils";
import { PageHeader } from "@/components/ui/PageHeader";
import { Icon } from "@/components/ui/Icon";
import { TermChips } from "@/components/admin/TermChips";
import { CreateStudyCard } from "@/components/admin/studies/StudyKindCard";
import { MaterialRow } from "@/components/admin/studies/MaterialRow";
import { STUDY_STATUS_LABEL, termParam } from "@/lib/study";
import { classDayRounds, roundRowCount } from "@/lib/study-rounds";
import { pickTerm, termLabel, TERM_COLUMNS } from "../_lib/queries";
import { requireStaff } from "@/lib/auth";

export const metadata: Metadata = { title: "비대면 자료", robots: { index: false } };

/**
 * 비대면 자료 — **회차로 한 번 올리고 매달 다시 쓴다** (2026-09-22 Alan — "1회차, 2회차... 이렇게 설정하고
 * 매달 강사들이 설정한 일정표에 따라 적용되면 좋겠어", 한 번 올리고 재사용 · 수업일 전체 순서를 골랐다).
 * N회차 = 그 달 반 편성 달력의 N번째 수업일(월수금 + 화목금, 개강일~종강일 안). 붙이는 일은 DB 가 한다 (20260922124700).
 * 위 달 칩은 "그 달엔 몇 회차가 며칠에 열리나" 를 미리 보는 것이다 — 자료는 달마다 따로 올리지 않는다.
 */
export default async function StudyMaterialsPage({ searchParams }: { searchParams: Promise<{ term?: string }> }) {
  // 조교는 이 화면을 쓸 수 없다 — 레이아웃이 조교를 통과시키므로 화면마다 막는다
  await requireStaff();
  const sp = await searchParams;
  const supabase = await createClient();
  const today = todayKST();

  const { data: terms } = await supabase.from("terms").select(TERM_COLUMNS).order("year", { ascending: false }).order("month", { ascending: false }).limit(24);
  const term = pickTerm(terms ?? [], sp.term, today);

  const [{ data: itemRows }, { data: study }, { data: classDates }] = await Promise.all([
    supabase.from("study_material_items").select("id, seq, title, file_name, file_size, updated_at").order("seq"),
    term
      ? supabase.from("studies").select("id, status").eq("term_id", term.id).eq("kind", "online").maybeSingle()
      : Promise.resolve({ data: null as { id: number; status: string } | null }),
    term ? supabase.from("term_class_dates").select("date").eq("term_id", term.id) : Promise.resolve({ data: [] as { date: string }[] }),
  ]);

  const items = itemRows ?? [];
  const bySeq = new Map(items.map((i) => [i.seq, i]));
  const days = term ? classDayRounds((classDates ?? []).map((d) => d.date), { opens: term.enrollment_opens_at, closes: term.closes_at }) : [];
  const rows = roundRowCount(days.length, Math.max(0, ...items.map((i) => i.seq)));
  const open = Math.min(days.length, items.length ? Math.max(...items.map((i) => i.seq)) : 0);
  const monthLabel = term ? `${term.month}월` : "";
  const termKey = term ? termParam(term.year, term.month) : "";

  return (
    <>
      <PageHeader
        icon="online"
        title="비대면 자료"
        description="회차마다 한 번 올려 두면 매달 그 달 수업일 순서대로 열려요 — 1회차는 그 달 첫 수업일, 2회차는 둘째 수업일. 신청한 수강생은 그 날부터 받아요."
      >
        <Link href="/admin/study" className="btn-secondary">
          <Icon name="study" size={18} />
          인증 현황
        </Link>
      </PageHeader>

      {term && <TermChips basePath="/admin/study-materials" terms={terms ?? []} current={termKey} />}

      <div className="space-y-5">
        {term && (
          <section className="card flex flex-wrap items-center justify-between gap-3 p-5">
            <div className="text-sm text-slate">
              <p>
                <span className="font-black text-ink">{termLabel(term)}</span> 수업일 <strong className="text-brand-600">{days.length}</strong>일 → 1~{days.length || 0}회차가 그 날짜에 열려요
                {study ? <> · 비대면스터디 {STUDY_STATUS_LABEL[study.status] ?? study.status}</> : null}
              </p>
              <p className="mt-0.5">
                올린 자료 <strong className="text-brand-600">{items.length}</strong>회차
                {days.length > 0 && open < days.length && <> · 이 달엔 {open + 1}회차부터 자료가 비어 있어요</>}
              </p>
            </div>
            <Link href={`/admin/sections?term=${termKey}`} className="btn-ghost !py-2 text-xs">
              수업일 바꾸기 (반 편성) →
            </Link>
          </section>
        )}

        {term && !study && (
          <div className="grid gap-4 md:grid-cols-2">
            <CreateStudyCard kind="online" termId={term.id} termLabel={termLabel(term)} />
            <div className="card flex flex-col justify-center gap-2 p-5 text-sm text-slate">
              <p className="font-bold text-ink">{termLabel(term)} 비대면스터디가 아직 열리지 않았어요</p>
              <p>열면 아래 회차 자료가 이 달 수업일에 바로 들어가요. 반 편성 화면에서 공개 상태를 &ldquo;신청 받기&rdquo;로 바꾸면 수강생이 신청할 수 있어요.</p>
            </div>
          </div>
        )}

        {term && days.length === 0 && (
          <div className="card flex flex-col items-center gap-2 p-6 text-center">
            <Icon name="calendar" size={40} />
            <p className="font-bold text-ink">{termLabel(term)} 수업일이 아직 없어요</p>
            <p className="text-sm text-slate">반 편성 달력에서 수업일을 저장하면 회차마다 날짜가 붙어요. 자료는 지금 올려 두어도 돼요.</p>
          </div>
        )}

        <ul className="space-y-3">
          {Array.from({ length: rows }, (_, k) => k + 1).map((seq) => (
            <MaterialRow key={`${seq}-${bySeq.get(seq)?.id ?? "new"}`} seq={seq} date={days[seq - 1] ?? null} today={today} monthLabel={monthLabel} item={bySeq.get(seq) ?? null} />
          ))}
        </ul>
      </div>
    </>
  );
}
