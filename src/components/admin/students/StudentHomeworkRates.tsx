import Link from "next/link";
import { SUBJECT_LABEL } from "@/lib/homework";
import { HOMEWORK_DUE_LABEL, MISSING_STATUS_LABEL, missingStatus } from "@/lib/homework-missing";
import { hasManyLevels, missingSlotLabel, type HomeworkMonthRate } from "@/lib/homework-rate";
import { cn, formatDate } from "@/lib/utils";
import { STATUS_BADGE, STATUS_DOT } from "@/components/admin/homework/status-tone";

/** 안 낸 숙제를 한 달에 몇 개까지 적나 — 넘으면 "외 N개" */
const MISSING_SHOWN = 12;

const md = (d: string) => formatDate(d, { month: "numeric", day: "numeric" });

/**
 * 학생 관리의 **숙제 제출률 — 달마다** (2026-10-30). 숫자는 `src/lib/homework-rate.ts` — 숙제 미제출 알림과 같은 셈이라
 * 그 화면의 레벨 탭 제출률을 더한 것과 같다. 최근 달부터, 달마다 제출률 · 단계(개근 · 양호 · 주의 · 위험) · 막대 · 레벨 × 과목 · 안 낸 숙제.
 * 낸 숙제 사진 · 점검은 숙제점검의 이름 검색(`searchHref`)으로 본다.
 */
export function StudentHomeworkRates({ months, ok, today, searchHref }: { months: HomeworkMonthRate[]; ok: boolean; today: string; searchHref: string | null }) {
  if (!ok) {
    return <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">숙제 기록을 다 읽지 못했어요. 잠시 후 새로고침해 주세요.</p>;
  }
  if (months.length === 0) {
    return <p className="rounded-xl bg-brand-50/60 px-4 py-6 text-center text-sm text-slate">아직 낼 숙제가 없어요. 반에 배정되면 그 달 수업마다 숙제가 생겨요.</p>;
  }
  return (
    <>
      <ul className="space-y-3">
        {months.map((m) => {
          const status = missingStatus(m.rate);
          const phase = today < m.opens ? "개강 전" : today <= m.closes ? "진행 중" : null;
          const withLevel = hasManyLevels(m);
          const shown = m.missing.slice(0, MISSING_SHOWN);
          return (
            <li key={m.termId} className="rounded-xl2 border border-line p-4">
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-black text-ink">
                      {m.year}년 {m.month}월
                    </span>
                    {phase && <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-bold text-slate ring-1 ring-line">{phase}</span>}
                  </p>
                  {m.classes && m.classes.length > 0 && <p className="mt-0.5 text-xs font-semibold text-ink-soft">{m.classes.join(" · ")}</p>}
                  <p className="text-xs text-mist">
                    {md(m.opens)} 개강 ~ {md(m.closes)} 종강
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {m.rate === null ? (
                    <span className="text-2xl font-black text-mist">시작 전</span>
                  ) : (
                    <span className="text-3xl font-black tracking-tight text-ink tabular-nums">
                      {m.rate}
                      <span className="ml-0.5 text-lg">%</span>
                    </span>
                  )}
                  {m.rate !== null && <span className={cn("rounded-md px-2 py-0.5 text-xs font-black", STATUS_BADGE[status])}>{MISSING_STATUS_LABEL[status]}</span>}
                </div>
              </div>

              <div
                role="progressbar"
                aria-label={`${m.month}월 숙제 제출률`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={m.rate ?? 0}
                className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-surface"
              >
                <div className={cn("h-full rounded-full", STATUS_DOT[status])} style={{ width: `${m.rate ?? 0}%` }} />
              </div>

              <p className="mt-2 text-sm text-ink">
                {m.past > 0 ? (
                  <>
                    기한이 지난 숙제 <b className="tabular-nums">{m.past}</b>개 중 <b className="tabular-nums">{m.done}</b>개 냄
                  </>
                ) : (
                  "아직 기한이 지난 숙제가 없어요"
                )}
                {m.upcoming > 0 && (
                  <span className="text-slate">
                    {" "}
                    · 기한 전 {m.upcoming}개{m.upcomingDone > 0 ? ` (${m.upcomingDone}개 냄)` : ""}
                  </span>
                )}
              </p>

              {/* 레벨 × 과목 — 단과면 한 칸, 120분 · 주5일이면 RC · LC, 속성반이면 두 레벨 */}
              <p className="mt-2 flex flex-wrap gap-1.5">
                {m.lines.map((l) => (
                  <span key={`${l.level}-${l.subject}`} className="rounded-md bg-surface px-2 py-0.5 text-xs font-bold text-ink-soft ring-1 ring-line tabular-nums">
                    {l.level} {SUBJECT_LABEL[l.subject]} {l.past > 0 ? `${l.done}/${l.past}` : "기한 전"}
                  </span>
                ))}
              </p>

              {m.missing.length > 0 && (
                <p className="mt-2 text-xs leading-relaxed text-red-700">
                  <b>안 낸 숙제 {m.missing.length}개</b> · {shown.map((x) => missingSlotLabel(x, withLevel)).join(" · ")}
                  {m.missing.length > shown.length ? ` 외 ${m.missing.length - shown.length}개` : ""}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs text-mist">
        숙제 기한은 같은 트랙의 다음 수업일 {HOMEWORK_DUE_LABEL}예요. 기한이 지난 숙제 중 낸 비율이고, 늦게 낸 숙제도 냄으로 세요 — 숙제 미제출 알림과 같은 셈이에요.
        {searchHref && (
          <>
            {" "}
            <Link href={searchHref} className="font-bold text-brand-600 hover:underline">
              낸 숙제 사진 · 점검은 숙제점검에서 →
            </Link>
          </>
        )}
      </p>
    </>
  );
}
