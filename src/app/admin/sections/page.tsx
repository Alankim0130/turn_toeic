import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Icon } from "@/components/ui/Icon";
import { todayKST } from "@/lib/utils";
import { TermCalendar, type TermSchedule, type OtherTermDate } from "@/components/admin/sections/TermCalendar";
import { SectionsTabs } from "@/components/admin/sections/SectionsTabs";
import { shiftMonth, ymd, daysInMonth } from "@/components/admin/sections/dates";
import { loadTermData, parseTerm } from "./_lib/term-data";

export const metadata: Metadata = { title: "반 편성", robots: { index: false } };

/**
 * 반 편성 — **달력(일정표 편성)만** (2026-10-02 Alan — "반 편성에서 일정표에 관련된 편성만 딱 이뤄지면 좋겠어. 아래로 스크롤을
 * 내리면 너무 많은 정보가 있어"). 개설 반 목록 · 새 반 개설 · 담당 강사 · 스터디 시간은 위 탭(`SectionsTabs`)의 제 화면으로 갔다.
 */
export default async function AdminSectionsPage({ searchParams }: { searchParams: Promise<{ term?: string }> }) {
  await requireStaff();
  const sp = await searchParams;
  const { y, m } = parseTerm(sp.term);
  const today = todayKST();
  const supabase = await createClient();
  const data = await loadTermData(supabase, y, m, { instructors: false, includes: false });
  const { term, key, termLabel, sections } = data;

  // 월(기수) 구분: 달력에 함께 보이는 앞뒤 달 날짜를 다른 기수가 이미 쓰고 있는지
  const prev = shiftMonth(y, m, -1);
  const next = shiftMonth(y, m, 1);
  const { data: neighbourDates } = await supabase
    .from("term_class_dates")
    .select("date, track, term:terms!inner(id, year, month)")
    .gte("date", ymd(prev.y, prev.m, 1))
    .lte("date", ymd(next.y, next.m, daysInMonth(next.y, next.m)))
    .order("date");
  const otherTermDates: OtherTermDate[] = (neighbourDates ?? [])
    .filter((d) => d.term && d.term.id !== term?.id)
    .map((d) => ({ date: d.date, track: d.track === "ttf" ? ("ttf" as const) : ("mwf" as const), year: d.term!.year, month: d.term!.month }));

  // 다시보기가 붙은 수업일은 달력에서 뺄 수 없다 — 달력에 표시하려고 미리 읽는다
  const sectionTrack = new Map(sections.map((s) => [s.id, s.track]));
  const { data: replayRows } = sectionTrack.size
    ? await supabase.from("session_dates").select("date, section_id, replays!inner(id)").in("section_id", [...sectionTrack.keys()])
    : { data: [] as { date: string; section_id: number }[] };
  const replayDates = (replayRows ?? []).map((r) => ({ date: r.date, track: sectionTrack.get(r.section_id) === "ttf" ? ("ttf" as const) : ("mwf" as const) }));

  const saved: TermSchedule = {
    opens: term?.enrollment_opens_at ?? null,
    closes: term?.closes_at ?? null,
    mwf: data.classDates.filter((d) => d.track === "mwf").map((d) => d.date),
    ttf: data.classDates.filter((d) => d.track === "ttf").map((d) => d.date),
    lectures: data.lectureRows.map((l) => ({
      id: l.id,
      date: l.date,
      lecturerId: l.lecturer_id,
      content: l.content ?? "",
      kinds: l.kinds ?? [],
    })),
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon="calendar"
        title="반 편성"
        description="달력에서 개강일·종강일·월수금·화목금 수업일·특강을 찍어 주세요. 항목마다 따로 저장할 수 있고, 강의가 다음 달까지 이어지면 앞뒤 달 날짜도 찍을 수 있어요. 반 개설·담당 강사·스터디 시간은 탭에서 따로 합니다."
      >
        <Link href={`/admin/lectures?term=${key}`} className="btn-secondary">
          <Icon name="bolt" size={18} />
          특강 신청
        </Link>
        <Link href="/admin/replays" className="btn-secondary">
          <Icon name="replay" size={18} />
          다시보기 등록
        </Link>
      </PageHeader>

      {data.needsMigration && (
        <Alert kind="warning" title="데이터베이스 업데이트가 아직 적용되지 않았어요">
          <p>이 상태에서는 <b className="text-ink">달력을 저장해도 저장되지 않습니다.</b> 편성을 시작하기 전에 먼저 적용해 주세요.</p>
          <p className="mt-1">
            터미널에서 <code className="rounded bg-ink/5 px-1 py-0.5 font-mono text-xs">npx supabase db push --linked</code> 를 실행하거나, Supabase 대시보드의 SQL
            Editor 에서 <code className="rounded bg-ink/5 px-1 py-0.5 font-mono text-xs">supabase/migrations</code> 의 최신 파일을 실행하면 됩니다.
          </p>
        </Alert>
      )}

      {/* 달력은 자기 ‹ › 로 달을 넘기므로 탭에는 달 넘기기를 그리지 않는다 */}
      <SectionsTabs current="calendar" year={y} month={m} counts={{ classes: sections.length }} monthNav={false} />

      {/* 달력 */}
      <section aria-label={`${termLabel} 달력`} className="card p-4 sm:p-6">
        <TermCalendar
          key={key}
          year={y}
          month={m}
          today={today}
          saved={saved}
          hasSaved={data.hasSaved}
          lecturers={data.lecturers}
          replayDates={replayDates}
          otherTermDates={otherTermDates}
          sectionCount={sections.length}
        />
      </section>

      {!term && (
        <div className="card flex flex-col items-center gap-2 p-8 text-center">
          <Icon name="calendar" size={44} />
          <p className="font-bold text-ink">{termLabel} 일정이 아직 없어요</p>
          <p className="text-sm text-slate">달력에서 날짜를 찍고 생성하기를 누르면 이 달 반 개설과 스터디 시간 설정이 열려요.</p>
        </div>
      )}

      {term && (
        <p className="text-sm text-slate">
          {termLabel} 반 <b className="text-ink">{sections.length}개</b> —{" "}
          <Link href={`/admin/sections/classes?term=${key}`} className="font-bold text-brand-600 hover:underline">개설 반 보기</Link>
          {" · "}
          <Link href={`/admin/sections/new?term=${key}`} className="font-bold text-brand-600 hover:underline">새 반 개설</Link>
          {" · "}
          <Link href={`/admin/sections/instructors?term=${key}`} className="font-bold text-brand-600 hover:underline">담당 강사</Link>
          {" · "}
          <Link href={`/admin/study/plan?term=${key}`} className="font-bold text-brand-600 hover:underline">스터디 시간 설정</Link>
        </p>
      )}
    </div>
  );
}
