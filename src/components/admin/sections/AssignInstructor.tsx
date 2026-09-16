"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { assignInstructor } from "@/app/admin/sections/actions";
import { Icon } from "@/components/ui/Icon";
import { Alert } from "@/components/ui/Alert";
import { cn, TRACK_LABEL } from "@/lib/utils";

export type AssignRow = {
  id: number;
  course: string;
  track: string;
  timeBlock: string | null;
  instructor: string | null;
  /** 묶음 반(120분·140분)·스파르타 반은 한 시간씩 강사가 갈린다 — 안내만 띄운다 */
  package: boolean;
};
export type InstructorOption = { id: string; name: string };

const TRACKS = ["mwf", "ttf"] as const;

/**
 * 담당 강사 일괄 지정 (2026-09-16 Alan 요청). 반이 한 달에 70개 안팎이라 하나씩 못 바꾼다.
 * 어느 반을 누가 맡는지는 그 달 편성표가 정하므로 **화면이 정해 주지 않는다** — 골라서 적용한다.
 * 대신 트랙·시간대로 좁혀 고를 수 있게 해서 36개를 몇 번에 끝낸다.
 */
export function AssignInstructor({ rows, instructors, termLabel }: { rows: AssignRow[]; instructors: InstructorOption[]; termLabel: string }) {
  const router = useRouter();
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [track, setTrack] = useState<string | null>(null);
  const [instructorId, setInstructorId] = useState(instructors[0]?.id ?? "");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ kind: "success" | "warning"; text: string } | null>(null);

  const shown = useMemo(() => rows.filter((r) => !track || r.track === track), [rows, track]);
  // 시간대로 묶어서 보여 준다 — 편성표가 시간대 × 트랙으로 강사를 정하기 때문
  const groups = useMemo(() => {
    const map = new Map<string, AssignRow[]>();
    for (const r of shown) {
      const k = r.timeBlock ?? "시간 미정";
      map.set(k, [...(map.get(k) ?? []), r]);
    }
    return [...map.entries()];
  }, [shown]);

  const setMany = (list: AssignRow[], on: boolean) =>
    setPicked((prev) => {
      const next = new Set(prev);
      for (const r of list) {
        if (on) next.add(r.id);
        else next.delete(r.id);
      }
      return next;
    });

  const apply = () =>
    start(async () => {
      setMsg(null);
      const res = await assignInstructor({ sectionIds: [...picked], instructorId });
      if (!res.ok) return setMsg({ kind: "warning", text: res.error ?? "바꾸지 못했어요." });
      setPicked(new Set());
      setMsg({ kind: "success", text: `${res.count}개 반의 담당 강사를 바꿨어요.` });
      router.refresh();
    });

  if (rows.length === 0) return null;

  const onlyMe = instructors.length <= 1;
  const allOn = shown.length > 0 && shown.every((r) => picked.has(r.id));

  return (
    <div className="space-y-4">
      {onlyMe && (
        <Alert kind="warning">
          지금 고를 수 있는 담당이 <strong>{instructors[0]?.name ?? "없음"}</strong> 뿐이에요. 학생명단 → 전체 탭에서
          <strong> 이혜영·이영수 계정의 등급을 “강사”로</strong> 올리면 여기 목록에 나옵니다.
        </Alert>
      )}

      <p className="text-sm text-slate">
        {termLabel} 반 {rows.length}개. 트랙을 고르고 시간대 줄을 눌러 한 번에 담으세요 —{" "}
        <strong className="text-ink">누가 무엇을 맡는지는 그 달 편성표</strong>를 보고 정합니다.
      </p>

      {/* 트랙 좁히기 */}
      <div className="flex flex-wrap gap-1.5">
        {[{ key: null, label: "전체" }, ...TRACKS.map((t) => ({ key: t as string | null, label: TRACK_LABEL[t] }))].map((t) => (
          <button
            key={t.label}
            type="button"
            onClick={() => setTrack(t.key)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm font-bold transition",
              track === t.key ? "border-brand-500 bg-brand-500 text-white" : "border-line bg-paper text-ink-soft hover:border-brand-300",
            )}
          >
            {t.label}
          </button>
        ))}
        <button type="button" onClick={() => setMany(shown, !allOn)} className="btn-ghost ml-auto !px-3 !py-1.5 text-xs">
          {allOn ? "보이는 것 전체 해제" : "보이는 것 전체 선택"}
        </button>
      </div>

      {/* 시간대별 묶음 */}
      <div className="max-h-[26rem] space-y-3 overflow-y-auto rounded-xl2 border border-line bg-surface p-3">
        {groups.map(([block, list]) => {
          const on = list.every((r) => picked.has(r.id));
          return (
            <div key={block}>
              <div className="mb-1.5 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMany(list, !on)}
                  className={cn(
                    "rounded-lg px-2 py-1 text-sm font-black tabular-nums transition",
                    on ? "bg-brand-500 text-white" : "bg-brand-50 text-brand-700 hover:bg-brand-100",
                  )}
                >
                  {block}
                </button>
                <span className="text-xs text-mist">{list.length}개</span>
              </div>
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {list.map((r) => {
                  const checked = picked.has(r.id);
                  return (
                    <li key={r.id}>
                      <label
                        className={cn(
                          "flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition",
                          checked ? "border-brand-400 bg-brand-50 font-bold text-ink" : "border-line bg-paper text-ink-soft hover:border-brand-300",
                        )}
                      >
                        <input type="checkbox" checked={checked} onChange={() => setMany([r], !checked)} className="size-4 shrink-0 accent-[#ff2e88]" />
                        <span className="min-w-0 flex-1 truncate">
                          {r.course}
                          <span className="ml-1 text-xs text-slate">{TRACK_LABEL[r.track] ?? r.track}</span>
                          {r.package && <span className="ml-1 rounded bg-ink/10 px-1 text-[0.65rem] font-bold text-ink-soft">묶음</span>}
                        </span>
                        <span className="shrink-0 text-xs text-mist">{r.instructor ?? "미지정"}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
        {groups.length === 0 && <p className="py-6 text-center text-sm text-slate">이 트랙에는 반이 없어요.</p>}
      </div>

      <p className="text-xs text-slate">
        <strong className="text-ink-soft">묶음</strong> 표시가 붙은 120분·140분 반과 스파르타 반은 한 시간씩 강사가 갈려요 —
        담당은 한 명만 들어가니, 실제 수업은 안에 든 시간 단위 반에 넣은 강사가 맞습니다.
      </p>

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <label htmlFor="assign-instructor" className="sr-only">
          담당 강사
        </label>
        <select
          id="assign-instructor"
          value={instructorId}
          onChange={(e) => setInstructorId(e.target.value)}
          className="input !w-auto !py-2 text-sm font-bold"
        >
          {instructors.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
        <button type="button" onClick={apply} disabled={pending || picked.size === 0} className="btn-primary !py-2" aria-busy={pending}>
          <Icon name="students" size={18} className="brightness-0 invert" />
          {pending ? "바꾸는 중…" : picked.size ? `${picked.size}개 반에 적용` : "반을 골라 주세요"}
        </button>
      </div>

      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
    </div>
  );
}
