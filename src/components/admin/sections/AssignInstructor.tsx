"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { assignInstructor, autoAssignInstructors } from "@/app/admin/sections/actions";
import { Icon } from "@/components/ui/Icon";
import { Alert } from "@/components/ui/Alert";
import { cn, TRACK_LABEL } from "@/lib/utils";
import { planSubjects, SUBJECT_LABEL, type Subject } from "@/lib/instructor-subject";

export type AssignRow = {
  id: number;
  courseId: number;
  course: string;
  track: string;
  timeBlock: string | null;
  /** 과목 칸 (lc | rc). 비어 있으면 담당을 정하지 않는다 */
  subject: string | null;
  instructor: string | null;
  /** 묶음 반(120분·140분)·스파르타 반 — 두 과목을 이어 들어 담당이 한 명이 아니다 */
  package: boolean;
};
export type InstructorOption = { id: string; name: string; subject: Subject | null };

const TRACKS = ["mwf", "ttf"] as const;
const SUBJECT_CLASS: Record<Subject, string> = {
  lc: "bg-brand-100 text-brand-700",
  rc: "bg-ink/10 text-ink-soft",
};

/**
 * 담당 강사 지정 (2026-09-16 Alan 요청).
 *
 * 담당은 **DB 가 저절로 정한다** (2026-09-18 Alan "앞으로도 반편성과 달에 따라서 자동으로 매칭") —
 * 반이 생기거나 과목(`subject`)·과정·시간대가 바뀌거나 강사가 가입하면 트리거가 그 기수를 다시 맞춘다.
 * 반의 과목 칸이 LC 면 이혜영, RC 면 이영수에게 간다 (`lib/instructor-subject.ts` = DB 규칙, 2026-09-23).
 * 위 카드는 지금 상태를 미리 보여 주고, 버튼은 어긋나 보일 때 같은 규칙을 한 번 더 돌린다.
 * 규칙으로 정해지지 않는 것(과목 미지정)만 아래에서 손으로 고른다.
 */
