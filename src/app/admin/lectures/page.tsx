import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/auth";
import { cn, formatDate, todayKST } from "@/lib/utils";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Alert } from "@/components/ui/Alert";
import { Icon } from "@/components/ui/Icon";
import { TermChips } from "@/components/admin/TermChips";
import { LectureSignupForm } from "@/components/admin/lectures/LectureSignupForm";
import { CancelLectureSignupButton } from "@/components/admin/lectures/CancelLectureSignupButton";
import {
  formatKstDateTime,
  isYbmReviewUrl,
  LECTURE_STATE_CLASS,
  LECTURE_STATE_LABEL,
  lectureOpensAt,
  lectureState,
  lectureTitle,
  needsReviewLink,
  reviewLinkKey,
  seatsLeft,
} from "@/lib/lecture";
import { termParam } from "@/lib/study";
import { pickTerm, type TermLite } from "../_lib/queries";

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

  // 특강이 있는 기수만 고른다. signup 은 신청 마이그레이션에서 생긴 칸이라, 없으면 아직 적용 전이다
  const { data: allLectures, error: lectureError } = await supabase
    .from("special_lectures")
    .select("term_id, signup, term:terms(id, year, month, enrollment_opens_at, closes_at)");
  const needsMigration = !!lectureError && (lectureError.code === "42703" || lectureError.code === "PGRST204" || /signup/.test(lectureError.message ?? ""));

  const migrationNotice = needsMigration ? (
    <Alert kind="warning" title="데이터베이스 업데이트가 아직 적용되지 않았어요" className="mb-4">
      <p>특강 신청은 새 마이그레이션이 적용된 뒤에 동작합니다. 적용 전에는 특강이 하나도 보이지 않아요.</p>
      <p className="mt-1">
        터미널에서 <code className="rounded bg-ink/5 px-1 py-0.5 font-mono text-xs">npx supabase db push --linked</code> 를 실행하거나, Supabase 대시보드의 SQL
        Editor 에서 <code className="rounded bg-ink/5 px-1 py-0.5 font-mono text-xs">supabase/migrations</code> 의 최신 파일들을 실행해 주세요.
      </p>
    </Alert>
  ) : null;
  const termMap = new Map<number, TermLite>();
  for (const l of allLectures ?? []) if (l.term) termMap.set(l.term.id, l.term);
  const terms = [...termMap.values()].sort((a, b) => b.year * 12 + b.month - (a.year * 12 + a.month));
  const term = pickTerm(terms, sp.term, today);

  if (!term) {
    return (
      <>
        <PageHeader icon="bolt" title="특강 신청" description="특강마다 신청을 받을지, 정원과 신청 시작을 정하고 신청자를 확인해요." />
        {migrationNotice}
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
  const signups = ids.length ? await getSignups(supabase, ids) : [];

  const byLecture = new Map<number, typeof signups>();
  for (const s of signups) byLecture.set(s.lecture_id, [...(byLecture.get(s.lecture_id) ?? []), s]);

  const termKey = termParam(term.year, term.month);
  const total = signups.length;

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

      {migrationNotice}

      <TermChips basePath="/admin/lectures" terms={terms} current={termKey} />

      <p className="mb-4 text-sm text-slate">
        {term.year}년 {term.month}월 특강 <b className="text-ink">{lectures?.length ?? 0}개</b> · 신청 <b className="text-brand-600">{total}건</b>
      </p>

      <div className="space-y-4">
        {(lectures ?? []).map((l) => {
          const state = lectureState(l, today);
          const rows = byLecture.get(l.id) ?? [];
          const left = seatsLeft(l);
          // 3주차 모의고사 — YBM 수강후기 링크를 올려야 신청된다 (2026-10-08 Alan). 같은 후기(키 — `reviewLinkKey`)를 낸 학생을 짚는다.
          // 같은 날 저녁부터 DB 가 다른 학생의 링크를 막으므로(20261008130000) 그 전에 들어온 신청에만 붙을 수 있다
          const review = needsReviewLink(l, term.enrollment_opens_at);
          const linkCount = new Map<string, number>();
          for (const r of rows) {
            const key = reviewLinkKey(r.review_url);
            if (key) linkCount.set(key, (linkCount.get(key) ?? 0) + 1);
          }
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
                  {review && <span className="rounded-full bg-brand-500 px-2.5 py-1 text-xs font-bold text-white">YBM 후기 링크로 신청 · 3주차 모의고사</span>}
                  {l.signup && (
                    <span className={cn("rounded-full px-2.5 py-1 text-xs font-bold", LECTURE_STATE_CLASS[state])}>
                      {LECTURE_STATE_LABEL[state]}
                      {state === "not_open" && ` · ${formatKstDateTime(lectureOpensAt(l))} 오픈${l.signup_opens_at ? "" : " (7일 전 자정)"}`}
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
                      {review && <ReviewLinkLine url={s.review_url} shared={(linkCount.get(reviewLinkKey(s.review_url) ?? "") ?? 0) > 1} />}
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

/**
 * 신청 명단 — 후기 링크(review_url, 2026-10-08)와 함께. 그 칸은 마이그레이션 20261008100000 에서 생겼다 —
 * 배포와 마이그레이션 사이에 못 읽으면 링크 없이 명단만 읽는다 (그대로 비우면 신청자가 하나도 없는 것처럼 보인다).
 */
async function getSignups(supabase: Awaited<ReturnType<typeof createClient>>, ids: number[]) {
  const full = await supabase
    .from("lecture_signups")
    .select("id, lecture_id, created_at, review_url, student:profiles(name, phone)")
    .in("lecture_id", ids)
    .order("created_at");
  if (!full.error) return full.data ?? [];
  const { data } = await supabase.from("lecture_signups").select("id, lecture_id, created_at, student:profiles(name, phone)").in("lecture_id", ids).order("created_at");
  return (data ?? []).map((r) => ({ ...r, review_url: null as string | null }));
}

/**
 * 학생이 올린 YBM 수강후기 링크 — 눌러 열어 보고 후기가 아니면 신청을 취소한다.
 * 같은 후기(`reviewLinkKey`)를 다른 학생도 냈으면 표시한다 (친구 후기를 그대로 붙여 넣은 것일 수 있다) —
 * 2026-10-08 저녁부터는 DB 가 그런 신청을 아예 막으므로(20261008130000) 그 전에 들어온 신청에만 붙는다.
 * 신청은 YBM 후기 링크 꼴만 받지만(2026-10-08 — `YBM_REVIEW_LINK_RE`) 꼴을 좁히기 전 몇 분 동안 들어온 신청이 있을 수 있어 그 꼴이 아니면 표시한다.
 * 조건이 생기기 전 신청은 링크가 없다.
 */
function ReviewLinkLine({ url, shared }: { url: string | null; shared: boolean }) {
  if (!url) return <p className="basis-full pl-9 text-xs font-semibold text-amber-700">후기 링크 없음</p>;
  return (
    <p className="flex min-w-0 basis-full flex-wrap items-center gap-x-2 gap-y-1 pl-9 text-xs">
      <a href={url} target="_blank" rel="noopener noreferrer" className="min-w-0 break-all font-semibold text-ink underline decoration-brand-200 underline-offset-2 hover:decoration-brand-500">
        {url}
      </a>
      {!isYbmReviewUrl(url) && <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 font-bold text-amber-800">YBM 후기 링크 아님</span>}
      {shared && <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 font-bold text-amber-800">다른 학생과 같은 링크</span>}
    </p>
  );
}
