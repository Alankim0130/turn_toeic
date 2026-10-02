"use client";

import { useId, useMemo, useState } from "react";
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

// 달을 두 자리로 — 안 그러면 "2026-10" 이 "2026-9" 보다 앞에 정렬돼 10월 반이 9월 반 위에 뜬다 (2026-09-23)
const termKey = (s: PickerSection) => (s.term ? `${s.term.year}-${String(s.term.month).padStart(2, "0")}` : "");
/** 접고 펴는 단위 = 기수 × 강좌 */
const groupKey = (term: string, courseId: number) => `${term}|${courseId}`;

/**
 * 반 고르기 — 강좌 → 시간대(묶음 아래 시간 단위) 줄마다 [월수금] [화목금] [주5일].
 * 주5일은 같은 시간대의 월수금 + 화목금이라 버튼 하나로 두 반이 함께 골라진다 (2026-09-16 Alan 요청).
 * 학생 관리의 반 배정과 수강증 승인이 같은 화면을 쓴다. 고른 반은 hidden input `name` 으로 폼에 실린다.
 *
 * **강좌마다 접힌 채 시작한다** (2026-10-02 Alan — "반 배정 추가에서 650,750,850 등 다 펼쳐져있는데 기본적으로 닫힘상태면 좋겠어").
 * 레벨마다 시간대가 여섯 줄씩이라 다 펴 두면 한참 내려야 다음 강좌가 나온다. 강좌 이름을 누르면 펴진다.
 * **이미 고른 반이 있는 강좌만 펴진 채 시작한다** — 수강증 승인 화면은 OCR·학생이 고른 반을 미리 골라 두는데, 그것까지 접으면
 * 무엇이 골라져 있는지 안 보인다. 접힌 강좌에도 `고름` · `배정됨` 을 머리에 적어 열지 않고도 어디에 무엇이 있는지 보인다.
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
      const tk = termKey(s);
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
  // 펴 둔 강좌 — 처음에는 이미 고른 반이 있는 강좌만 (위 설명)
  const [open, setOpen] = useState<Set<string>>(() => {
    const keys = new Set<string>();
    for (const s of sections) if (s.course && value.includes(s.id)) keys.add(groupKey(termKey(s), s.course.id));
    return keys;
  });
  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const listIdBase = useId();
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
            <CourseGroup
              key={course.id}
              course={course}
              open={open.has(groupKey(g.key, course.id))}
              onToggle={() => toggle(groupKey(g.key, course.id))}
              listId={`${listIdBase}-${g.key}-${course.id}`}
              hasPicked={rows.some((r) => Object.values(r.byTrack).some((s) => !!s && picked.has(s.id)))}
              hasTaken={rows.some((r) => Object.values(r.byTrack).some((s) => !!s?.taken))}
            >
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
            </CourseGroup>
          ))}
        </div>
      ))}

      {value.map((id) => (
        <input key={id} type="hidden" name={name} value={id} />
      ))}

      <p className="text-xs text-slate" aria-live="polite">
        {summary.length === 0 ? (
          "아직 고른 반이 없어요. 강좌 이름을 눌러 펼친 뒤 고르세요 — 주5일은 [주5일] 버튼 하나로 월수금·화목금이 함께 골라져요."
        ) : (
          <>
            고른 반: <strong className="text-ink">{summary.join(" · ")}</strong>
          </>
        )}
      </p>
    </div>
  );
}

/**
 * 강좌 한 덩어리 — 머리를 누르면 시간대 줄이 펴지고 접힌다. 접혀 있어도 머리에 `고름`(이 강좌에서 고른 반이 있다) ·
 * `배정됨`(이 학생이 이미 이 강좌 반에 있다)을 적는다. 목록은 `hidden` 으로 숨겨 `aria-controls` 가 늘 가리킬 곳이 있게 한다.
 */
function CourseGroup({
  course,
  open,
  onToggle,
  listId,
  hasPicked,
  hasTaken,
  children,
}: {
  course: NonNullable<PickerSection["course"]>;
  open: boolean;
  onToggle: () => void;
  listId: string;
  hasPicked: boolean;
  hasTaken: boolean;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={`${course.name} 반 고르기`} className="overflow-hidden rounded-xl2 border border-line bg-paper">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={listId}
        className="flex w-full items-center gap-2 bg-surface px-3 py-2.5 text-left transition hover:bg-brand-50/60"
      >
        {/* 이름과 배지만 접힌다 — 꺾쇠는 늘 오른쪽 가운데 (320px 에서 스파르타 이름이 두 줄이 돼도) */}
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-black text-ink">{course.name}</span>
          {course.program === "sparta" && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-black text-brand-700">스파르타반</span>}
          {hasPicked && <span className="rounded-full bg-brand-500 px-2 py-0.5 text-[11px] font-black text-white">고름</span>}
          {hasTaken && <span className="rounded-full bg-line px-2 py-0.5 text-[11px] font-black text-slate">배정됨</span>}
        </span>
        {/* 꺾쇠는 도형(인라인 SVG) — 접혀 있으면 아래, 펴져 있으면 위 */}
        <svg
          width={18}
          height={18}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          className={cn("shrink-0 text-mist transition-transform", open ? "-rotate-90" : "rotate-90")}
        >
          <path d="M9 5l7 7-7 7" />
        </svg>
      </button>
      <ul id={listId} hidden={!open} className="divide-y divide-line border-t border-line">
        {children}
      </ul>
    </section>
  );
}
