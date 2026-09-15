import { SERIES, pct, type Datum } from "./palette";
import { cn } from "@/lib/utils";

/** 도넛 차트 (SVG). 범례 + 표 */
export function DonutChart({
  title,
  data,
  table = "sr-only",
  className,
  centerLabel,
}: {
  title: string;
  data: Datum[];
  table?: "visible" | "sr-only";
  className?: string;
  centerLabel?: string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const r = 40;
  const c = 2 * Math.PI * r;
  // 각 조각의 시작 오프셋을 렌더 전에 미리 계산
  const segments: { d: Datum; len: number; offset: number }[] = [];
  let acc = 0;
  for (const d of data) {
    const len = total > 0 ? (d.value / total) * c : 0;
    segments.push({ d, len, offset: acc });
    acc += len;
  }

  if (total === 0) {
    return <p className={cn("rounded-xl bg-brand-50/60 px-4 py-6 text-center text-sm text-slate", className)}>표시할 데이터가 없습니다.</p>;
  }

  return (
    <div className={cn("flex flex-col items-center gap-5 sm:flex-row", className)}>
      <svg viewBox="0 0 100 100" className="h-40 w-40 shrink-0" role="img" aria-label={`${title} 도넛 차트`}>
        <title>{`${title} 도넛 차트`}</title>
        <circle cx="50" cy="50" r={r} fill="none" stroke="#ffe4ef" strokeWidth="14" />
        {segments.map(({ d, len, offset }, i) => (
          <circle
            key={d.label}
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke={SERIES[i % SERIES.length]}
            strokeWidth="14"
            strokeDasharray={`${len} ${c - len}`}
            strokeDashoffset={-offset}
            transform="rotate(-90 50 50)"
          >
            <title>{`${d.label} ${d.value}명 (${pct(d.value, total)}%)`}</title>
          </circle>
        ))}
        <text x="50" y="47" textAnchor="middle" fontSize="13" fontWeight="800" fill="#17121f">
          {total.toLocaleString("ko-KR")}
        </text>
        <text x="50" y="60" textAnchor="middle" fontSize="7" fill="#5b5563">
          {centerLabel ?? "명"}
        </text>
      </svg>
      <div className="w-full">
        <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
          {data.map((d, i) => (
            <li key={d.label} className="flex items-center gap-2">
              <span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: SERIES[i % SERIES.length] }} aria-hidden />
              <span className="truncate font-semibold text-ink-soft">{d.label}</span>
              <span className="ml-auto text-xs font-bold tabular-nums text-slate">{pct(d.value, total)}%</span>
            </li>
          ))}
        </ul>
        <table className={cn("mt-3 w-full text-xs", table === "sr-only" && "sr-only")}>
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
    </div>
  );
}
