import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff, isAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { Icon } from "@/components/ui/Icon";
import { AssignInstructor } from "@/components/admin/sections/AssignInstructor";
import { SectionsTabs } from "@/components/admin/sections/SectionsTabs";
import { loadTermData, parseTerm } from "../_lib/term-data";
import { isContainerProgram } from "@/lib/two-week";

export const metadata: Metadata = { title: "담당 강사 지정", robots: { index: false } };

/**
 * 담당 강사 지정 (2026-10-02 반 편성 화면에서 떼어 냄). 과목(LC/RC)으로 저절로 정해지고, 손으로 고칠 수도 있다.
 */
export default async function AdminSectionInstructorsPage({ searchParams }: { searchParams: Promise<{ term?: string }> }) {
  const { profile } = await requireStaff();
  const sp = await searchParams;
  const { y, m } = parseTerm(sp.term);
  const supabase = await createClient();
  const data = await loadTermData(supabase, y, m, { instructors: true, includes: false });
  const { term, key, termLabel, sections, sorted, packages, instructorLabel } = data;

  return (
    <div className="space-y-6">
      <PageHeader icon="admin" title="담당 강사 지정" description="반마다 담당 강사를 봅니다. 과목(LC/RC)으로 저절로 정해지고, 편성표대로 채우기나 손으로 고칠 수 있어요." />

      <SectionsTabs current="instructors" year={y} month={m} counts={{ classes: sections.length }} />

      {!term || sections.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 p-8 text-center">
          <Icon name="students" size={44} />
          <p className="font-bold text-ink">{termLabel}에 개설된 반이 없어요</p>
          <p className="text-sm text-slate">
            <Link href={`/admin/sections/new?term=${key}`} className="font-bold text-brand-600 underline">새 반 개설</Link>에서 반을 먼저 만들어 주세요.
          </p>
        </div>
      ) : !isAdmin(profile.role) ? (
        <p className="card p-6 text-sm text-slate">담당 강사 지정은 강사·관리자만 할 수 있어요.</p>
      ) : (
        <section aria-labelledby="assign-instructor-title" className="card p-5 sm:p-7">
          <h2 id="assign-instructor-title" className="text-lg font-black text-ink">
            담당 강사 지정 <span className="text-sm font-semibold text-slate">— {termLabel}</span>
          </h2>
          <div className="mt-4">
            <AssignInstructor
              termLabel={termLabel}
              termId={term.id}
              // 과목이 있는 강사(이혜영 LC · 이영수 RC)를 앞에 둔다 — 관리자는 수업을 맡지 않는다
              instructors={(data.instructors ?? [])
                .map((i) => ({ id: i.id, name: i.name, subject: i.subject === "lc" ? ("lc" as const) : i.subject === "rc" ? ("rc" as const) : null }))
                .sort((a, b) => Number(!a.subject) - Number(!b.subject))}
              rows={sorted.map((s) => ({
                id: s.id,
                courseId: s.course_id,
                course: s.course?.name ?? "강좌",
                track: s.track,
                timeBlock: s.time_block,
                subject: s.subject,
                instructor: instructorLabel(s),
                // 묶음 반(안에 시간 단위 반이 든 반)·스파르타 반 · 2주완성 반은 한 시간씩 강사가 갈린다
                package: (packages.get(s.id)?.parts.length ?? 0) > 0 || isContainerProgram(s.course?.program),
              }))}
            />
          </div>
        </section>
      )}
    </div>
  );
}
