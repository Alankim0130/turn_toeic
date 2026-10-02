import Link from "next/link";
import { Icon, type IconName } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";
import { shiftMonth, termKey } from "./dates";

export type SectionsTab = "calendar" | "classes" | "new" | "instructors" | "study";

/**
 * 반 편성 묶음의 다섯 화면을 오가는 탭 (2026-10-02 Alan — "반 편성에서 일정표 편성만 딱, 나머지는 페이지를 분리").
 * 달력 · 개설 반 · 새 반 개설 · 담당 강사 · 스터디 시간. 같은 달(`?term=`)을 들고 다닌다.
 * 달력 화면은 자기 ‹ › 가 있으므로 달 넘기기는 나머지 화면에서만 그린다.
 */
const TABS: { key: SectionsTab; label: string; icon: IconName; href: (k: string) => string }[] = [
  { key: "calendar", label: "달력", icon: "calendar", href: (k) => `/admin/sections?term=${k}` },
  { key: "classes", label: "개설 반", icon: "students", href: (k) => `/admin/sections/classes?term=${k}` },
  { key: "new", label: "새 반 개설", icon: "timeslot", href: (k) => `/admin/sections/new?term=${k}` },
  { key: "instructors", label: "담당 강사", icon: "admin", href: (k) => `/admin/sections/instructors?term=${k}` },
  { key: "study", label: "스터디 시간", icon: "study", href: (k) => `/admin/study/plan?term=${k}` },
];

export function SectionsTabs({
  current,
  year,
  month,
  counts,
  monthNav = true,
}: {
  current: SectionsTab;
  year: number;
  month: number;
  /** 탭 옆에 적을 수 (개설 반 N) */
  counts?: Partial<Record<SectionsTab, number>>;
  monthNav?: boolean;
}) {
  const key = termKey(year, month);
  const prev = shiftMonth(year, month, -1);
  const next = shiftMonth(year, month, 1);
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <nav aria-label="반 편성 화면" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex w-max gap-2 pb-1">
          {TABS.map((t) => {
            const active = t.key === current;
            const count = counts?.[t.key];
            return (
              <li key={t.key}>
                <Link
                  href={t.href(key)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-2 text-xs font-bold transition",
                    active ? "border-brand-500 bg-brand-500 text-white" : "border-line bg-paper text-ink-soft hover:border-brand-300 hover:text-brand-600",
                  )}
                >
                  <Icon name={t.icon} size={16} className={cn(active && "brightness-0 invert")} />
                  {t.label}
                  {count != null && <span className={cn("rounded-full px-1.5 text-[11px] tabular-nums", active ? "bg-white/20" : "bg-line")}>{count}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {monthNav && (
        <div className="flex items-center gap-2 text-sm">
          <Link href={TABS.find((t) => t.key === current)!.href(termKey(prev.y, prev.m))} className="btn-ghost !px-3 !py-1.5" aria-label="지난달">
            ‹ {prev.m}월
          </Link>
          <span className="font-black text-ink">
            {year}년 {month}월
          </span>
          <Link href={TABS.find((t) => t.key === current)!.href(termKey(next.y, next.m))} className="btn-ghost !px-3 !py-1.5" aria-label="다음달">
            {next.m}월 ›
          </Link>
        </div>
      )}
    </div>
  );
}
