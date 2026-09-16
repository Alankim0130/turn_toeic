"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { assignSections, removeEnrollment, type StudentActionState } from "@/app/admin/students/actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";

export type SectionOption = { id: number; label: string; taken: boolean };

/** 반 배정 추가 — 주5일이면 월수금·화목금 두 반을 함께 고른다 */
export function AssignSections({ id, sections }: { id: string; sections: SectionOption[] }) {
  const [state, action] = useActionState<StudentActionState, FormData>(assignSections, {});
  const [picked, setPicked] = useState<number[]>([]);

  const toggle = (sectionId: number) =>
    setPicked((prev) => (prev.includes(sectionId) ? prev.filter((n) => n !== sectionId) : [...prev, sectionId]));

  // 저장에 성공하면 고른 것을 비운다 (렌더 중 파생 상태 갱신)
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state.ok) setPicked([]);
  }

  if (sections.length === 0) {
    return <p className="rounded-xl bg-brand-50/60 px-4 py-6 text-center text-sm text-slate">이 기수에 개설된 반이 없어요. 반 편성에서 먼저 반을 만들어 주세요.</p>;
  }

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      {picked.map((n) => (
        <input key={n} type="hidden" name="section_ids" value={n} />
      ))}

      <ul className="grid gap-2 sm:grid-cols-2">
        {sections.map((s) => {
          const on = picked.includes(s.id);
          return (
            <li key={s.id}>
              <label
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition",
                  s.taken ? "cursor-not-allowed border-line bg-surface text-mist" : on ? "border-brand-400 bg-brand-50 font-bold text-ink" : "border-line bg-paper text-ink-soft hover:border-brand-300",
                )}
              >
                <input type="checkbox" checked={on} disabled={s.taken} onChange={() => toggle(s.id)} className="size-4 accent-[#ff2e88]" />
                <span className="min-w-0 flex-1">{s.label}</span>
                {s.taken && <span className="shrink-0 text-xs font-bold">배정됨</span>}
              </label>
            </li>
          );
        })}
      </ul>

      <fieldset className="flex flex-wrap items-center gap-3">
        <legend className="sr-only">수강 방식</legend>
        {[
          { value: "onsite", label: "현장" },
          { value: "live", label: "불라방" },
        ].map((m) => (
          <label key={m.value} className="flex items-center gap-1.5 text-sm font-semibold text-ink-soft">
            <input type="radio" name="mode" value={m.value} defaultChecked={m.value === "onsite"} className="size-4 accent-[#ff2e88]" />
            {m.label}
          </label>
        ))}
        <SubmitButton className="!w-auto !px-4 !py-2 text-sm" pendingText="배정 중…" disabled={picked.length === 0}>
          {picked.length > 0 ? `${picked.length}개 반 배정` : "반을 골라 주세요"}
        </SubmitButton>
      </fieldset>

      {state.error && <p className="text-sm font-semibold text-red-600">{state.error}</p>}
      {state.ok && state.message && <p className="text-sm font-semibold text-brand-600">{state.message}</p>}
    </form>
  );
}

/** 배정 해제 버튼 (확인 한 번) */
export function RemoveEnrollment({ enrollmentId, label }: { enrollmentId: number; label: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onRemove = () =>
    start(async () => {
      const res = await removeEnrollment(enrollmentId);
      setConfirming(false);
      if (res.ok) router.refresh();
      else setError(res.error ?? "해제하지 못했어요.");
    });

  return (
    <>
      {confirming ? (
        <span className="flex items-center gap-1">
          <button type="button" onClick={onRemove} disabled={pending} className="btn-dark !bg-red-600 !px-3 !py-1.5 text-xs hover:!bg-red-700">
            {pending ? "해제 중…" : "해제 확정"}
          </button>
          <button type="button" onClick={() => setConfirming(false)} className="btn-ghost !px-3 !py-1.5 text-xs">닫기</button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => {
            setError(null);
            setConfirming(true);
          }}
          className="btn-ghost !px-3 !py-1.5 text-xs text-red-600 hover:!bg-red-50"
          aria-label={`${label} 배정 해제`}
        >
          <Icon name="warning" size={14} />
          배정 해제
        </button>
      )}
      {error && <span className="text-xs font-semibold text-red-600">{error}</span>}
    </>
  );
}
