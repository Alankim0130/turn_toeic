"use client";

import { useMemo } from "react";
import { cn, TRACK_LABEL } from "@/lib/utils";
import { blockMinutes, buildBlockTree, dashLabel, flattenBlockTree, minutesLabel, TRACKS, tracksLabel } from "@/lib/time-blocks";

export type PickerSection = {
  id: number;
  track: string;
  time_block: string | null;
  /** 이미 배정된 반 — 고를 수 없다 */
  taken?: boolean;
  course: { id: number; name: string; program: string; target_score: number | null } | null;
  term?: { year: number; month: number } | null;
};

type Row = { label: string | null; depth: number; leaf: boolean; parts: string[]; minutes: string | null; byTrack: Partial<Record<string, PickerSection>> };

/**
 * 반 고르기 — 강좌 → 시간대(묶음 아래 시간 단위) 줄마다 [월수금] [화목금] [주5일].
 * 주5일은 같은 시간대의 월수금 + 화목금이라 버튼 하나로 두 반이 함께 골라진다 (2026-09-16 Alan 요청).
 * 학생 관리의 반 배정과 수강증 승인이 같은 화면을 쓴다. 고른 반은 hidden input `name` 으로 폼에 실린다.
 */
export function SectionPicker({
  sections,
  value,
  onChange,
  name = "section_ids",
}: {
  sections: PickerSection[];
  value: number[];
  onChange: (ids: number[]) => void;
  name?: string;
}) {
  const groups = useMemo(() => {
    type CourseGroup = { course: NonNullable<PickerSection["course"]>; rows: Row[] };
    type TermGroup = { key: string; label: string | null; courses: CourseGroup[] };
    const terms = new Map<string, { label: string | null; byCourse: Map<number, { course: NonNullable<PickerSection["course"]>; list: PickerSection[] }> }>();
    for (const s of sections) {
      if (!s.course) continue;
      // 달을 두 자리로 — 안 그러면 "2026-10" 이 "2026-9" 보다 앞에 정렬돼 10월 반이 9월 반 위에 뜬다 (2026-09-23)
      const tk = s.term ? `${s.term.year}-${String(s.term.month).padStart(2, "0")}` : "";
      const tg = terms.get(tk) ?? { label: s.term ? `${s.term.year}년 ${s.term.month}월` : null, byCourse: new Map() };
      terms.set(tk, tg);
      const cg = tg.byCourse.get(s.course.id) ?? { course: s.course, list: [] };
      cg.list.push(s);
      tg.byCourse.set(s.course.id, cg);
    }
    const out: TermGroup[] = [];
    for (const [key, tg] of terms) {
      const courses = [...tg.byCourse.values()]
        .sort((a, b) => (a.course.program === b.course.program ? 0 : a.course.program === "score" ? -1 : 1) || (a.course.target_score ?? 0) - (b.course.target_score ?? 0) || a.course.name.localeCompare(b.course.name, "ko"))
        .map(({ course, list }) => {
          const tree = buildBlockTree(list.map((s) => s.time_block), { nest: course.program === "score" });
          const rows: Row[] = flattenBlockTree(tree).map(({ node, depth }) => ({
            label: node.label,
            depth,
            leaf: node.parts.length === 0,
            parts: node.parts.map((p) => dashLabel(p.label)),
            byTrack: Object.fromEntries(list.filter((s) => s.time_block === node.label).map((s) => [s.track, s])),
            minutes: minutesLabel(blockMinutes(node)),
          }));
          const loose = list.filter((s) => !s.time_block);
          if (loose.length) rows.push({ label: null, depth: 0, leaf: true, parts: [], minutes: null, byTrack: Object.fromEntries(loose.map((s) => [s.track, s])) });
          return { course, rows };
        });
      out.push({ key, label: tg.label, courses });
    }
    return out.sort((a, b) => a.key.localeCompare(b.key));
  }, [sections]);

  const picked = new Set(value);
  const set = (ids: number[], on: boolean) => {
    const next = new Set(value);
    for (const id of ids) {
      if (on) next.add(id);
      else next.delete(id);
    }
    onChange([...next]);
  };

  // 고른 반 요약 — "650+ 왕기초반 주5일 10:00~12:10"
  const summary = useMemo(() => {
    const by = new Map<string, { name: string; block: string | null; tracks: string[] }>();
    for (const s of sections) {
      if (!picked.has(s.id) || !s.course) continue;
      const k = `${s.course.id}|${s.time_block ?? ""}`;
      const e = by.get(k) ?? { name: s.course.name, block: s.time_block, tracks: [] };
      e.tracks.push(s.track);
      by.set(k, e);
    }
    return [...by.values()].map((e) => [e.name, tracksLabel(e.tracks), e.block].filter(Boolean).join(" "));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections, value]);

  const multiTerm = groups.length > 1;

  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <div key={g.key} className="space-y-3">
          {multiTerm && g.label && <p className="text-sm font-black text-ink">{g.label}</p>}
          {g.courses.map(({ course, rows }) => (
            <section key={course.id} aria-label={`${course.name} 반 고르기`} className="overflow-hidden rounded-xl2 border border-line bg-paper">
              <header className="flex flex-wrap items-center gap-2 border-b border-line bg-surface px-3 py-2">
                <p className="font-black text-ink">{course.name}</p>
                {course.program === "sparta" && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-black text-brand-700">스파르타반</span>}
              </header>
              <ul className="divide-y divide-line">
                {rows.map((r) => {
                  const mwf = r.byTrack.mwf;
                  const ttf = r.byTrack.ttf;
                  const selectable = [mwf, ttf].filter((s): s is PickerSection => !!s && !s.taken);
                  const fiveDayOn = selectable.length > 0 && selectable.every((s) => picked.has(s.id)) && [mwf, ttf].every((s) => !s || s.taken || picked.has(s.id));
                  const fiveDayDisabled = !mwf || !ttf || selectable.length === 0;
                  return (
                    <li key={r.label ?? "none"} className={cn("flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-3 py-2 text-sm", r.depth > 0 && "bg-surface/60")}>
                      <span className={cn("inline-flex min-w-0 flex-wrap items-center gap-1.5", r.depth > 0 && "pl-4")}>
                        {r.depth > 0 && <span aria-hidden className="text-mist">↳</span>}
                        <span className="font-bold tabular-nums text-ink">{r.label ?? "시간대 없음"}</span>
                        {r.minutes && <span className="rounded-full bg-brand-50 px-1.5 py-0.5 text-[11px] font-black text-brand-700">{r.minutes}</span>}
                        {!r.leaf && <span className="text-[11px] font-semibold text-slate">묶음 · {r.parts.join(" + ")}</span>}
                      </span>
                      <span className="inline-flex shrink-0 overflow-hidden rounded-xl border border-line bg-paper text-xs font-bold" role="group" aria-label={`${course.name} ${r.label ?? ""} 트랙`}>
                        {TRACKS.map((t) => {
                          const s = r.byTrack[t];
                          const on = !!s && picked.has(s.id);
                          const disabled = !s || !!s.taken;
                          return (
                            <button
                              key={t}
                              type="button"
                              disabled={disabled}
                              aria-pressed={on}
                              title={!s ? "이 트랙 반이 없어요" : s.taken ? "이미 배정된 반이에요" : undefined}
                              onClick={() => s && set([s.id], !on)}
                              className={cn(
                                "px-3 py-1.5 transition",
                                on ? "bg-brand-500 text-white" : "text-ink-soft hover:bg-brand-50",
                                disabled && "cursor-not-allowed text-mist hover:bg-transparent",
                              )}
                            >
                              {TRACK_LABEL[t]}
                              {s?.taken && <span className="ml-1 text-[10px] font-semibold">배정됨</span>}
                            </button>
                          );
                        })}
                        <button
                          type="button"
                          disabled={fiveDayDisabled}
                          aria-pressed={fiveDayOn}
                          title={fiveDayDisabled ? "월수금·화목금 반이 모두 있어야 주5일로 고를 수 있어요" : "월수금 + 화목금"}
                          onClick={() => set(selectable.map((s) => s.id), !fiveDayOn)}
                          className={cn(
                            "border-l border-line px-3 py-1.5 transition",
                            fiveDayOn ? "bg-ink text-white" : "text-ink-soft hover:bg-brand-50",
                            fiveDayDisabled && "cursor-not-allowed text-mist hover:bg-transparent",
                          )}
                        >
                          주5일
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      ))}

      {value.map((id) => (
        <input key={id} type="hidden" name={name} value={id} />
      ))}

      <p className="text-xs text-slate" aria-live="polite">
        {summary.length === 0 ? "아직 고른 반이 없어요. 주5일은 [주5일] 버튼 하나로 월수금·화목금이 함께 골라져요." : <>고른 반: <strong className="text-ink">{summary.join(" · ")}</strong></>}
      </p>
    </div>
  );
}
