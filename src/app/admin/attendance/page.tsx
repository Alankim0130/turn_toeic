import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { requireCrew } from "@/lib/auth";
import { ATTENDANCE_STATUS } from "@/lib/attendance";
import { clampToTerm, inTerm, pickCurrentTerm, shiftDate, termWindow } from "@/lib/term-window";
import { createClient } from "@/lib/supabase/server";
import { cn, formatDate, todayKST, TRACK_LABEL } from "@/lib/utils";
import { setAttendance } from "./actions";

export const metadata: Metadata = { title: "출석", robots: { index: false } };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const kstTime = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit" }) : null);
const md = (d: string) => formatDate(d, { month: "numeric", day: "numeric", weekday: "short" });

type Row = {
  section_id: number;
  course_name: string;
  target_score: number | null;
  track: string;
  time_block: string | null;
  student_id: string;
  student_name: string;
  phone: string | null;
  tester: boolean;
  status: string | null;
  check_in_at: string | null;
  check_out_at: string | null;
  late: boolean;
  decided_note: string | null;
  decided_by_name: string | null;
};

const ERRORS: Record<string, string> = {
  note: "출석 인정·결석은 사유를 적어야 해요.",
  invalid: "잘못된 요청이에요.",
  term: "이 날짜에는 처리할 수 없어요 — 그 반 학생이 아니거나, 그 날 수업이 없거나, 개강일~종강일 밖이에요.",
};

/**
 * 출석 명단 (2026-09-21 Alan — "입실과 퇴실 다 받자! 조교에게도 명단을 열어줘"). **강사·관리자·조교.**
 * **기수 하나만 보여 준다** (2026-09-22 Alan — "해당달 개강날과 종강날에 맞춰서. 다음달로 넘어가면 예전기록은 빠지고 항상 새롭게"):
 * 오늘이 든 기수(없으면 다음 기수)의 개강일~종강일 안에서만 날짜를 넘기고, 그 기수의 학생별 출석 현황을 함께 둔다.
 * 기수 고르기는 `pickCurrentTerm`(날짜를 정한 기수만), 명단·현황·처리의 기간 판정은 DB 함수가 다시 한다 (20260922113000).
 * **끝난 기수는 종강 뒤 7일 동안만** `?term=YYYY-MM` 링크로 열 수 있다 — 종강일 수업의 퇴실 누락 같은 정정을 다음 날 할 수 있게 (리뷰 2026-09-22).
 * 기본 화면은 늘 지금 기수다.
 * 출석 인정·결석은 사유를 꼭 적는다 — 자동 판정이 덮지 못한다.
 */
const GRACE_DAYS = 7;