export function AssignInstructor({ rows, instructors, termLabel, termId }: { rows: AssignRow[]; instructors: InstructorOption[]; termLabel: string; termId: number }) {
  const router = useRouter();
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [track, setTrack] = useState<string | null>(null);
  const [instructorId, setInstructorId] = useState(instructors[0]?.id ?? "");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ kind: "success" | "warning" | "info"; text: string } | null>(null);

  // 서버가 쓰는 규칙 그대로 — 화면은 미리 보여 주기만 하고 실제 판단은 서버가 다시 한다
  const plan = useMemo(
    () => planSubjects(rows.map((r) => ({ id: r.id, course_id: r.courseId, time_block: r.timeBlock, subject: r.subject, package: r.package }))),
    [rows],
  );
  const subjectOfId = useMemo(() => new Map(plan.assign.map((a) => [a.id, a.subject])), [plan]);
  const clearSet = useMemo(() => new Set(plan.clear), [plan]);
  const bySubject = useMemo(() => {
    const m = new Map<Subject, InstructorOption>();
    for (const i of instructors) if (i.subject && !m.has(i.subject)) m.set(i.subject, i);
    return m;
  }, [instructors]);

  const shown = useMemo(() => rows.filter((r) => !track || r.track === track), [rows, track]);
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

  const auto = () =>
    start(async () => {
      setMsg(null);
      const res = await autoAssignInstructors({ termId });
      if (!res.ok) return setMsg({ kind: "warning", text: res.error ?? "채우지 못했어요." });
      const bits = [res.assigned ? `${res.assigned}개 반의 담당을 바꿨어요` : "이미 편성표대로예요"];
      if (res.cleared) bits.push(`묶음·스파르타 ${res.cleared}개는 비웠어요`);
      if (res.missing?.length) bits.push(`${res.missing.join("·")} 강사 계정이 아직 없어 그 반은 그대로 뒀어요`);
      if (res.unknown) bits.push(`과목이 안 정해진 ${res.unknown}개는 건드리지 않았어요`);
      setPicked(new Set());
      setMsg({ kind: res.missing?.length || res.unknown ? "info" : "success", text: bits.join(". ") + "." });
      router.refresh();
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

  const allOn = shown.length > 0 && shown.every((r) => picked.has(r.id));
  const autoCount = plan.assign.filter((a) => bySubject.has(a.subject)).length;
  const missingSubjects = [...new Set(plan.assign.map((a) => a.subject))].filter((s) => !bySubject.has(s));

  return (
    <div className="space-y-4">
      {/* ─── 편성표대로 채우기 ─── */}
      <div className="rounded-xl2 border border-brand-200 bg-brand-50/60 p-4">
        <p className="text-sm font-bold text-ink">편성표대로 저절로 정해져요</p>
        <p className="mt-1 text-sm text-ink-soft">
          반마다 정해 둔 <strong>과목(LC/RC)</strong>대로{" "}
          {[...bySubject.entries()].map(([s, i]) => `${SUBJECT_LABEL[s]} ${i.name}`).join(" · ") || "각 과목 강사"} 에게 맡깁니다.
          반을 만들거나 과목·과정·시간대를 바꾸거나 강사가 가입하면 그때마다 다시 맞춰요 — 따로 누를 것이 없어요.
        </p>
        <ul className="mt-2 space-y-0.5 text-xs text-slate">
          <li>· 담당이 정해지는 반 <strong className="text-ink-soft">{autoCount}개</strong></li>
          {plan.clear.length > 0 && (
            <li>
              · 묶음·스파르타 <strong className="text-ink-soft">{plan.clear.length}개</strong>는 두 과목을 이어 들어서 <strong className="text-ink-soft">담당을 비웁니다</strong>
            </li>
          )}
          {plan.unknown.length > 0 && <li>· 과목이 안 정해진 {plan.unknown.length}개는 건드리지 않아요 (반 상세에서 과목을 고르면 바로 정해져요)</li>}
          {missingSubjects.length > 0 && (
            <li className="text-brand-700">
              · {missingSubjects.map((s) => SUBJECT_LABEL[s]).join("·")} 강사 계정이 아직 없어 그 반은 그대로 둡니다 — 가입하시면 저절로 들어가요
            </li>
          )}
        </ul>
        <button type="button" onClick={auto} disabled={pending || autoCount + plan.clear.length === 0} className="btn-primary mt-3 !py-2" aria-busy={pending}>
          <Icon name="bolt" size={18} className="brightness-0 invert" />
          {pending ? "맞추는 중…" : "지금 다시 맞추기"}
        </button>
        <p className="mt-1.5 text-xs text-mist">어긋나 보일 때만 누르세요. 손으로 바꿔 둔 담당도 규칙대로 되돌아가요.</p>
      </div>

      {msg && <Alert kind={msg.kind === "info" ? "warning" : msg.kind}>{msg.text}</Alert>}

      {/* ─── 손으로 고치기 ─── */}
      <details className="group">
        <summary className="cursor-pointer list-none text-sm font-bold text-ink-soft hover:text-brand-600">
          <Icon name="students" size={16} className="mr-1 inline" />
          손으로 골라 바꾸기 <span className="text-slate">({termLabel} 반 {rows.length}개)</span>
        </summary>

        <div className="mt-3 space-y-3">
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
                      const subject = subjectOfId.get(r.id);
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
                            </span>
                            {subject && <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[0.65rem] font-black", SUBJECT_CLASS[subject])}>{SUBJECT_LABEL[subject]}</span>}
                            {clearSet.has(r.id) && <span className="shrink-0 rounded bg-ink/10 px-1.5 py-0.5 text-[0.65rem] font-bold text-ink-soft">묶음</span>}
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

          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="assign-instructor" className="sr-only">
              담당 강사
            </label>
            <select id="assign-instructor" value={instructorId} onChange={(e) => setInstructorId(e.target.value)} className="input !w-auto !py-2 text-sm font-bold">
              {instructors.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} {i.subject ? `(${SUBJECT_LABEL[i.subject]} 강사)` : "(관리자 — 수업을 맡지 않아요)"}
                </option>
              ))}
            </select>
            <button type="button" onClick={apply} disabled={pending || picked.size === 0} className="btn-primary !py-2" aria-busy={pending}>
              {pending ? "바꾸는 중…" : picked.size ? `${picked.size}개 반에 적용` : "반을 골라 주세요"}
            </button>
          </div>
        </div>
      </details>
    </div>
  );
}
