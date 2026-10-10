import Link from "next/link";
import { AttendanceMark } from "@/components/ui/AttendanceMark";
import { dayMark, MARK_ORDER, MARK_STYLE, type BoardRow, type DayCounts, type MarkKind } from "@/lib/attendance-board";
import { cn } from "@/lib/utils";

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
const weekday = (d: string) => WEEKDAY[new Date(`${d}T00:00:00Z`).getUTCDay()];

/**
 * 기수 출석 한눈에 보기 — 학생 × 수업일 격자 (2026-10-01 Alan — "강사들이 지각생들과 결석생들을 알아보고 관리" ·
 * "강사모드에서 학생들 출결상태를 편하게 볼 수 있으면"). 비대면 인증 현황의 "한눈에 보기"(CheckinRoster)와 같은 꼴이다.
 *
 * - 줄은 **결석·미출석이 많은 학생 → 지각 → 이름** 순이고 테스터는 맨 아래다 (`rankBoard`).
 * - 칸은 그 학생의 그 날 수업 하나 — 도장(`AttendanceMark`)이다. 그 날 수업이 없는 학생은 빈칸이다 (주3일 학생은 반대 트랙 날이 비어 있다).
 * - 날짜 머리글을 누르면 그 날 명단(날짜별)으로 간다 — 고치는 일은 거기서 한다. 머리글의 빨간 숫자는 그 날 결석·미출석 수.
 * - 한 달 수업일이 20일 안팎이라 가로로 밀리는 것은 어쩔 수 없다 — **이름 칸만 왼쪽에 고정**한다.
 *   칸 안에 `sr-only` 자식을 두지 않는다 (가로 스크롤 상자를 빠져나가 화면 전체가 옆으로 밀린다) — 설명은 `aria-label`·`title`.
 * 서버 컴포넌트다 — 칸이 많아도 브라우저로 자바스크립트를 실어 보내지 않는다.
 */