export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ date?: string; term?: string; ok?: string; error?: string }> }) {
  // 조교에게도 열린 화면이다 — 레이아웃이 조교를 통과시키므로 화면마다 가드를 둔다
  await requireCrew();
  const { date: dateParam, term: termParam, ok, error } = await searchParams;
  const today = todayKST();
  const supabase = await createClient();
  const { data: termRows } = await supabase.from("terms").select("id, year, month, enrollment_opens_at, closes_at");
  const dated = (termRows ?? []).filter((t) => termWindow(t).dated);
  const current = pickCurrentTerm(dated, today, { datedOnly: true });
  // 방금 끝난 기수 — 종강 뒤 7일 동안만 정정하러 열 수 있다
  const graceFrom = shiftDate(today, -GRACE_DAYS);
  const recent = dated
    .filter((t) => t.id !== current?.id && termWindow(t).closes < today && termWindow(t).closes >= graceFrom)
    .sort((a, b) => termWindow(b).closes.localeCompare(termWindow(a).closes))[0];
  const key = (t: { year: number; month: number }) => `${t.year}-${String(t.month).padStart(2, "0")}`;
  const term = (recent && termParam === key(recent) ? recent : null) ?? current;
  const viewingPast = !!term && term.id !== current?.id;
  const q = (date: string) => `/admin/attendance?${viewingPast ? `term=${key(term!)}&` : ""}date=${date}`;

  const header = (
    <PageHeader icon="location" title="출석" description="강의실 앞 포스터 QR 로 찍은 입실·퇴실이에요. 퇴실까지 찍어야 출석이고, 기기 문제 등은 사유를 적어 출석 인정으로 바꿔 주세요.">
      <Link href="/admin/attendance/poster" className="btn-primary">
        <Icon name="camera" size={18} />
        출석 QR 포스터
      </Link>
    </PageHeader>
  );

  if (!term) {
    return (
      <>
        {header}
        <EmptyState icon="calendar" title="개강일·종강일이 정해진 달이 없어요" description="반 편성 달력에서 그 달의 개강일과 종강일을 저장하면 그 기간의 출석이 여기에 쌓여요." />
      </>
    );
  }

  const date = clampToTerm(dateParam && DATE_RE.test(dateParam) ? dateParam : today, term);
  const [{ data, error: rosterError }, { data: summary, error: summaryError }] = await Promise.all([
    supabase.rpc("attendance_roster", { p_date: date }),
    supabase.rpc("attendance_term_summary", { p_term_id: term.id }),
  ]);
  const rows = (data ?? []) as Row[];
  const people = summary ?? [];

  const sections = new Map<number, { head: Row; rows: Row[] }>();
  for (const r of rows) {
    const s = sections.get(r.section_id) ?? { head: r, rows: [] };
    s.rows.push(r);
    sections.set(r.section_id, s);
  }
  const count = (list: Row[], st: string | null) => list.filter((r) => (r.status ?? null) === st).length;
  const { opens, closes } = termWindow(term);

  return (
    <>
      {header}

      {ok && <Alert kind="success" className="mb-4">저장했어요.</Alert>}
      {error && (
        <Alert kind="warning" className="mb-4">
          {ERRORS[error] ?? "저장하지 못했어요. 다시 시도해 주세요."}
        </Alert>
      )}
      {(rosterError || summaryError) && <Alert kind="warning" className="mb-4">명단을 불러오지 못했어요.</Alert>}

      <section aria-labelledby="term-title" className="card mb-6 p-5">
        <p className="text-xs font-bold text-brand-600">출석 기간</p>
        <h2 id="term-title" className="mt-0.5 text-lg font-black text-ink">
          {term.month}월 기수 · {md(opens)} 개강 ~ {md(closes)} 종강
        </h2>
        <p className="mt-1 text-sm text-slate">
          강사가 반 편성 달력에서 정한 개강일부터 종강일까지만 출석을 받아요. 종강일이 지나면 다음 달 기수로 넘어가 새로 시작해요.
        </p>
        {today < opens && <p className="mt-2 text-sm font-bold text-amber-800">아직 개강 전이에요 — {md(opens)}부터 출석을 받아요.</p>}
        {today > closes && !viewingPast && <p className="mt-2 text-sm font-bold text-amber-800">이 기수는 끝났어요. 다음 달 개강일·종강일을 저장하면 그 달로 넘어가요.</p>}
        {viewingPast && (
          <p className="mt-2 text-sm font-bold text-amber-800">
            끝난 기수를 정정하고 있어요 (종강 뒤 {GRACE_DAYS}일까지).{" "}
            <Link href="/admin/attendance" className="text-brand-600 hover:underline">지금 기수로 →</Link>
          </p>
        )}
        {!viewingPast && recent && (
          <p className="mt-2 text-sm">
            <Link href={`/admin/attendance?term=${key(recent)}&date=${termWindow(recent).closes}`} className="font-bold text-brand-600 hover:underline">
              지난 {recent.month}월 기수 정정하기 →
            </Link>
            <span className="ml-1 text-xs text-slate">종강 뒤 {GRACE_DAYS}일까지 열려요 (퇴실 누락 등)</span>
          </p>
        )}
      </section>

      <nav aria-label="날짜" className="mb-6 flex flex-wrap items-center gap-2">
        {date > opens ? (
          <Link href={q(shiftDate(date, -1))} className="btn-ghost !px-3 !py-2 text-sm">‹ 전날</Link>
        ) : (
          <span className="btn-ghost pointer-events-none !px-3 !py-2 text-sm opacity-40" aria-disabled="true">‹ 전날</span>
        )}
        <span className="rounded-xl bg-surface px-4 py-2 text-sm font-black text-ink">
          {formatDate(date, { year: "numeric", month: "long", day: "numeric", weekday: "short" })}
          {date === today && <span className="ml-2 rounded-full bg-brand-500 px-2 py-0.5 text-xs text-white">오늘</span>}
          {date === opens && <span className="ml-2 rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-700">개강일</span>}
          {date === closes && <span className="ml-2 rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-700">종강일</span>}
        </span>
        {date < closes ? (
          <Link href={q(shiftDate(date, 1))} className="btn-ghost !px-3 !py-2 text-sm">다음날 ›</Link>
        ) : (
          <span className="btn-ghost pointer-events-none !px-3 !py-2 text-sm opacity-40" aria-disabled="true">다음날 ›</span>
        )}
        {date !== today && !viewingPast && inTerm(today, term) && <Link href="/admin/attendance" className="text-sm font-bold text-brand-600 hover:underline">오늘로</Link>}
      </nav>

      {sections.size === 0 ? (
        <EmptyState icon="location" title="이 날 현장 수업이 있는 학생이 없어요" description="수업일이 아니거나, 이 날 수업을 듣는 현장 수강생이 없어요. 불라방·인강 학생은 출석을 찍지 않아요." />
      ) : (
        <div className="space-y-6">
          {[...sections.entries()].map(([sectionId, { head, rows: list }]) => (
            <section key={sectionId} id={`s${sectionId}`} aria-labelledby={`t${sectionId}`} className="card scroll-mt-24 p-5">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h2 id={`t${sectionId}`} className="text-base font-black text-ink">
                  {head.time_block} · {head.course_name} {TRACK_LABEL[head.track] ?? head.track}
                </h2>
                <p className="text-xs text-slate">
                  출석 {count(list, "out") + count(list, "manual")} · 입실만 {count(list, "in")} · 미출석 {count(list, null)} · 결석 {count(list, "absent")} / {list.length}명
                </p>
              </div>
              <ul className="divide-y divide-line">
                {list.map((r) => {
                  const st = ATTENDANCE_STATUS[r.status ?? "none"] ?? ATTENDANCE_STATUS.none;
                  return (
                    <li key={r.student_id} className="flex flex-col gap-2 py-3 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0 text-sm">
                        <p className="flex flex-wrap items-center gap-1.5">
                          <Link href={`/admin/students/${r.student_id}`} className="font-bold text-ink hover:underline">{r.student_name}</Link>
                          {r.tester && <span className="rounded-full bg-line px-1.5 py-0.5 text-[10px] font-bold text-slate">테스터</span>}
                          <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", st.className)}>{st.label}</span>
                          {r.late && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-bold text-sky-800">지각</span>}
                        </p>
                        <p className="mt-0.5 text-xs text-slate">
                          {[kstTime(r.check_in_at) && `입실 ${kstTime(r.check_in_at)}`, kstTime(r.check_out_at) && `퇴실 ${kstTime(r.check_out_at)}`, r.decided_note && `${r.decided_by_name ?? "선생님"}: ${r.decided_note}`]
                            .filter(Boolean)
                            .join(" · ") || (r.phone ? `연락처 ${r.phone}` : "아직 안 찍었어요")}
                        </p>
                      </div>
                      <form action={setAttendance} className="flex flex-wrap items-center gap-1.5">
                        <input type="hidden" name="student_id" value={r.student_id} />
                        <input type="hidden" name="section_id" value={sectionId} />
                        <input type="hidden" name="date" value={date} />
                        {viewingPast && <input type="hidden" name="term" value={key(term)} />}
                        <select name="status" defaultValue={r.status === "absent" ? "absent" : "manual"} className="input !w-auto !py-1.5 text-xs" aria-label={`${r.student_name} 처리`}>
                          <option value="manual">출석 인정</option>
                          <option value="absent">결석</option>
                          <option value="clear">되돌리기</option>
                        </select>
                        <input name="note" maxLength={200} className="input !w-40 !py-1.5 text-xs" placeholder="사유 (예: 기기 오류)" aria-label={`${r.student_name} 사유`} />
                        <button type="submit" className="btn-secondary !py-1.5 text-xs">저장</button>
                      </form>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      <section aria-labelledby="summary-title" className="card mt-8 p-5">
        <h2 id="summary-title" className="text-base font-black text-ink">{term.month}월 출석 현황</h2>
        <p className="mt-1 text-xs text-slate">
          {md(opens)} 개강일부터 지금까지 끝난 수업 기준이에요 (수업 끝나고 30분이 지나면 셉니다). 출석 = 퇴실까지 찍음 + 출석 인정. 다음 달 기수가 시작되면 새로 셉니다.
        </p>
        {people.length === 0 ? (
          <p className="mt-4 text-sm text-slate">이 기수에 출석을 찍는 현장 수강생이 없어요.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {people.map((p) => (
              <li key={p.student_id} className="flex flex-col gap-1.5 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 text-sm">
                  <p className="flex flex-wrap items-center gap-1.5">
                    <Link href={`/admin/students/${p.student_id}`} className="font-bold text-ink hover:underline">{p.student_name}</Link>
                    {p.tester && <span className="rounded-full bg-line px-1.5 py-0.5 text-[10px] font-bold text-slate">테스터</span>}
                  </p>
                  {p.sections && <p className="mt-0.5 text-xs text-slate">{p.sections}</p>}
                </div>
                <p className="flex flex-wrap gap-1.5 text-xs font-bold">
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800">출석 {p.present}/{p.classes}</span>
                  {p.late > 0 && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-sky-800">지각 {p.late}</span>}
                  {p.in_only > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">입실만 {p.in_only}</span>}
                  {p.absent > 0 && <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-700">결석 {p.absent}</span>}
                  {p.missing > 0 && <span className="rounded-full bg-line px-2 py-0.5 text-slate">미출석 {p.missing}</span>}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
