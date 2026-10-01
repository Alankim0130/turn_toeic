import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Icon } from "@/components/ui/Icon";
import { LiveLinkField } from "@/components/admin/live/LiveLinkField";
import { requireStaff } from "@/lib/auth";
import { compareSessions, forInstructor, nowKst, pickFocus, sessionState } from "@/lib/live-links";
import { createClient } from "@/lib/supabase/server";
import { shiftDate } from "@/lib/term-window";
import { cn, formatDate, TRACK_LABEL } from "@/lib/utils";
import { getLiveLinkSessions, type LiveLinkSession } from "../_lib/live-links";

export const metadata: Metadata = { title: "불라방 링크", robots: { index: false } };

/** 앞으로 몇 날까지 보여 줄까 — 오늘 + 앞으로 올 수업일 둘 (링크를 미리 넣어 둘 수 있게) */
const UPCOMING_DAYS = 3;

const SUBJECT = (s: string | null) => (s === "lc" ? "LC" : s === "rc" ? "RC" : null);
const dayLabel = (d: string, today: string) =>
  d === today ? "오늘" : d === shiftDate(today, 1) ? "내일" : formatDate(d, { month: "long", day: "numeric", weekday: "short" });

/** `750+ 유형마스터 · 월수금 10:00~11:00` */
function sessionName(s: LiveLinkSession) {
  return [s.courseName, [TRACK_LABEL[s.track] ?? s.track, s.time_block].filter(Boolean).join(" ")].join(" · ");
}

/**
 * 불라방 링크 (2026-09-30 Alan — "불라방은 zoom으로 올리고, 다시보기는 유튜브로 따로 한 번 더 업로드 예정. 그래서 불라방 링크를
 * 쉽게 올릴 수 있도록 강사 대시보드에서 불라방 위젯을 하나 만들어주면 좋겠어. 위젯에 들어가면 현재 시간을 기준점으로 최상단에
 * 링크를 올릴 수 있는 공간이 나오고" · "불라방 링크는 강사아이디별로 나오면 좋겠어. 다른강사는 안 보여줘도 괜찮아").
 *
 * - 맨 위는 **지금 하는 수업**(시작 30분 전 ~ 끝) 또는 앞으로 올 가장 가까운 수업이다 (`pickFocus`).
 * - 강사는 **자기 반 + 담당이 빈 반**만 본다 (`forInstructor`). 관리자는 수업을 맡지 않으므로 전부 본다.
 * - 저장은 반 상세의 회차 표와 같은 액션이다 → 회차 링크(`session_live_links`). 누가 보는지는 RLS(`has_section_access`)가 정한다:
 *   그 반에 배정된 수강생(현장·불라방 모두) + 그 시간을 품는 120분·속성반 수강생. 불라방 수강생에게는 수업 시작 알림이 간다.
 */
