import { Reveal } from "@/components/ui/Reveal";
import { Icon } from "@/components/ui/Icon";
import { cn, formatTime, RECORDED_LABEL } from "@/lib/utils";
import { blockMinutes, buildBlockTree, dashLabel, isRecordedBlock, minutesLabel } from "@/lib/time-blocks";

export type TimetableCardData = {
  key: string;
  level: number;
  program: string;
  /** 레벨 전체에 붙는 자유 메모 (`timetable_levels.note`). 인강 표시는 여기 적지 않는다 — 시간대마다 `recorded` 로 */
  note: string | null;
  /** 이미 라벨(`HH:MM~HH:MM`)로 바꾼 시간대와, 그 시간대가 화목금 인강인지 (`timetable_slots.ttf_recorded`) */
  slots: { label: string; recorded: boolean }[];
};

/**
 * 랜딩 시간표 카드 한 장 (레벨 × 과정). 데이터는 `Schedule` 이 읽어서 넘긴다 — 여기는 그리기만 한다.
 *
 * **화목금 인강 표시는 그 시간대 줄 안에 붙인다** (2026-09-17 Alan — "저녁반만 화목금 인강인데 전체가 다 그런것처럼 보여").
 * 예전에는 `timetable_levels.note`("월수금반 현장, 화목금반 인강")를 카드 바닥에 두어 오전 반까지 인강처럼 읽혔고,
 * 그 메모가 750 에만 있어 650 저녁이 빠져 있었다. 이제 `ttf_recorded` 를 시간대마다 읽으므로 두 레벨 다 저녁 줄에 뜬다.
 * 배지 색은 학생 화면의 `인강` 배지(보라)와 같다 — 같은 뜻은 같은 색.
 */
export function TimetableCard({ card, delay = 0 }: { card: TimetableCardData; delay?: number }) {
  const flagged = new Set(card.slots.filter((s) => s.recorded).map((s) => s.label));
  const tree = buildBlockTree(
    card.slots.map((s) => s.label),
    { nest: card.program === "score" },
  );

  return (
    <Reveal delay={delay} className="card flex flex-col p-6">
      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-50">
          <Icon name="timeslot" size={30} />
        </span>
        <h3 className="text-2xl font-black tracking-tight text-ink">
          {card.program === "sparta" && <span className="mr-1.5 text-lg text-brand-600">스파르타</span>}
          {card.level}
          <span className="ml-0.5 text-lg">반</span>
        </h3>
      </div>

      {/* 등록 단위(120분 · 140분)를 크게, 그 안의 60분 · 70분 시간 단위를 아래에 — 60분만 듣는 반도 있다 (2026-09-16 Alan) */}
      <ul className="mt-5 space-y-2">
        {tree.map((node) => {
          const minutes = minutesLabel(blockMinutes(node));
          const recorded = isRecordedBlock(node, flagged);
          return (
            <li
              key={node.label}
              data-recorded={recorded || undefined}
              className={cn("rounded-xl px-4 py-3 text-center", recorded ? "bg-brand-50 ring-1 ring-violet-200" : "bg-brand-50")}
            >
              <p className="text-xl font-black tabular-nums text-brand-600">
                {formatTime(node.label.slice(0, 5))} ~ {formatTime(node.label.slice(6))}
                {minutes && <span className="ml-1.5 align-middle text-xs font-black text-brand-700">{minutes}</span>}
              </p>
              {node.parts.length > 0 && (
                <p className="mt-1 text-xs font-semibold text-slate">
                  {node.parts.map((p) => `${dashLabel(p.label)}${minutesLabel(blockMinutes(p)) ? ` (${minutesLabel(blockMinutes(p))})` : ""}`).join(" · ")}
                  <span className="block text-[11px] font-normal text-mist">한 시간만 듣는 반도 있어요</span>
                </p>
              )}
              {/* 이 줄만 화목금 인강 — 트랙마다 알약 하나씩이라 "어느 요일이 인강인지" 가 줄 안에서 바로 읽힌다 */}
              {recorded && (
                <p className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
                  <span className="rounded-full bg-ink px-2.5 py-0.5 text-[11px] font-black text-white">월수금 현장</span>
                  <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-[11px] font-black text-violet-800">화목금 {RECORDED_LABEL}</span>
                  <span className="basis-full text-[11px] font-normal text-mist">화목금은 그 날 오전 수업 녹화본을 봐요</span>
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {card.note && (
        <p className="mt-3 rounded-xl border border-brand-200 px-4 py-2.5 text-center text-sm font-bold text-brand-700">{card.note}</p>
      )}
    </Reveal>
  );
}
