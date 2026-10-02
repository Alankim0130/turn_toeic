import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff, isAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Icon } from "@/components/ui/Icon";
import { formatDate } from "@/lib/utils";
import { CreateSectionForm } from "@/components/admin/sections/CreateSectionForm";
import { BulkCreateSections, type BulkSlot } from "@/components/admin/sections/BulkCreateSections";
import { sectionKeyOf, timeBlockOf } from "@/components/admin/sections/bulk";
import { SectionsTabs } from "@/components/admin/sections/SectionsTabs";
import { SEASON_LABEL, seasonOfMonth } from "@/lib/timetable";
import { loadTermData, parseTerm } from "../_lib/term-data";

export const metadata: Metadata = { title: "새 반 개설", robots: { index: false } };

/**
 * 새 반 개설 — 시간표 기준 일괄 개설 + 하나씩 만들기 (2026-10-02 반 편성 화면에서 떼어 냄).
 * 달력에서 개강일·종강일을 저장한 달만 열린다. 만들면 개설 반 목록으로 돌아간다.
 */
export default async function AdminSectionNewPage({ searchParams }: { searchParams: Promise<{ term?: string }> }) {
  const { profile } = await requireStaff();
  const sp = await searchParams;
  const { y, m } = parseTerm(sp.term);
  const supabase = await createClient();
  const data = await loadTermData(supabase, y, m, { instructors: true, includes: false });
  const { term, key, termLabel, sections, courses, instructors, hasSaved } = data;

  // 시간표 기준 일괄 개설용: 그 달 시간표의 시간대와 이미 만들어진 (강좌·트랙·시간대) 조합.
  // 시간표는 달마다 한 벌이다 (2026-09-29 Alan) — 그 달 시간표가 없으면 표를 비우고 만들러 가는 길만 둔다
  const season = seasonOfMonth(m);
  const bulkSlots: BulkSlot[] = data.timetable
    .map((s) => ({
      id: s.id,
      level: s.level,
      program: s.program,
      label: timeBlockOf(s.start_time, s.end_time) ?? "",
      bookSet: s.book_set,
      subjectMwf: s.subject_mwf,
      subjectTtf: s.subject_ttf,
    }))
    .filter((s) => s.label);
  const monthHasNoSlots = term != null && bulkSlots.length === 0;
  const timetableHref = `/admin/timetable?month=${key}`;
  const existingKeys = sections.map((s) => sectionKeyOf(s.course_id, s.track, s.time_block));

  return (
    <div className="space-y-6">
      <PageHeader icon="timeslot" title="새 반 개설" description="시간표의 시간대와 강좌를 엮어 한 번에 개설하거나, 하나씩 만듭니다. 개강일·종강일·수업일은 달력에서 가져와요." />

      <SectionsTabs current="new" year={y} month={m} counts={{ classes: sections.length }} />

      {!term || !hasSaved ? (
        <div className="card flex flex-col items-center gap-2 p-8 text-center">
          <Icon name="calendar" size={44} />
          <p className="font-bold text-ink">{termLabel} 개강일·종강일이 아직 없어요</p>
          <p className="text-sm text-slate">
            먼저 <Link href={`/admin/sections?term=${key}`} className="font-bold text-brand-600 underline">달력</Link>에서 <b className="text-ink">개강일·종강일</b>을 찍고{" "}
            <b className="text-ink">생성하기</b>를 눌러 주세요. 그 다음에 반을 개설할 수 있어요.
          </p>
        </div>
      ) : (
        <section aria-labelledby="create-section-title" className="card p-5 sm:p-7">
          <h2 id="create-section-title" className="text-lg font-black text-ink">
            새 반 개설 <span className="text-sm font-semibold text-slate">— {termLabel}</span>
          </h2>
          {/* 시간표 기준 일괄 개설 — 한 달에 열리는 반이 수십 개라 하나씩 만들지 않는다 */}
          {courses.length > 0 && (
            <div className="mb-8">
              <p className="mt-1 text-sm text-slate">
                시간표의 시간대와 강좌를 엮어 한 번에 개설합니다. 불라방은 따로 만들지 않아요 — 같은 반을 수강증에 따라 현장 또는 불라방으로 들어요.
                지금은 <strong className="text-ink">{termLabel} 시간표</strong>({SEASON_LABEL[season]})를 씁니다.
              </p>
              <p className="mt-1 text-sm text-slate">
                <strong className="text-ink">주5일</strong> 칸을 누르면 월수금·화목금이 함께 골라져요. 120분·140분은 <strong className="text-ink">한달완성(묶음) 반</strong>이고 그 아래 ↳ 줄이
                실제 수업인 60분·70분 반이라, 한달완성 학생은 안에 든 반을 자동으로 함께 들어요. <strong className="text-ink">과목(LC/RC)과 과정(A/B)</strong>은
                시간표에서 정한 값으로 만들어져요.
              </p>
              {monthHasNoSlots && (
                <div className="mt-3">
                  <Alert kind="warning">
                    {termLabel} 시간표가 아직 없어요. 시간표가 있어야 반의 시간·과목·과정이 맞게 들어가므로 표에 아무것도 띄우지 않았습니다.{" "}
                    <Link href={timetableHref} className="font-bold underline underline-offset-2">
                      {m}월 시간표 만들기 →
                    </Link>
                  </Alert>
                </div>
              )}
              <div className="mt-4">
                <BulkCreateSections
                  termId={term.id}
                  termLabel={termLabel}
                  timetableHref={timetableHref}
                  courses={courses}
                  slots={bulkSlots}
                  existingKeys={existingKeys}
                  instructors={instructors}
                  isAdmin={isAdmin(profile.role)}
                />
              </div>
              <h3 className="mt-8 border-t border-line pt-6 text-base font-black text-ink">하나씩 만들기</h3>
            </div>
          )}
          <p className="mt-1 text-sm text-slate">
            트랙을 “주5일(월수금+화목금)”로 고르면 같은 조건의 반 두 개가 묶음으로 만들어져요. 개강일(
            {formatDate(term.enrollment_opens_at!, { month: "numeric", day: "numeric" })})·종강일(
            {formatDate(term.closes_at!, { month: "numeric", day: "numeric" })})과 수업일은 달력에서 가져옵니다.
          </p>
          <div className="mt-5">
            <CreateSectionForm termId={term.id} termLabel={termLabel} courses={courses} instructors={instructors} isAdmin={isAdmin(profile.role)} />
          </div>
        </section>
      )}
    </div>
  );
}
