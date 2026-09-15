import { type Datum } from "./palette";
import { cn } from "@/lib/utils";

/** 세로 막대 차트 (SVG). 월별 추이 등 */
export function ColumnChart({
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
  const W = 600;
  const H = 200;
  const padB = 28;
  const padT = 18;
  const gap = 8;
  const bw = data.length ? (W - gap * (data.length + 1)) / data.length : 0;

  if (data.length === 0) {
    return <p className={cn("rounded-xl bg-brand-50/60 px-4 py-6 text-center text-sm text-slate", className)}>표시할 데이터가 없습니다.</p>;
  }

  return (
    <div className={className}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`${title} 막대 차트`}>
        <title>{title}</title>
        <line x1="0" y1={H - padB} x2={W} y2={H - padB} stroke="#ece6ec" />
        {data.map((d, i) => {
          const h = ((H - padB - padT) * d.value) / max;
          const x = gap + i * (bw + gap);
          const y = H - padB - h;
          return (
            <g key={d.label}>
              <rect x={x} y={y} width={bw} height={Math.max(h, d.value > 0 ? 2 : 0)} rx="4" fill={i === data.length - 1 ? "#ff2e88" : "#ff8fbd"}>
                <title>{`${d.label}: ${d.value}${unit}`}</title>
              </rect>
              {d.value > 0 && (
                <text x={x + bw / 2} y={y - 5} textAnchor="middle" fontSize="11" fontWeight="700" fill="#17121f">
                  {d.value}
                </text>
              )}
              <text x={x + bw / 2} y={H - padB + 16} textAnchor="middle" fontSize="10" fill="#5b5563">
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
      <table className={cn("mt-3 w-full text-xs", table === "sr-only" && "sr-only")}>
        <caption className="mb-1 text-left font-bold text-slate">{title}</caption>
        <thead>
          <tr className="text-left text-mist">
            <th scope="col" className="py-1 pr-2 font-semibold">기간</th>
            <th scope="col" className="py-1 text-right font-semibold">인원</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.label} className="border-t border-line">
              <td className="py-1 pr-2">{d.label}</td>
              <td className="py-1 text-right tabular-nums">{d.value.toLocaleString("ko-KR")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
