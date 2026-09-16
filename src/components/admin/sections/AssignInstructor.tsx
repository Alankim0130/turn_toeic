"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { assignInstructor } from "@/app/admin/sections/actions";
import { Icon } from "@/components/ui/Icon";
import { Alert } from "@/components/ui/Alert";
import { cn, TRACK_LABEL } from "@/lib/utils";

export type AssignRow = { id: number; course: string; track: string; timeBlock: string | null; instructor: string | null };
export type InstructorOption = { id: string; name: string };

/**
 * 강사 일괄 지정 (2026-09-16 Alan 요청). 반이 한 달에 70개 안팎이라 하나씩 못 바꾼다.
 * 어느 반을 누가 맡는지는 그 달 편성표가 정하므로 **화면이 정해 주지 않는다** — 골라서 적용한다.
 */
export function AssignInstructor({ rows, instructors, termLabel }: { rows: AssignRow[]; instructors: InstructorOption[]; termLabel: string }) {
  const router = useRouter();
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [instructorId, setInstructorId] = useState(instructors[0]?.id ?? "");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ kind: "success" | "warning"; text: string } | null>(null);

  const toggle = (id: number) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const pickAll = (list: AssignRow[], on: boolean) =>
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
  if (instructors.length === 0) {
    return (
      <Alert kind="warning">
        강사·관리자 계정이 없어요. 학생명단에서 이혜영·이영수 계정의 등급을 <strong>강사</strong>로 올린 뒤 다시 오세요.
      </Alert>
    );
  }

  const allOn = rows.every((r) => picked.has(r.id));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate">
          {termLabel} 반 {rows.length}개. 바꿀 반을 고르고 강사를 정하세요 — <strong className="text-ink">누가 무엇을 맡는지는 그 달 편성표</strong>를 보고 고릅니다.
        </p>
        <button type="button" onClick={() => pickAll(rows, !allOn)} className="btn-ghost !px-3 !py-1.5 text-xs">
          {allOn ? "전체 해제" : "전체 선택"}
        </button>
      </div>

      <ul className="grid max-h-80 gap-1.5 overflow-y-auto rounded-xl2 border border-line bg-surface p-2 sm:grid-cols-2">
        {rows.map((r) => {
          const on = picked.has(r.id);
          return (
            <li key={r.id}>
              <label
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition",
                  on ? "border-brand-400 bg-brand-50 font-bold text-ink" : "border-line bg-paper text-ink-soft hover:border-brand-300",
                )}
              >
                <input type="checkbox" checked={on} onChange={() => toggle(r.id)} className="size-4 accent-[#ff2e88]" />
                <span className="min-w-0 flex-1 truncate">
                  {r.course} · {TRACK_LABEL[r.track] ?? r.track}
                  {r.timeBlock && <span className="ml-1 tabular-nums text-slate">{r.timeBlock}</span>}
                </span>
                <span className="shrink-0 text-xs text-mist">{r.instructor ?? "미지정"}</span>
              </label>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="assign-instructor" className="sr-only">담당 강사</label>
        <select id="assign-instructor" value={instructorId} onChange={(e) => setInstructorId(e.target.value)} className="input !w-auto !py-2 text-sm font-bold">
          {instructors.map((i) => (
            <option key={i.id} value={i.id}>{i.name}</option>
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
