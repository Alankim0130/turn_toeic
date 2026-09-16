import { SERIES, pct, type Datum } from "./palette";
import { cn } from "@/lib/utils";

/** 가로 막대 차트 (CSS). 값 순서대로 표시 */
export function BarChart({
  title,
  data,
  table = "sr-only",
  className,
  unit = "명",
}: {
  title: string;
  data: Datum[];
  table?: "visible" | "sr-only";
  className?: string;
  unit?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const total = data.reduce((s, d) => s + d.value, 0);

  if (data.length === 0) {
    return <p className={cn("rounded-xl bg-brand-50/60 px-4 py-6 text-center text-sm text-slate", className)}>표시할 데이터가 없습니다.</p>;
  }

  return (
    <div className={className}>
      <ul role="img" aria-label={`${title} 막대 차트`} className="space-y-2.5">
        {data.map((d, i) => (
          <li key={d.label} className="grid grid-cols-[minmax(0,7rem)_1fr_auto] items-center gap-3 text-sm">
            <span className="truncate font-semibold text-ink-soft" title={d.label}>{d.label}</span>
            <span className="h-3 overflow-hidden rounded-full bg-brand-50">
              <span
                className="block h-full rounded-full transition-[width] duration-700"
                style={{ width: `${Math.max(2, (d.value / max) * 100)}%`, backgroundColor: SERIES[i % 2 === 0 ? 0 : 2] }}
              />
            </span>
            <span className="w-16 text-right text-xs font-bold tabular-nums text-slate">
              {d.value.toLocaleString("ko-KR")}{unit}
            </span>
          </li>
        ))}
      </ul>
      {/* w-full 과 sr-only 를 같이 주면 w-full 이 sr-only 의 width:1px 를 덮어써서
          화면 밖에 폭 넓은 표가 남고 가로 스크롤이 생긴다. 둘 중 하나만 준다. */}
      <table className={cn("mt-4 text-xs", table === "sr-only" ? "sr-only" : "w-full")}>
        <caption className="mb-1 text-left font-bold text-slate">{title}</caption>
        <thead>
          <tr className="text-left text-mist">
            <th scope="col" className="py-1 pr-2 font-semibold">항목</th>
            <th scope="col" className="py-1 pr-2 text-right font-semibold">인원</th>
            <th scope="col" className="py-1 text-right font-semibold">비율</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.label} className="border-t border-line">
              <td className="py-1 pr-2">{d.label}</td>
              <td className="py-1 pr-2 text-right tabular-nums">{d.value.toLocaleString("ko-KR")}</td>
              <td className="py-1 text-right tabular-nums">{pct(d.value, total)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
