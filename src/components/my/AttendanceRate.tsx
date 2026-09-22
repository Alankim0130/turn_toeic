import Link from "next/link";
import { attendanceRate, type MyAttendanceSummary } from "@/lib/attendance";
import { formatDate } from "@/lib/utils";

type Row = MyAttendanceSummary & { term_id: number; month: number; opens: string; closes: string };

const md = (d: string) => formatDate(d, { month: "numeric", day: "numeric" });

/**
 * 내 출석률 카드 (2026-09-22 Alan — "본인의 신청등급에 따라 출석률을 몇 퍼센트 채우고 있는지 마이페이지에서 확인하면 동기부여").
 * 숫자는 DB `public.my_attendance_summary()` — 지금 기수(개강일~종강일)의 내 현장 반만 센다. 다음 달 기수가 시작되면 새로 센다.
 * 현장 수업이 없는 학생(불라방 · 인강만 · 기수 밖)은 줄이 없어 카드를 그리지 않는다.
 */
export function AttendanceRate({ rows, link = true }: { rows: Row[]; link?: boolean }) {
  if (rows.length === 0) return null;
  return (
    <>
      {rows.map((r) => {
        const { rate, fill, left } = attendanceRate(r);
        const cheer =
          rate === null
            ? "첫 수업부터 출석을 채워 봐요."
            : rate === 100
              ? "한 번도 빠지지 않았어요. 이대로 끝까지!"
              : rate >= 80
                ? "잘하고 있어요. 남은 수업도 꼭 채워요."
                : "빠진 수업이 있어요. 남은 수업부터 다시 채워 봐요.";
        return (
          <section key={r.term_id} aria-labelledby={`rate-${r.term_id}`} className="card p-5 sm:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id={`rate-${r.term_id}`} className="text-lg font-black text-ink">
                {r.month}월 출석률
              </h2>
              <span className="text-xs font-bold text-slate">
                {md(r.opens)} 개강 ~ {md(r.closes)} 종강
              </span>
            </div>
            <div className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-1">
              <p className="text-5xl font-black tracking-tight text-brand-600 tabular-nums">
                {rate ?? "–"}
                <span className="ml-0.5 text-2xl">%</span>
              </p>
              <p className="pb-1.5 text-sm text-slate">{r.past > 0 ? `끝난 수업 ${r.past}회 중 ${r.present}회 출석` : "아직 끝난 수업이 없어요"}</p>
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-ink">
                  이번 달 {r.total}회 중 {r.present}회 채웠어요
                </span>
                <span className="text-slate">남은 수업 {left}회</span>
              </div>
              <div
                role="progressbar"
                aria-label={`${r.month}월 수업 ${r.total}회 중 ${r.present}회 출석`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={fill}
                className="mt-1.5 h-3 w-full overflow-hidden rounded-full bg-brand-50"
              >
                <div className="h-full rounded-full bg-brand-500 transition-[width] duration-700" style={{ width: `${fill}%` }} />
              </div>
            </div>

            <p className="mt-3 flex flex-wrap gap-1.5 text-xs font-bold">
              {r.late > 0 && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-sky-800">지각 {r.late}</span>}
              {r.in_only > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">퇴실 안 찍음 {r.in_only}</span>}
              {r.absent > 0 && <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-700">결석 {r.absent}</span>}
              {r.missing > 0 && <span className="rounded-full bg-line px-2 py-0.5 text-slate">미출석 {r.missing}</span>}
            </p>
            <p className="mt-2 text-sm font-bold text-ink">{cheer}</p>
            <p className="mt-1 text-xs text-slate">퇴실까지 찍어야 출석으로 세요. 선생님이 출석 인정한 날도 들어가요.</p>
            {link && (
              <Link href="/my/attendance" className="mt-3 inline-block text-sm font-bold text-brand-600 hover:underline">
                출석 찍기 · 내 기록 →
              </Link>
            )}
          </section>
        );
      })}
    </>
  );
}