export function AttendanceBoard({
  title,
  rows,
  dates,
  today,
  classes,
  sectionLabel,
  dayHref,
  linkStudents = true,
}: {
  title: string;
  rows: (BoardRow & { counts: DayCounts })[];
  dates: string[];
  today: string;
  /** 학생 → 듣는 반 (주5일은 한 줄로 합친 이름) */
  classes: Record<string, string[]>;
  /** 반 id → 짧은 이름 (칸 설명에 쓴다) */
  sectionLabel: Record<number, string>;
  dayHref: (date: string) => string;
  /** 이름을 학생 관리로 잇나 — 조교에게는 학생명단 · 학생 관리가 없어 글자로만 둔다 (2026-10-03) */
  linkStudents?: boolean;
}) {
  if (rows.length === 0) {
    return <p className="card p-6 text-center text-sm text-slate">이 기수에 출석을 찍는 현장 수강생이 없어요. 불라방·인강 학생은 출석을 찍지 않아요.</p>;
  }

  // 날짜마다 결석·미출석 수, 화면에 나온 도장 종류 (범례는 나온 것만 적는다)
  const problems = new Map<string, number>();
  const shown = new Set<MarkKind>();
  for (const r of rows) {
    for (const d of r.days) {
      const k = dayMark(d);
      shown.add(k);
      if (k === "absent" || k === "missing") problems.set(d.d, (problems.get(d.d) ?? 0) + 1);
    }
  }
  const students = rows.filter((r) => !r.tester).length;
  const flagged = rows.filter((r) => !r.tester && r.counts.absent + r.counts.missing > 0).length;
  const lateOnes = rows.filter((r) => !r.tester && r.counts.late > 0).length;
  const total = rows.filter((r) => !r.tester).reduce((a, r) => ({ past: a.past + r.counts.past, present: a.present + r.counts.present }), { past: 0, present: 0 });
  const rate = total.past > 0 ? Math.round((total.present / total.past) * 100) : null;

  return (
    <section aria-labelledby="board-title" className="card overflow-hidden">
      <div className="border-b border-line bg-brand-50/60 px-4 py-3">
        <h2 id="board-title" className="font-black text-ink">{title}</h2>
        <p className="mt-0.5 text-xs text-slate">
          학생 {students}명 × 수업일 {dates.length}일 · 끝난 수업 출석률 {rate === null ? "–" : `${rate}%`} · 결석·미출석이 있는 학생 {flagged}명 · 지각이 있는 학생 {lateOnes}명
        </p>
        <p className="mt-0.5 text-xs text-slate">결석·미출석이 많은 학생이 위로 와요. 날짜를 누르면 그 날 명단으로 가서 출석 인정·결석을 정하거나 결석 알림을 보낼 수 있어요.</p>
        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1.5 text-xs font-semibold text-slate" aria-label="도장 설명">
          {MARK_ORDER.filter((k) => shown.has(k)).map((k) => (
            <li key={k} className="flex items-center gap-1">
              <AttendanceMark kind={k} size="xs" />
              {k === "missing" ? "미출석 (안 찍음)" : MARK_STYLE[k].label}
            </li>
          ))}
        </ul>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-max text-sm">
          <thead className="bg-surface text-xs text-slate">
            <tr>
              <th className="sticky left-0 z-10 bg-surface px-4 py-2 text-left font-bold">이름</th>
              {dates.map((d) => (
                <th key={d} className={cn("px-0.5 py-1.5 text-center font-bold tabular-nums", d === today && "bg-brand-50 text-brand-700")}>
                  <Link href={dayHref(d)} className="block rounded-lg px-1 py-0.5 hover:bg-brand-50 hover:text-brand-700" aria-label={`${md(d)} ${weekday(d)}요일 명단 보기`}>
                    {md(d)}
                    <span className="block text-[10px] font-semibold">{weekday(d)}</span>
                    <span className={cn("block text-[10px] font-black", problems.get(d) ? "text-red-600" : "text-transparent")}>{problems.get(d) ?? 0}</span>
                  </Link>
                </th>
              ))}
              <th className="px-3 py-2 text-left font-bold">이번 달</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => {
              const flaggedRow = r.counts.absent + r.counts.missing > 0;
              const byDate = new Map<string, BoardRow["days"]>();
              for (const d of r.days) byDate.set(d.d, [...(byDate.get(d.d) ?? []), d]);
              const tint = flaggedRow ? "bg-red-50" : "bg-paper";
              return (
                <tr key={r.student_id} className={tint}>
                  <th scope="row" className={cn("sticky left-0 z-10 max-w-44 px-4 py-2 text-left align-middle font-normal", tint)}>
                    <span className="flex items-center gap-1.5">
                      {linkStudents ? (
                        <Link href={`/admin/students/${r.student_id}`} className="whitespace-nowrap font-bold text-ink hover:underline">
                          {r.student_name || "-"}
                        </Link>
                      ) : (
                        <span className="whitespace-nowrap font-bold text-ink">{r.student_name || "-"}</span>
                      )}
                      {r.tester && <span className="rounded-full bg-line px-1.5 py-0.5 text-[10px] font-bold text-slate">테스터</span>}
                    </span>
                    {(classes[r.student_id] ?? []).map((c, i) => (
                      <span key={i} className="block truncate text-[11px] font-semibold text-slate" title={c}>
                        {c}
                      </span>
                    ))}
                  </th>
                  {dates.map((d) => {
                    const list = byDate.get(d) ?? [];
                    return (
                      <td key={d} className={cn("px-0.5 py-2 text-center align-middle", d === today && "bg-brand-50/60")}>
                        <span className="inline-flex flex-col items-center gap-0.5">
                          {list.map((x) => {
                            const k = dayMark(x);
                            const times = x.at ? `${x.at}에 찍음` : "";
                            return (
                              <AttendanceMark
                                key={x.s}
                                kind={k}
                                label={`${r.student_name} ${md(d)} ${sectionLabel[x.s] ?? ""} — ${MARK_STYLE[k].label}${times ? ` (${times})` : ""}`}
                              />
                            );
                          })}
                        </span>
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 align-middle">
                    <span className="flex flex-nowrap items-center gap-1 whitespace-nowrap text-xs font-bold">
                      <span className="text-ink tabular-nums">
                        출석 {r.counts.present}/{r.counts.past}
                      </span>
                      {r.counts.late > 0 && <span className="rounded-full bg-sky-100 px-1.5 py-0.5 text-sky-800">지각 {r.counts.late}</span>}
                      {r.counts.absent > 0 && <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-red-700">결석 {r.counts.absent}</span>}
                      {r.counts.missing > 0 && <span className="rounded-full bg-red-50 px-1.5 py-0.5 text-red-700 ring-1 ring-red-200">미출석 {r.counts.missing}</span>}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
