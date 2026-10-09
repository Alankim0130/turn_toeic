import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { Reveal } from "@/components/ui/Reveal";
import { AttendanceMark } from "@/components/ui/AttendanceMark";
import { AttendanceRate } from "@/components/my/AttendanceRate";
import { AttendanceCalendar, type CalendarStamp } from "@/components/my/AttendanceCalendar";
import { requireUser } from "@/lib/auth";
import { countDays, dayMark, MARK_ORDER, MARK_STYLE, monthsBetween, pickRecordTerms, streakOf, type MarkKind } from "@/lib/attendance-board";
import { createClient } from "@/lib/supabase/server";
import { formatDate, todayKST } from "@/lib/utils";

export const metadata: Metadata = { title: "내 출석", robots: { index: false } };

const kstTime = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit" }) : null);
const md = (d: string) => formatDate(d, { month: "numeric", day: "numeric", weekday: "short" });

/**
 * 내 출석 (2026-10-01 Alan — "학생들도 본인이 출석을 잘 하고 있는지 확인 할 수 있는 공간이 따로 마련되면 좋겠어!" ·
 * "학생들이 스스로 출석을 계속 하고 있다는 걸 알고 뿌듯함을 느끼게"). 찍는 곳(`/my/attendance` — 카메라)과 **따로 둔 보는 곳**이다.
 *
 * - 맨 위 연속 출석 · 모은 도장, 그 아래 출석률(대시보드와 같은 `AttendanceRate`), 수업일마다 도장을 찍은 달력, 지난 수업 기록.
 * - **지금 기수(강사가 정한 개강일~종강일)만** 보여 준다. 종강일이 지나면 사라지고 다음 기수로 새로 쌓인다 —
 *   개강 전이면 다음 기수의 수업일을 예정으로 미리 보여 준다 (`my_attendance_days` · `pickRecordTerms`).
 * - 셈은 출석률 카드(`my_attendance_summary`)와 같은 규칙이다: 내가 직접 배정된 현장 반만 · 배정된 날부터 · 끝난 수업 = 끝나고 30분.
 * 읽는 것은 전부 `auth.uid()` 로 거르는 DB 함수다 (등급 체계 10 — 스태프에게 열린 표를 직접 읽지 않는다).
 */
