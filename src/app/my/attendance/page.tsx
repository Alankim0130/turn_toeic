import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { Reveal } from "@/components/ui/Reveal";
import { requireUser } from "@/lib/auth";
import { ATTENDANCE_STATUS } from "@/lib/attendance";
import { createClient } from "@/lib/supabase/server";
import { cn, formatDate, TRACK_LABEL } from "@/lib/utils";

export const metadata: Metadata = { title: "출석", robots: { index: false } };

const kstTime = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit" }) : null);

/**
 * 내 출석 (2026-09-21 Alan — "입실과 퇴실 다 받자"). 찍는 것은 강의실 앞 출석 QR 포스터를 휴대폰 기본 카메라로 —
 * 여기는 찍는 법과 내 기록만 보여 준다 (6자리 코드 입력은 2026-09-22 에 30초 화면 QR 과 함께 없앴다).
 * 현장 수강생만 찍는다 (불라방·인강 날은 대상이 아니다 — 판정은 DB 함수 attendance_scan).
 */
export default async function MyAttendancePage() {
  const { user } = await requireUser("/my/attendance");
  const supabase = await createClient();
  const { data: stamps } = await supabase
    .from("attendance_stamps")
    .select("id, class_date, status, check_in_at, check_out_at, late, decided_note, section:class_sections(track, time_block, course:courses(name))")
    .eq("student_id", user.id)
    .order("class_date", { ascending: false })
    .limit(60);

  return (
    <div className="space-y-8">
      <PageHeader icon="location" title="출석" description="강의실 앞에 붙은 출석 QR 을 휴대폰 기본 카메라로 찍어요. 들어올 때 한 번, 나갈 때 한 번이에요." />

      <Reveal className="card p-5 sm:p-6">
        <h2 className="text-base font-black text-ink">찍는 법</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate">
          <li>휴대폰 <b className="text-ink">기본 카메라</b>를 켜고 강의실 앞 출석 QR 에 대요. 뜨는 주소를 누르면 출석 화면이 열려요.</li>
          <li>들어올 때 찍으면 <b className="text-ink">입실</b>, 수업이 끝나고 나갈 때 한 번 더 찍으면 <b className="text-ink">퇴실</b>이에요.</li>
          <li>아이폰은 카메라가 사파리로 열어요 — 로그인하라고 나오면 <b className="text-ink">처음 한 번만</b> 로그인해 두세요.</li>
        </ol>
      </Reveal>

      <Reveal delay={100}>
        <section aria-labelledby="history-title" className="card p-5 sm:p-6">
          <h2 id="history-title" className="text-base font-black text-ink">내 출석 기록</h2>
          <p className="mt-1 text-xs text-slate">입실은 수업 시작 30분 전부터, 시작 7분 뒤부터는 지각이에요. 퇴실까지 찍어야 &ldquo;출석&rdquo; 이에요.</p>
          {(stamps ?? []).length === 0 ? (
            <p className="mt-4 text-sm text-slate">아직 찍은 출석이 없어요. 현장 수업이 있는 날 강의실에서 찍어 주세요.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {(stamps ?? []).map((s) => {
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
