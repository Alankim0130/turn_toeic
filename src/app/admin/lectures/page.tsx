import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/auth";
import { cn, formatDate, todayKST } from "@/lib/utils";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { TermChips } from "@/components/admin/TermChips";
import { LectureSignupForm } from "@/components/admin/lectures/LectureSignupForm";
import { CancelLectureSignupButton } from "@/components/admin/lectures/CancelLectureSignupButton";
import { formatKstDateTime, LECTURE_STATE_CLASS, LECTURE_STATE_LABEL, lectureState, lectureTitle, seatsLeft } from "@/lib/lecture";
import { termParam } from "@/lib/study";
import { pickTerm } from "../_lib/queries";

export const metadata: Metadata = { title: "특강 신청", robots: { index: false } };

/** timestamptz → datetime-local 이 쓰는 KST 문자열 (YYYY-MM-DDTHH:mm) */
function toKstLocal(iso: string | null) {
  if (!iso) return "";
  const kst = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 16);
}

export default async function AdminLecturesPage({ searchParams }: { searchParams: Promise<{ term?: string }> }) {
  await requireStaff();
  const sp = await searchParams;
  const supabase = await createClient();
  const today = todayKST();

  // 특강이 있는 기수만 고른다
  const { data: allLectures } = await supabase.from("special_lectures").select("term_id, term:terms(id, year, month)");
  const termMap = new Map<number, { id: number; year: number; month: number }>();
  for (const l of allLectures ?? []) if (l.term) termMap.set(l.term.id, l.term);
  const terms = [...termMap.values()].sort((a, b) => b.year * 12 + b.month - (a.year * 12 + a.month));
  const term = pickTerm(terms, sp.term, today);

  if (!term) {
    return (
      <>
        <PageHeader icon="bolt" title="특강 신청" description="특강마다 신청을 받을지, 정원과 신청 시작을 정하고 신청자를 확인해요." />
        <EmptyState
          icon="calendar"
          title="아직 만든 특강이 없어요"
          description="반 편성 달력에서 [특강] 을 고르고 날짜를 찍으면 여기에 나타납니다."
          action={{ href: "/admin/sections", label: "반 편성에서 특강 만들기" }}
        />
      </>
    );
  }

  const { data: lectures } = await supabase
    .from("special_lectures")
    .select("id, date, content, kinds, signup, capacity, signup_opens_at, applied_count, lecturer:lecturers(name)")
    .eq("term_id", term.id)
    .order("date")
    .order("id");

  const ids = (lectures ?? []).map((l) => l.id);
  const { data: signups } = ids.length
    ? await supabase
        .from("lecture_signups")
        .select("id, lecture_id, created_at, student:profiles(name, phone)")
        .in("lecture_id", ids)
        .order("created_at")
    : { data: [] as never[] };

  const byLecture = new Map<number, NonNullable<typeof signups>>();
  for (const s of signups ?? []) byLecture.set(s.lecture_id, [...(byLecture.get(s.lecture_id) ?? []), s]);

  const termKey = termParam(term.year, term.month);
  const total = (signups ?? []).length;

  return (
    <>
      <PageHeader
        icon="bolt"
        title="특강 신청"
        description="특강 날짜·강사·종류는 반 편성 달력에서 정하고, 여기서는 신청만 다뤄요."
      >
        <Link href={`/admin/sections?term=${termKey}`} className="btn-secondary">
          <Icon name="calendar" size={18} />
          반 편성
        </Link>
      </PageHeader>

      <TermChips basePath="/admin/lectures" terms={terms} current={termKey} />

      <p className="mb-4 text-sm text-slate">
        {term.year}년 {term.month}월 특강 <b className="text-ink">{lectures?.length ?? 0}개</b> · 신청 <b className="text-brand-600">{total}건</b>
      </p>

      <div className="space-y-4">
        {(lectures ?? []).map((l) => {
          const state = lectureState(l, today);
          const rows = byLecture.get(l.id) ?? [];
          const left = seatsLeft(l);
          return (
            <section key={l.id} className="card overflow-hidden">
              <div className="flex flex-wrap items-start justify-between gap-2 border-b border-line bg-violet-50/50 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-black text-ink">{lectureTitle(l)}</p>
                  <p className="mt-0.5 text-sm text-slate">
                    {formatDate(l.date)}
                    {l.lecturer?.name && <span className="ml-2 font-bold text-violet-700">{l.lecturer.name}</span>}
                  </p>
                </div>
                <span className="flex flex-wrap items-center gap-2">
                  {l.signup && (
                    <span className={cn("rounded-full px-2.5 py-1 text-xs font-bold", LECTURE_STATE_CLASS[state])}>
                      {LECTURE_STATE_LABEL[state]}
                      {state === "not_open" && l.signup_opens_at && ` · ${formatKstDateTime(l.signup_opens_at)} 오픈`}
                    </span>
                  )}
                  <span className="rounded-full bg-line px-2.5 py-1 text-xs font-bold text-slate">
                    신청 {l.applied_count}
                    {l.capacity !== null && ` / ${l.capacity}`}명{left !== null && left > 0 && ` · ${left}자리`}
                  </span>
                </span>
              </div>

              <div className="border-b border-line px-4 py-3">
                <LectureSignupForm
                  lectureId={l.id}
                  signup={l.signup}
                  capacity={l.capacity}
                  signupOpensAt={toKstLocal(l.signup_opens_at)}
                  appliedCount={l.applied_count}
                />
              </div>

              {rows.length === 0 ? (
                <p className="px-4 py-3 text-sm text-mist">{l.signup ? "아직 신청한 수강생이 없어요." : "신청을 받지 않는 특강이에요."}</p>
              ) : (
                <ol className="divide-y divide-line">
                  {rows.map((s, i) => (
                    <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                      <span className="w-6 font-black tabular-nums text-mist">{i + 1}</span>
                      <span className="font-bold text-ink">{s.student?.name ?? "이름 없음"}</span>
                      {s.student?.phone && <span className="text-slate">{s.student.phone}</span>}
                      <span className="text-xs text-mist">{formatDate(s.created_at, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} 신청</span>
                      <span className="ml-auto">
                        <CancelLectureSignupButton id={s.id} name={s.student?.name ?? "수강생"} />
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
