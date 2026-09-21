import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { requireCrew } from "@/lib/auth";
import { ATTENDANCE_STATUS } from "@/lib/attendance";
import { createClient } from "@/lib/supabase/server";
import { cn, formatDate, todayKST, TRACK_LABEL } from "@/lib/utils";
import { setAttendance } from "./actions";

export const metadata: Metadata = { title: "출석", robots: { index: false } };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const shift = (d: string, days: number) => {
  const t = new Date(`${d}T00:00:00+09:00`);
  t.setUTCDate(t.getUTCDate() + days);
  return t.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
};
const kstTime = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit" }) : null);

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

/**
 * 출석 명단 (2026-09-21 Alan — "입실과 퇴실 다 받자! 조교에게도 명단을 열어줘"). **강사·관리자·조교.**
 * 날짜마다 그 날 수업이 있는 반의 현장 수강생과 도장. 출석 인정·결석은 사유를 꼭 적는다 — 자동 판정이 덮지 못한다.
 */
export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ date?: string; ok?: string; error?: string }> }) {
  // 조교에게도 열린 화면이다 — 레이아웃이 조교를 통과시키므로 화면마다 가드를 둔다
  await requireCrew();
  const { date: dateParam, ok, error } = await searchParams;
  const today = todayKST();
  const date = dateParam && DATE_RE.test(dateParam) ? dateParam : today;
  const supabase = await createClient();
  const { data, error: rosterError } = await supabase.rpc("attendance_roster", { p_date: date });
  const rows = (data ?? []) as Row[];

  const sections = new Map<number, { head: Row; rows: Row[] }>();
  for (const r of rows) {
    const s = sections.get(r.section_id) ?? { head: r, rows: [] };
    s.rows.push(r);
    sections.set(r.section_id, s);
  }
  const count = (list: Row[], st: string | null) => list.filter((r) => (r.status ?? null) === st).length;

  return (
    <>
      <PageHeader icon="success" title="출석" description="강의실 QR 로 찍은 입실·퇴실이에요. 퇴실까지 찍어야 출석이고, 기기 문제 등은 사유를 적어 출석 인정으로 바꿔 주세요.">
        <Link href="/admin/attendance/qr" className="btn-primary">
          <Icon name="success" size={18} />
          교실에 QR 띄우기
        </Link>
      </PageHeader>

      {ok && <Alert kind="success" className="mb-4">저장했어요.</Alert>}
      {error && (
        <Alert kind="warning" className="mb-4">
          {error === "note" ? "출석 인정·결석은 사유를 적어야 해요." : error === "invalid" ? "잘못된 요청이에요." : "저장하지 못했어요. 다시 시도해 주세요."}
        </Alert>
      )}
      {rosterError && <Alert kind="warning" className="mb-4">명단을 불러오지 못했어요.</Alert>}

      <nav aria-label="날짜" className="mb-6 flex flex-wrap items-center gap-2">
        <Link href={`/admin/attendance?date=${shift(date, -1)}`} className="btn-ghost !px-3 !py-2 text-sm">‹ 전날</Link>
        <span className="rounded-xl bg-surface px-4 py-2 text-sm font-black text-ink">
          {formatDate(date, { year: "numeric", month: "long", day: "numeric", weekday: "short" })}
          {date === today && <span className="ml-2 rounded-full bg-brand-500 px-2 py-0.5 text-xs text-white">오늘</span>}
        </span>
        <Link href={`/admin/attendance?date=${shift(date, 1)}`} className="btn-ghost !px-3 !py-2 text-sm">다음날 ›</Link>
        {date !== today && <Link href="/admin/attendance" className="text-sm font-bold text-brand-600 hover:underline">오늘로</Link>}
      </nav>

      {sections.size === 0 ? (
        <EmptyState icon="success" title="이 날 현장 수업이 있는 학생이 없어요" description="수업일이 아니거나, 이 날 수업을 듣는 현장 수강생이 없어요. 불라방·인강 학생은 출석을 찍지 않아요." />
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
    </>
  );
}