export default async function LiveLinksPage() {
  // 조교는 이 화면을 쓸 수 없다 — 레이아웃이 조교를 통과시키므로 화면마다 막는다
  const { user, profile } = await requireStaff();
  const supabase = await createClient();
  const { date: today, minutes } = nowKst();
  const all = await getLiveLinkSessions(supabase, { from: today, to: shiftDate(today, 13) });
  const instructorView = profile.role === "instructor";
  const list = (instructorView ? forInstructor(all, user.id) : all).sort(compareSessions);

  const { focus, state } = pickFocus(list, today, minutes);
  const focusIds = new Set(focus.map((f) => f.id));
  const later = list.filter((r) => !focusIds.has(r.id) && sessionState(r, today, minutes) !== "past");
  const days = [...new Set(later.map((r) => r.date))].slice(0, UPCOMING_DAYS);
  const pastToday = list.filter((r) => r.date === today && !focusIds.has(r.id) && sessionState(r, today, minutes) === "past");

  const who = (s: LiveLinkSession) =>
    instructorView ? (s.instructorId === null ? "담당 강사 없음 — 두 선생님 모두에게 보여요" : null) : (s.instructorName ?? "담당 강사 없음");

  return (
    <>
      <PageHeader
        icon="live"
        title="불라방 링크"
        description={
          instructorView
            ? `${profile.name} 선생님 수업만 보여요. Zoom 입장 링크를 붙여 넣고 저장하면 그 반 수강생 불라방 화면에 바로 떠요.`
            : "강사님 수업 전체예요 (강사님 화면에는 본인 수업만 보여요). Zoom 입장 링크를 붙여 넣고 저장하면 그 반 수강생 불라방 화면에 바로 떠요."
        }
      />

      {list.length === 0 ? (
        <section className="card flex flex-col items-center gap-2 p-8 text-center">
          <Icon name="calendar" size={40} />
          <p className="font-black text-ink">앞으로 2주 안에 {instructorView ? "담당" : ""} 수업이 없어요</p>
          <p className="max-w-md text-sm text-slate">
            담당 강사는 시간표 설정의 과목(LC · RC)으로 저절로 정해져요. 수업일은 반 편성 달력에서 정합니다.
          </p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <Link href="/admin/timetable" className="btn-secondary !py-2 text-sm">시간표 설정 →</Link>
            <Link href="/admin/sections" className="btn-ghost !py-2 text-sm">반 편성 →</Link>
          </div>
        </section>
      ) : (
        <div className="space-y-6">
          {/* 맨 위 — 지금(또는 다음) 수업 */}
          <section aria-labelledby="focus-title" className="card overflow-hidden border-brand-300 ring-2 ring-brand-200">
            <div className="flex flex-wrap items-center gap-2 bg-gradient-to-r from-brand-600 to-brand-500 px-5 py-3 text-white">
              <Icon name="live" size={24} className="brightness-0 invert" />
              <h2 id="focus-title" className="text-lg font-black">
                {state === "now" ? "지금 수업" : "다음 수업"}
              </h2>
              {focus[0] && <span className="text-sm font-bold text-white/85">{dayLabel(focus[0].date, today)}</span>}
            </div>
            {focus.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate">오늘은 남은 수업이 없어요.</p>
            ) : (
              <ul className="divide-y divide-line">
                {focus.map((s) => (
                  <li key={s.id} className="space-y-3 px-5 py-4">
                    <SessionHead s={s} who={who(s)} today={today} minutes={minutes} big />
                    <LiveLinkField sessionDateId={s.id} sectionId={s.sectionId} current={s.link?.url ?? null} label={`${sessionName(s)} ${s.seq}회차`} big />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <aside className="rounded-xl2 border border-line bg-surface px-5 py-4 text-sm text-slate">
            <p className="font-black text-ink">저장하면 누가 보나요</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-5">
              <li>
                그 반 수강생 — <b className="text-ink">현장 · 불라방 모두</b> — 과 그 시간을 품는 120분 · 속성반 수강생의 <b className="text-ink">불라방</b> 화면에 바로 떠요.
                다른 레벨 · 다른 시간 학생에게는 안 보여요.
              </li>
              <li>불라방 수강생에게는 &ldquo;불라방이 시작됐어요&rdquo; 알림이 가요 — 수업 15분 전부터는 저장하는 순간, 그 전에 넣어 두면 수업 시각에.</li>
              <li>
                {/* 2026-10-01 Alan — "불라방도 유튜브 링크를 가져와서 바로 연결" */}
                <b className="text-ink">비워 두면</b> Zoom 의 유튜브 송출이 잡힐 때 그 주소가 저절로 들어가고(
                <Link href="/admin/live-channels" className="font-bold text-brand-600 hover:underline">유튜브 자동 연결</Link>), 수업이 끝나면 다시보기로 올라가요.
                Zoom 링크를 직접 넣어 두면 그대로 두고 덮어쓰지 않아요 — Zoom 링크는 다시보기로 올라가지 않으니 녹화본은{" "}
                <Link href="/admin/replays" className="font-bold text-brand-600 hover:underline">다시보기 등록</Link>에서 붙여 주세요.
              </li>
            </ul>
          </aside>

          {days.map((d) => {
            const rows = later.filter((r) => r.date === d);
            return (
              <section key={d} aria-labelledby={`day-${d}`} className="card overflow-hidden">
                <h2 id={`day-${d}`} className="border-b border-line bg-brand-50/60 px-5 py-2.5 text-sm font-black text-ink">
                  {dayLabel(d, today)}
                  {d !== today && <span className="ml-1.5 font-bold text-slate">미리 넣어 둘 수 있어요</span>}
                </h2>
                <ul className="divide-y divide-line">
                  {rows.map((s) => (
                    <li key={s.id} className="space-y-2 px-5 py-3">
                      <SessionHead s={s} who={who(s)} today={today} minutes={minutes} />
                      <LiveLinkField sessionDateId={s.id} sectionId={s.sectionId} current={s.link?.url ?? null} label={`${sessionName(s)} ${s.seq}회차`} />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}

          {pastToday.length > 0 && (
            <details className="card overflow-hidden">
              <summary className="cursor-pointer px-5 py-3 text-sm font-black text-slate">오늘 지난 수업 {pastToday.length}개</summary>
              <ul className="divide-y divide-line border-t border-line">
                {pastToday.map((s) => (
                  <li key={s.id} className="space-y-2 px-5 py-3">
                    <SessionHead s={s} who={who(s)} today={today} minutes={minutes} />
                    <LiveLinkField sessionDateId={s.id} sectionId={s.sectionId} current={s.link?.url ?? null} label={`${sessionName(s)} ${s.seq}회차`} />
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </>
  );
}

function SessionHead({ s, who, today, minutes, big = false }: { s: LiveLinkSession; who: string | null; today: string; minutes: number; big?: boolean }) {
  const st = sessionState(s, today, minutes);
  const subject = SUBJECT(s.subject);
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className={cn("font-black text-ink", big ? "text-lg" : "text-sm")}>{s.time_block ?? "시간 미정"}</span>
      {subject && <span className="rounded-full bg-ink px-2 py-0.5 text-[11px] font-black text-white">{subject}</span>}
      <span className={cn("min-w-0 font-bold text-ink-soft", big ? "text-base" : "text-sm")}>
        {s.courseName} · {TRACK_LABEL[s.track] ?? s.track}
      </span>
      <span className="text-xs text-slate">{s.seq}회차</span>
      {st === "now" && <span className="rounded-full bg-brand-500 px-2 py-0.5 text-[11px] font-black text-white">진행 중 · 곧 시작</span>}
      {st === "past" && <span className="rounded-full bg-line px-2 py-0.5 text-[11px] font-bold text-slate">지남</span>}
      {who && <span className="w-full text-xs font-semibold text-mist sm:ml-auto sm:w-auto">{who}</span>}
    </div>
  );
}
