import Link from "next/link";
import { cn } from "@/lib/utils";
import { termParam } from "@/lib/study";

type TermLite = { id: number; year: number; month: number };

/** 기수(월) 선택 칩. ?term=YYYY-MM 링크 (서버 컴포넌트) */
export function TermChips({
  basePath,
  terms,
  current,
  keep = {},
  extra,
}: {
  basePath: string;
  terms: TermLite[];
  current: string | null;
  keep?: Record<string, string | undefined>;
  /** 기수 외 선택지 (예: 상시 음원) */
  extra?: { value: string; label: string };
}) {
  const href = (value: string) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(keep)) if (v) p.set(k, v);
    p.set("term", value);
    return `${basePath}?${p.toString()}`;
  };
  const chips = [
    ...(extra ? [extra] : []),
    ...terms.map((t) => ({ value: termParam(t.year, t.month), label: `${t.year}.${String(t.month).padStart(2, "0")}` })),
  ];
  if (chips.length === 0) return null;

  return (
    <nav aria-label="기수 선택" className="-mx-4 mb-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex w-max gap-2 sm:w-auto sm:flex-wrap">
        {chips.map((c) => {
          const active = c.value === current;
          return (
            <li key={c.value}>
              <Link
                href={href(c.value)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "block whitespace-nowrap rounded-full border px-3 py-1 text-xs font-bold transition",
                  active ? "border-brand-400 bg-brand-500 text-white" : "border-line bg-paper text-slate hover:border-brand-300",
                )}
              >
                {c.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
