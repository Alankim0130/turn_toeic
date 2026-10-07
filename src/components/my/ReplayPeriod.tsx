import { Icon } from "@/components/ui/Icon";
import { ddayLabel } from "@/lib/lecture";
import { daysUntil, type ReplayTerm } from "@/lib/replay-calendar";
import { formatDate } from "@/lib/utils";

/**
 * 다시보기 맨 위 **종강 D-day 띠** (2026-10-07 — 첫토익의 `수강 종료 10월 31일 (D-24)` 자리). 이 날까지 다시보기를 본다.
 * 기간은 내가 직접 배정된 반의 종강일이다 (`replayTerms` — 2주완성은 앞 절반 마지막 날). 기수가 둘 겹칠 때만 몇 월 수업인지 적는다
 */
export function ReplayPeriod({ terms, today }: { terms: ReplayTerm[]; today: string }) {
  if (terms.length === 0) return null;
  return (
    <section aria-label="다시보기 이용 기간" className="space-y-2">
      {terms.map((t) => {
        const left = Math.max(0, daysUntil(today, t.closes));
        return (
          <div key={t.termId} className="flex items-center gap-3 rounded-xl2 border border-brand-100 bg-brand-50/70 px-4 py-3">
            <Icon name="timeslot" size={28} />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-black text-ink">
                {terms.length > 1 && t.month && <span className="text-sm text-slate">{t.month}월 수업</span>}
                <span>{formatDate(t.closes)} 종강</span>
                <span className="rounded-full bg-brand-500 px-2 py-0.5 text-xs font-black tabular-nums text-white">{ddayLabel(left)}</span>
              </p>
              <p className="mt-0.5 text-xs text-slate">{left === 0 ? "오늘까지" : "이 날까지"} 다시보기를 볼 수 있어요</p>
            </div>
          </div>
        );
      })}
    </section>
  );
}
