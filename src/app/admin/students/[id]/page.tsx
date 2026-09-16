import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdmin, requireStaff, ROLE_LABEL, type UserRole } from "@/lib/auth";
import { todayKST, formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { TermChips } from "@/components/admin/TermChips";
import { RoleSelect, type RoleOption } from "@/components/admin/students/RoleSelect";
import { AssignSections, RemoveEnrollment, type SectionOption } from "@/components/admin/students/EnrollmentEditor";
import { GENDER_LABEL, pickTerm, sectionSummary, termLabel } from "../../_lib/queries";
import { termParam } from "@/lib/study";

export const metadata: Metadata = { title: "학생 관리", robots: { index: false } };

/** 등급마다 한 줄 설명 — 고르기 전에 무엇이 달라지는지 알 수 있게 */
const ROLE_HINT: Record<UserRole, string> = {
  guest: "공개 페이지만 볼 수 있어요.",
  member: "가입 회원. 수강증을 올릴 수 있어요.",
  student: "배정된 반의 수강생전용을 종강일까지 쓸 수 있어요.",
  alumni: "종강한 학생. 수강생전용이 닫혀요.",
  instructor: "관리자 화면을 쓸 수 있어요 (강사).",
  admin: "관리자 화면 전체 + 다른 사람 등급 변경까지 할 수 있어요.",
};

export default async function StudentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ term?: string }>;
}) {
  const [{ id }, sp, { profile: me }] = await Promise.all([params, searchParams, requireStaff()]);
  const supabase = await createClient();
  const today = todayKST();

  const { data: student } = await supabase
    .from("profiles")
    .select("id, name, phone, role, university, department, gender, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!student) notFound();

  const [{ data: enrollments }, { data: orders }, { data: terms }] = await Promise.all([
    supabase
      .from("enrollments")
      .select("id, mode, status, section:class_sections!enrollments_section_id_fkey(id, track, start_time, end_time, time_block, closes_at, term:terms(year, month), course:courses(name))")
      .eq("student_id", id)
      .order("id"),
    supabase.from("enrollment_orders").select("id, status, activates_on, access_until, verification_id").eq("user_id", id).order("activates_on", { ascending: false }),
    supabase.from("terms").select("id, year, month").order("year").order("month"),
  ]);

  const term = pickTerm(terms ?? [], sp.term, today);
  const { data: termSections } = term
    ? await supabase
        .from("class_sections")
        .select("id, track, start_time, end_time, time_block, term:terms(year, month), course:courses(name)")
        .eq("term_id", term.id)
        .neq("status", "draft")
        .order("start_time")
        .order("track")
    : { data: [] };

  const takenIds = new Set((enrollments ?? []).map((e) => e.section?.id).filter(Boolean));
  const sectionOptions: SectionOption[] = (termSections ?? []).map((s) => ({
    id: s.id,
    label: sectionSummary(s, null, { withEnd: true }),
    taken: takenIds.has(s.id),
  }));

  const roleOptions: RoleOption[] = (Object.keys(ROLE_LABEL) as UserRole[]).map((r) => ({ value: r, label: ROLE_LABEL[r], hint: ROLE_HINT[r] }));
  const canChangeRole = isAdmin(me.role);

  const info: { label: string; value: string }[] = [
    { label: "연락처", value: student.phone || "-" },
    { label: "대학", value: student.university || "-" },
    { label: "학과", value: student.department || "-" },
    { label: "성별", value: student.gender ? (GENDER_LABEL[student.gender] ?? student.gender) : "-" },
    { label: "가입일", value: formatDate(student.created_at, { year: "numeric", month: "long", day: "numeric" }) },
  ];

  return (
    <>
      <PageHeader icon="students" title={student.name || "이름 없음"} description="등급과 반 배정을 여기서 바꿉니다.">
        <Link href="/admin/students" className="btn-ghost !py-2">← 학생명단</Link>
      </PageHeader>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        {/* 기본 정보 */}
        <section aria-labelledby="info-title" className="card p-5">
          <h2 id="info-title" className="mb-4 text-lg font-black text-ink">기본 정보</h2>
          <dl className="divide-y divide-line">
            {info.map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <dt className="font-bold text-slate">{row.label}</dt>
                <dd className="min-w-0 truncate text-ink">{row.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* 등급 */}
        <section aria-labelledby="role-title" className="card p-5">
          <div className="mb-4 flex items-center gap-2">
            <h2 id="role-title" className="text-lg font-black text-ink">등급</h2>
            <StatusBadge status={student.role} />
          </div>
          {canChangeRole ? (
            <RoleSelect id={student.id} current={student.role} options={roleOptions} />
          ) : (
            <p className="rounded-xl bg-brand-50/60 px-4 py-6 text-sm text-slate">
              등급은 <strong className="text-ink">관리자</strong>만 바꿀 수 있어요. 바꿔야 하면 관리자에게 요청해 주세요.
            </p>
          )}
          <p className="mt-3 text-xs text-mist">
            등급을 올려도 반이 배정돼 있지 않으면 내 시간표·다시보기에는 아무것도 나오지 않아요. 아래에서 반을 함께 배정해 주세요.
          </p>
        </section>

        {/* 반 배정 */}
        <section aria-labelledby="enroll-title" className="card p-5 lg:col-span-2">
          <h2 id="enroll-title" className="mb-4 text-lg font-black text-ink">
            반 배정 <span className="tabular-nums text-slate">({(enrollments ?? []).length})</span>
          </h2>

          {(enrollments ?? []).length === 0 ? (
            <p className="rounded-xl bg-brand-50/60 px-4 py-6 text-center text-sm text-slate">아직 배정된 반이 없어요.</p>
          ) : (
            <ul className="divide-y divide-line">
              {(enrollments ?? []).map((e) => (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                  <span className="min-w-0">
                    <span className="font-bold text-ink">{sectionSummary(e.section, e.mode, { withEnd: true })}</span>
                    {e.section?.closes_at && <span className="ml-2 text-xs text-slate">{formatDate(e.section.closes_at, { month: "long", day: "numeric" })} 종강</span>}
                  </span>
                  <span className="flex shrink-0 flex-wrap items-center gap-2">
                    <StatusBadge status={e.status ?? "active"} />
                    <RemoveEnrollment enrollmentId={e.id} label={sectionSummary(e.section, e.mode)} />
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-6 border-t border-line pt-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-black text-ink">반 배정 추가</h3>
              <p className="text-xs text-slate">주5일이면 월수금·화목금 두 반을 함께 고르세요</p>
            </div>
            {(terms ?? []).length === 0 ? (
              <p className="rounded-xl bg-brand-50/60 px-4 py-6 text-center text-sm text-slate">
                개설된 기수가 없어요. <Link href="/admin/sections" className="font-bold text-brand-600 hover:underline">반 편성으로 이동</Link>
              </p>
            ) : (
              <>
                <TermChips basePath={`/admin/students/${student.id}`} terms={terms ?? []} current={term ? termParam(term.year, term.month) : null} />
                <AssignSections id={student.id} sections={sectionOptions} />
              </>
            )}
          </div>

          {(orders ?? []).length > 0 && (
            <details className="mt-6 border-t border-line pt-4">
              <summary className="cursor-pointer text-sm font-bold text-slate">등록 이력 {(orders ?? []).length}건</summary>
              <ul className="mt-2 divide-y divide-line text-sm">
                {(orders ?? []).map((o) => (
                  <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="text-ink">
                      {formatDate(o.activates_on, { month: "long", day: "numeric" })} 개강 · {formatDate(o.access_until, { month: "long", day: "numeric" })} 만료
                    </span>
                    <span className="flex items-center gap-2">
                      {!o.verification_id && <span className="chip text-xs">스태프 배정</span>}
                      <StatusBadge status={o.status} />
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      </div>

      <p className="mt-6 text-xs text-mist">
        {term ? `${termLabel(term)} 기수 반을 보여 주고 있어요.` : ""} 반 배정을 바꾸면 그 학생의 내 시간표·다시보기·수강생전용이 바로 따라 바뀝니다.
      </p>
    </>
  );
}
