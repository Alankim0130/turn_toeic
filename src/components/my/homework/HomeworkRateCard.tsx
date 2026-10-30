import Link from "next/link";
import { HOMEWORK_DUE_LABEL } from "@/lib/homework-missing";
import { hasManyLevels, missingSlotLabel, type HomeworkMonthRate } from "@/lib/homework-rate";
import { formatDate } from "@/lib/utils";

/** 안 낸 숙제를 몇 개까지 적나 — 넘으면 "외 N개" */
const MISSING_SHOWN = 6;

const md = (d: string) => formatDate(d, { month: "numeric", day: "numeric" });

/**
 * **이번 달 숙제 제출률** (2026-10-30 — "숙제 달성률 이런거 보면 본인이 이번달에 얼마나 열씨미 했는지도 볼수있게"). 출석률 카드(`AttendanceRate`)와 같은 꼴 —
 * 큰 숫자는 제출률(기한이 지난 숙제 중 낸 비율), 막대는 이번 달 숙제를 몇 개 채웠나. 숫자는 `src/lib/homework-rate.ts` — 선생님 화면(학생 관리 · 숙제 미제출 알림)과 같다.
 * 숙제제출 화면과 마이페이지가 쓴다 (`link` — 마이페이지에서는 숙제제출로 가는 줄을 단다). 지금 수강 중인 달이 없으면 그리지 않는다.
 */
