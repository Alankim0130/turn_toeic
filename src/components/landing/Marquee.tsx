const WORDS = [
  "귀에 꽂히는 압도적인 전달력",
  "YBM서면 전체 1위",
  "족집게식 핵심 학습",
  "최신 경향 실시간 반영",
  "현장 강의 + 불라방",
  "650 · 750 · 850 목표반",
  "이혜영 LC",
  "이영수 RC",
  "누적 후기 7,356건",
];

export function Marquee() {
  const items = [...WORDS, ...WORDS];
  return (
    <div className="relative overflow-hidden border-y border-brand-200/60 bg-brand-500 py-3 text-white" aria-hidden>
      <div className="flex w-max animate-marquee gap-10 whitespace-nowrap px-5 text-sm font-bold tracking-wide sm:text-base">
        {items.map((w, i) => (
          <span key={i} className="flex items-center gap-10">
            {w}
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-white/70" />
          </span>
        ))}
      </div>
    </div>
  );
}
