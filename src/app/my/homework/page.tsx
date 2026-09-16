import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/ui/EmptyState";
import { SubmissionCard } from "@/components/my/homework/SubmissionCard";
import { cn } from "@/lib/utils";
import { getHomeworkLevels, getMyAccessibleSections, getMyHomework } from "../_lib/queries";

export const metadata: Metadata = {
  title: "숙제업로드",
  robots: { index: false },
};

function LevelCard({ level, mine, small = false }: { level: number; mine: boolean; small?: boolean }) {
  return (
    <Link
      href={`/my/homework/${level}`}
      className={cn(
        "card group flex items-center gap-4 transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-pink active:scale-[0.98]",
        small ? "p-4" : "p-5 sm:flex-col sm:items-start sm:gap-2",
      )}
    >
      <span className={cn("font-black tracking-tight text-ink transition group-hover:text-brand-600", small ? "text-2xl" : "text-4xl")}>{level}</span>
      <span className="min-w-0">
        <span className="block font-bold text-ink">{level}점 목표반</span>
        {mine && <span className="chip mt-1">내 레벨</span>}
      </span>
      <span aria-hidden className={cn("ml-auto text-xl font-black text-mist transition group-hover:translate-x-1 group-hover:text-brand-500", !small && "sm:ml-0 sm:mt-auto")}>
        →
      </span>
    </Link>
  );
}

/** 1단계: 레벨 고르기 + 최근 올린 숙제 */
export default async function HomeworkLevelStep() {
  const [levels, sections, recent] = await Promise.all([getHomeworkLevels(), getMyAccessibleSections(), getMyHomework()]);

  // 내 레벨: 지금 접근할 수 있는 반의 목표 점수 (스파르타면 함께 듣는 레벨까지). LC 음원듣기와 같은 기준
  const myLevels = levels.filter((l) => sections.some((s) => s.course?.target_score === l || (s.course?.includes_levels ?? []).includes(l)));
  const primary = myLevels.length ? myLevels : levels; // 반 배정이 없는 강사·테스터는 전체
  const others = levels.filter((l) => !primary.includes(l));

  return (
    <div className="space-y-8">
      <section aria-labelledby="step1-title" className="space-y-4">
        <h2 id="step1-title" className="text-xl font-black text-ink">어느 레벨 숙제인가요?</h2>
        {levels.length === 0 ? (
          <EmptyState icon="homework" title="아직 레벨이 없어요" description="강사가 레벨을 만들면 여기에서 고를 수 있어요." />
        ) : (
          <>
            <ul className={cn("grid gap-3", primary.length > 1 && "sm:grid-cols-3")}>
              {primary.map((l, i) => (
                <li key={l} className="animate-fade-up" style={{ animationDelay: `${i * 70}ms` }}>
                  <LevelCard level={l} mine={myLevels.includes(l)} />
                </li>
              ))}
            </ul>
            {others.length > 0 && (
              <details className="group rounded-xl2 border border-dashed border-line px-4 py-3">
                <summary className="cursor-pointer list-none text-sm font-bold text-slate transition hover:text-brand-600">
                  <span className="mr-1 inline-block transition group-open:rotate-90">▸</span>
                  다른 레벨 숙제 올리기
                </summary>
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                  {others.map((l) => (
                    <li key={l}>
                      <LevelCard level={l} mine={false} small />
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </section>

      <section aria-labelledby="recent-title">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="recent-title" className="text-lg font-black text-ink">최근 올린 숙제</h2>
          {recent.length > 0 && <span className="text-xs text-mist">최근 {Math.min(recent.length, 6)}건</span>}
        </div>
        {recent.length === 0 ? (
          <p className="card px-5 py-8 text-center text-sm text-slate">아직 올린 숙제가 없어요. 위에서 레벨을 골라 시작해 보세요.</p>
        ) : (
          <ul className="grid gap-4 lg:grid-cols-2">
            {recent.slice(0, 6).map((s) => (
              <li key={s.id}>
                <SubmissionCard submission={s} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