export function HomeworkRateCard({ rows, link = false, compact = false }: { rows: HomeworkMonthRate[]; link?: boolean; compact?: boolean }) {
  if (rows.length === 0) return null;
  if (compact) return <CompactRate rows={rows} />;
  return (
    <>
      {rows.map((r) => {
        const sent = r.done + r.upcomingDone;
        const left = r.upcoming - r.upcomingDone;
        const withLevel = hasManyLevels(r);
        const shown = r.missing.slice(0, MISSING_SHOWN);
        const cheer =
          r.rate === null
            ? "첫 숙제의 기한이 지나면 제출률이 나와요."
            : r.rate === 100
              ? "기한이 지난 숙제를 하나도 빠짐없이 냈어요. 이대로 끝까지!"
              : r.rate >= 70
                ? "잘하고 있어요. 남은 숙제도 꼭 내요."
                : "안 낸 숙제가 있어요. 지금이라도 올려서 채워 봐요.";
        return (
          <section key={r.termId} aria-labelledby={`hw-rate-${r.termId}`} className="card p-5 sm:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id={`hw-rate-${r.termId}`} className="text-lg font-black text-ink">
                {r.month}월 숙제 제출률
              </h2>
              <span className="text-xs font-bold text-slate">
                {md(r.opens)} 개강 ~ {md(r.closes)} 종강
              </span>
            </div>
            <div className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-1">
              {r.rate === null ? (
                // 기한이 지난 숙제가 없으면 숫자를 적지 않는다 — 0% 가 아니다
                <p className="text-3xl font-black tracking-tight text-mist">시작 전</p>
              ) : (
                <p className="text-5xl font-black tracking-tight text-brand-600 tabular-nums">
                  {r.rate}
                  <span className="ml-0.5 text-2xl">%</span>
                </p>
              )}
              <p className="pb-1.5 text-sm text-slate">{r.past > 0 ? `기한이 지난 숙제 ${r.past}개 중 ${r.done}개 냈어요` : "아직 기한이 지난 숙제가 없어요"}</p>
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between gap-2 text-xs font-bold">
                <span className="text-ink">
                  이번 달 숙제 {r.total}개 중 {sent}개 냈어요
                </span>
                <span className="shrink-0 text-slate">남은 숙제 {left}개</span>
              </div>
              <div
                role="progressbar"
                aria-label={`${r.month}월 숙제 ${r.total}개 중 ${sent}개 냄`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={r.fill}
                className="mt-1.5 h-3 w-full overflow-hidden rounded-full bg-brand-50"
              >
                <div className="h-full rounded-full bg-brand-500 transition-[width] duration-700" style={{ width: `${r.fill}%` }} />
              </div>
            </div>

            {r.missing.length > 0 && (
              <p className="mt-3 text-xs leading-relaxed">
                <span className="mr-1.5 rounded-full bg-red-100 px-2 py-0.5 font-bold text-red-700">안 낸 숙제 {r.missing.length}</span>
                <span className="text-ink-soft">
                  {shown.map((m) => missingSlotLabel(m, withLevel)).join(" · ")}
                  {r.missing.length > shown.length ? ` 외 ${r.missing.length - shown.length}개` : ""}
                </span>
              </p>
            )}
            <p className="mt-2 text-sm font-bold text-ink">{cheer}</p>
            <p className="mt-1 text-xs text-slate">
              숙제는 다음 수업일 {HOMEWORK_DUE_LABEL}까지 내요. 기한이 지난 숙제 중 낸 숙제의 비율이 제출률이에요{r.missing.length > 0 ? " — 안 낸 숙제는 숙제제출에서 그 수업 날짜를 눌러 올려 주세요." : "."}
            </p>
            {link && (
              <Link href="/my/homework" className="mt-3 inline-block text-sm font-bold text-brand-600 hover:underline">
                숙제 내러 가기 →
              </Link>
            )}
          </section>
        );
      })}
    </>
  );
}

/**
 * 숙제제출 화면 맨 위의 작은 카드 — 그 화면의 일은 숙제를 내는 것이라 달력을 밀어내지 않게 한 줄 + 막대 + 안 낸 숙제만 (설명은 마이페이지 카드에).
 * 막대는 큰 카드와 같은 뜻(이번 달 숙제를 몇 개 채웠나)이다
 */
function CompactRate({ rows }: { rows: HomeworkMonthRate[] }) {
  return (
    <>
      {rows.map((r) => {
        const sent = r.done + r.upcomingDone;
        const withLevel = hasManyLevels(r);
        const shown = r.missing.slice(0, MISSING_SHOWN);
        return (
          <section key={r.termId} aria-labelledby={`hw-rate-${r.termId}`} className="card px-4 py-3.5 sm:px-5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 id={`hw-rate-${r.termId}`} className="text-sm font-black text-ink">
                  {r.month}월 숙제 제출률
                </h2>
                <p className="mt-0.5 text-xs text-slate">
                  {r.past > 0 ? `기한이 지난 숙제 ${r.past}개 중 ${r.done}개 냈어요` : "아직 기한이 지난 숙제가 없어요"} · 이번 달 {r.total}개 중 {sent}개
                </p>
              </div>
              {r.rate === null ? (
                <p className="shrink-0 text-lg font-black text-mist">시작 전</p>
              ) : (
                <p className="shrink-0 text-3xl font-black tracking-tight text-brand-600 tabular-nums">
                  {r.rate}
                  <span className="ml-0.5 text-base">%</span>
                </p>
              )}
            </div>
            <div
              role="progressbar"
              aria-label={`${r.month}월 숙제 ${r.total}개 중 ${sent}개 냄`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={r.fill}
              className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-brand-50"
            >
              <div className="h-full rounded-full bg-brand-500 transition-[width] duration-700" style={{ width: `${r.fill}%` }} />
            </div>
            {r.missing.length > 0 && (
              <p className="mt-2.5 text-xs leading-relaxed">
                <span className="mr-1.5 rounded-full bg-red-100 px-2 py-0.5 font-bold text-red-700">안 낸 숙제 {r.missing.length}</span>
                <span className="text-ink-soft">
                  {shown.map((m) => missingSlotLabel(m, withLevel)).join(" · ")}
                  {r.missing.length > shown.length ? ` 외 ${r.missing.length - shown.length}개` : ""}
                </span>
              </p>
            )}
          </section>
        );
      })}
    </>
  );
}