export default async function MyAttendanceRecordPage() {
  const supabase = await createClient();
  const today = todayKST();
  // 로그인 확인과 출석 기록을 함께 받는다 (2026-10-09 화면 전환 속도)
  const [, { data: dayRows }, { data: rateRows }] = await Promise.all([
    requireUser("/my/attendance/record"),
    supabase.rpc("my_attendance_days"),
    supabase.rpc("my_attendance_summary"),
  ]);

  const all = dayRows ?? [];
  const termIds = pickRecordTerms(all, today);
  const shown = all.filter((r) => termIds.includes(r.term_id));
  const terms = termIds
    .map((id) => shown.find((r) => r.term_id === id))
    .filter((t): t is NonNullable<typeof t> => !!t)
    .map((t) => ({ id: t.term_id, month: t.month, opens: t.opens, closes: t.closes }));
  const upcoming = terms.length > 0 && terms.every((t) => t.opens > today);
  const rate = (rateRows ?? []).filter((r) => termIds.includes(r.term_id));

  const days = shown.map((r) => ({ ...r, d: r.class_date, st: r.status, order: r.time_block, kind: dayMark({ done: r.done, st: r.status, late: r.late }) }));
  const counts = countDays(days);
  const streak = streakOf(days);
  const label = (r: (typeof days)[number]) => [r.course_name, r.time_block].filter(Boolean).join(" ");
  const stamps: CalendarStamp[] = days.map((r) => ({ date: r.d, kind: r.kind, label: `${md(r.d)} ${label(r)} — ${MARK_STYLE[r.kind].label}` }));
  const months = days.length ? monthsBetween(days[0].d, days[days.length - 1].d) : [];
  const shownKinds = new Set<MarkKind>(days.map((r) => r.kind));
  const history = days.filter((r) => r.done || r.kind === "checked_in").reverse();

  const action = (
    <Link href="/my/attendance" className="btn-primary">
      <Icon name="camera" size={18} />
      출석 찍기
    </Link>
  );

  if (terms.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader icon="success" title="내 출석" description="개강일부터 종강일까지 내 현장 수업 출석이 도장으로 쌓여요.">
          {action}
        </PageHeader>
        <EmptyState
          icon="location"
          title="출석을 세는 현장 수업이 아직 없어요"
          description="현장 수업 반에 배정되면 개강일부터 여기에 출석 도장이 쌓여요. 불라방·인강 수업은 출석을 찍지 않아요."
        />
      </div>
    );
  }

  const period = { opens: terms.map((t) => t.opens).sort()[0], closes: terms.map((t) => t.closes).sort().at(-1)! };

  return (
    <div className="space-y-6">
      <PageHeader
        icon="success"
        title="내 출석"
        description={`${terms.map((t) => `${t.month}월`).join("·")} 기수 · ${md(period.opens)} 개강 ~ ${md(period.closes)} 종강. 종강일이 지나면 다음 달 기수로 새로 쌓여요.`}
      >
        {action}
      </PageHeader>

      {upcoming ? (
        <section className="card bg-brand-50/60 p-5 sm:p-6">
          <p className="text-lg font-black text-ink">{md(period.opens)} 개강일부터 출석을 찍어요</p>
          <p className="mt-1 text-sm text-slate">아래 달력의 수업일마다 강의실 앞 출석 QR 을 찍으면 출석 도장이 쌓여요.</p>
        </section>
      ) : (
        <section aria-label="연속 출석" className="card overflow-hidden">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3 bg-gradient-to-r from-brand-500 to-brand-400 px-5 py-5 text-white sm:px-6">
            {/* 분홍 띠 위라 도장을 흰 바탕에 분홍 체크로 뒤집는다 (분홍 도장은 띠에 묻힌다) */}
            <span aria-hidden className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-brand-600 shadow-pink">
              <svg viewBox="0 0 16 16" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
                <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
              </svg>
            </span>
            <div className="min-w-0">
              {streak > 0 ? (
                <p className="text-2xl font-black tracking-tight sm:text-3xl">
                  <span className="tabular-nums">{streak}</span>회 연속 출석 중!
                </p>
              ) : (
                <p className="text-xl font-black tracking-tight sm:text-2xl">{counts.past === 0 ? "첫 수업부터 출석 도장을 모아 봐요" : "다음 수업부터 다시 연속 출석을 쌓아요"}</p>
              )}
              <p className="mt-0.5 text-sm font-bold text-white/90">
                이번 달 출석 도장 <span className="tabular-nums">{counts.present}</span>개 · 남은 수업 <span className="tabular-nums">{counts.total - counts.past}</span>회
              </p>
            </div>
          </div>
        </section>
      )}

      {!upcoming && <AttendanceRate rows={rate} link={false} />}

      <Reveal>
        <section aria-labelledby="stamp-title" className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h2 id="stamp-title" className="text-base font-black text-ink">
              출석 달력
            </h2>
            <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold text-slate" aria-label="도장 설명">
              {MARK_ORDER.filter((k) => shownKinds.has(k)).map((k) => (
                <li key={k} className="flex items-center gap-1">
                  <AttendanceMark kind={k} size="xs" />
                  {k === "in_only" ? "퇴실 안 찍음" : k === "missing" ? "미출석" : MARK_STYLE[k].label}
                </li>
              ))}
            </ul>
          </div>
          {months.map((m) => (
            <AttendanceCalendar key={`${m.year}-${m.month}`} year={m.year} month={m.month} stamps={stamps} today={today} />
          ))}
          <p className="text-xs text-slate">들어올 때 한 번, 수업이 끝나고 나갈 때 한 번 찍어야 출석 도장이 찍혀요. 선생님이 출석 인정한 날도 도장이 찍혀요.</p>
        </section>
      </Reveal>

      {history.length > 0 && (
        <Reveal delay={100}>
          <section aria-labelledby="history-title" className="card p-5 sm:p-6">
            <h2 id="history-title" className="text-base font-black text-ink">
              지난 수업 기록
            </h2>
            <ul className="mt-3 divide-y divide-line">
              {history.map((r) => (
                <li key={`${r.d}-${r.section_id}`} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-bold text-ink">
                      {formatDate(r.d, { month: "long", day: "numeric", weekday: "short" })} · {label(r)}
                    </p>
                    <p className="text-xs text-slate">
                      {[kstTime(r.check_in_at) && `입실 ${kstTime(r.check_in_at)}`, kstTime(r.check_out_at) && `퇴실 ${kstTime(r.check_out_at)}`, r.decided_note && `선생님 메모: ${r.decided_note}`]
                        .filter(Boolean)
                        .join(" · ") || (r.kind === "missing" ? "출석 기록이 없어요" : "선생님이 처리했어요")}
                    </p>
                  </div>
                  <span className="flex shrink-0 items-center gap-1.5 text-xs font-bold text-ink">
                    <AttendanceMark kind={r.kind} size="xs" />
                    {r.kind === "in_only" ? "퇴실 안 찍음" : MARK_STYLE[r.kind].label}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </Reveal>
      )}
    </div>
  );
}
