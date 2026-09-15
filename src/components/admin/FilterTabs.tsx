import Link from "next/link";
import { cn } from "@/lib/utils";

export type FilterTab = { value: string; label: string; count?: number };

/** ?key=value 링크 탭. 서버 컴포넌트에서 사용 */
export function FilterTabs({
  basePath,
  paramKey,
  current,
  tabs,
  keep = {},
}: {
  basePath: string;
  paramKey: string;
  current: string;
  tabs: FilterTab[];
  keep?: Record<string, string | undefined>;
}) {
  const q = (value: string) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(keep)) if (v) p.set(k, v);
    p.set(paramKey, value);
    return `${basePath}?${p.toString()}`;
  };
  return (
    <div className="-mx-4 mb-5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div role="tablist" className="flex w-max gap-2 sm:w-auto sm:flex-wrap">
        {tabs.map((t) => {
          const active = t.value === current;
          return (
            <Link
              key={t.value}
              role="tab"
              aria-selected={active}
              href={q(t.value)}
              className={cn(
                "flex items-center gap-2 whitespace-nowrap rounded-full border px-4 py-2 text-sm font-bold transition",
                active ? "border-ink bg-ink text-white" : "border-line bg-paper text-ink-soft hover:border-brand-300 hover:text-brand-600",
              )}
            >
              {t.label}
              {typeof t.count === "number" && (
                <span className={cn("rounded-full px-1.5 py-0.5 text-[11px]", active ? "bg-white/20" : "bg-brand-50 text-brand-700")}>{t.count}</span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
