import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { Reveal } from "@/components/ui/Reveal";
import { requireUser } from "@/lib/auth";
import { ATTENDANCE_STATUS } from "@/lib/attendance";
import { AttendanceCamera } from "@/components/my/AttendanceCamera";
import { AttendanceRate } from "@/components/my/AttendanceRate";
import { pickCurrentTerm, termWindow } from "@/lib/term-window";
import { createClient } from "@/lib/supabase/server";
import { cn, formatDate, todayKST, TRACK_LABEL } from "@/lib/utils";

export const metadata: Metadata = { title: "출석", robots: { index: false } };

const kstTime = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit" }) : null);
const md = (d: string) => formatDate(d, { month: "numeric", day: "numeric", weekday: "short" });

/**
 * 내 출석 (2026-09-21 Alan — "입실과 퇴실 다 받자"). 들어오면 **카메라가 바로 켜져** 강의실 앞 출석 QR 을 찍는다
 * (`AttendanceCamera`, 2026-09-22 Alan). 휴대폰 기본 카메라로 찍는 길(`/attend?t=…`)도 그대로 된다.
 * 그 아래 이번 기수 출석률(`AttendanceRate`)과 내 기록. (6자리 코드 입력은 2026-09-22 에 30초 화면 QR 과 함께 없앴다)
 * 현장 수강생만 찍는다 (불라방·인강 날은 대상이 아니다 — 판정은 DB 함수 attendance_scan).
 * **기록은 지금 기수의 개강일~종강일 것만** 보여 준다 (2026-09-22 Alan — "다음달로 넘어가면 예전기록은 빠지고 항상 새롭게").
 * 기수 고르기는 강사·조교 출석 화면과 같은 `pickCurrentTerm` 이다.
 */
export default async function MyAttendancePage() {
  const { user } = await requireUser("/my/attendance");
  const supabase = await createClient();
  const today = todayKST();
  const [{ data: termRows }, { data: rate }] = await Promise.all([
    supabase.from("terms").select("id, year, month, enrollment_opens_at, closes_at"),
    supabase.rpc("my_attendance_summary"),
  ]);
  // 내가 지금 듣는 기수(출석률과 같은 기준 — 오늘이 개강일~종강일 안인 내 반의 기수)를 모두 보여 준다.
  // 두 기수가 겹치는 며칠(종강일을 다음 기수 개강 뒤로 잡은 경우)에도 새 기수 기록이 빠지지 않게. 없으면 모두의 지금 기수
  const mine = new Set((rate ?? []).map((r) => r.term_id));
  const myTerms = (termRows ?? []).filter((t) => mine.has(t.id)).sort((x, y) => termWindow(x).opens.localeCompare(termWindow(y).opens));
  const fallback = pickCurrentTerm(termRows ?? [], today, { datedOnly: true });
  const shown = myTerms.length ? myTerms : fallback ? [fallback] : [];
  const term = shown[0] ?? null;
  const period = shown.length
    ? { opens: shown.map((t) => termWindow(t).opens).sort()[0], closes: shown.map((t) => termWindow(t).closes).sort().at(-1)! }
    : null;
  const shownIds = new Set(shown.map((t) => t.id));
  const { data: rawStamps } = period
    ? await supabase
        .from("attendance_stamps")
        .select("id, class_date, status, check_in_at, check_out_at, late, decided_note, section:class_sections(term_id, track, time_block, course:courses(name))")
        .eq("student_id", user.id)
        .gte("class_date", period.opens)
        .lte("class_date", period.closes)
        .order("class_date", { ascending: false })
    : { data: [] };
  const stamps = (rawStamps ?? []).filter((s) => !!s.section && shownIds.has(s.section.term_id));

  return (
    <div className="space-y-8">
      <PageHeader icon="location" title="출석" description="카메라가 켜지면 강의실 앞 출석 QR 을 네모 안에 비춰요. 들어올 때 한 번, 나갈 때 한 번이에요." />

      {/* 들어오자마자 카메라 (2026-09-22 Alan — "출석을 누르면 카메라를 바로 실행해서 촬영") */}
      <section aria-label="출석 QR 찍기" className="card p-4 sm:p-6">
        <AttendanceCamera />
        <p className="mt-3 text-center text-xs text-slate">
          들어올 때 찍으면 입실, 수업이 끝나고 나갈 때 한 번 더 찍으면 퇴실이에요. 휴대폰 기본 카메라로 QR 을 찍어도 돼요.
        </p>
      </section>

      <AttendanceRate rows={rate ?? []} link={false} />

      <Reveal delay={100}>
        <section aria-labelledby="history-title" className="card p-5 sm:p-6">
          <h2 id="history-title" className="text-base font-black text-ink">
            {term && period ? `${shown.map((t) => `${t.month}월`).join("·")} 기수 출석 기록` : "내 출석 기록"}
          </h2>
          {term && period && (
            <p className="mt-0.5 text-sm font-bold text-brand-600">
              {md(period.opens)} 개강 ~ {md(period.closes)} 종강
            </p>
          )}
          <p className="mt-1 text-xs text-slate">
            입실은 수업 시작 30분 전부터, 시작 7분 뒤부터는 지각이에요. 퇴실까지 찍어야 &ldquo;출석&rdquo; 이에요. 다음 달 기수가 시작되면 새로 쌓여요.
          </p>
          {period && today < period.opens && <p className="mt-2 text-sm font-bold text-amber-800">{md(period.opens)} 개강일부터 출석을 찍을 수 있어요.</p>}
          {stamps.length === 0 ? (
            <p className="mt-4 text-sm text-slate">이번 기수에 찍은 출석이 아직 없어요. 현장 수업이 있는 날 강의실에서 찍어 주세요.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {stamps.map((s) => {
                const st = ATTENDANCE_STATUS[s.status] ?? ATTENDANCE_STATUS.none;
                return (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-bold text-ink">
                        {formatDate(s.class_date, { month: "long", day: "numeric", weekday: "short" })} · {s.section?.course?.name ?? "강좌"}{" "}
                        {s.section?.track ? TRACK_LABEL[s.section.track] : ""} {s.section?.time_block ?? ""}
                      </p>
                      <p className="text-xs text-slate">
                        {[kstTime(s.check_in_at) && `입실 ${kstTime(s.check_in_at)}`, kstTime(s.check_out_at) && `퇴실 ${kstTime(s.check_out_at)}`, s.decided_note && `선생님 메모: ${s.decided_note}`]
                          .filter(Boolean)
                          .join(" · ") || "선생님이 처리했어요"}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {s.late && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-bold text-sky-800">지각</span>}
                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", st.className)}>{st.label}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </Reveal>
    </div>
  );
}
