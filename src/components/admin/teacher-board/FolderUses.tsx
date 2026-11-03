"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addFolderUse, removeFolderUse } from "@/app/admin/teacher-board/actions";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";

export type TermOption = { id: number; label: string };

/**
 * **몇월 수업자료로 쓰기** (2026-11-03 Alan — "그걸 몇월 수업자료로 사용하고 싶다고 하면 그 자료들이 학생들에게 오픈되면 좋겠어").
 * 달 · 레벨 · 과정(A/B)을 고르면 그 달 그 과정 반 학생에게 이 폴더 자료가 회차 수업일마다 열리고, **그 달 그 칸의 수업자료실 자료는 닫힌다**
 * (Alan "그 달은 폴더 자료만"). 한 칸에는 폴더 하나 — 이미 다른 폴더가 있으면 서버가 그 이름을 말해 준다.
 */
export function FolderUses({
  folderId,
  subject,
  uses,
  terms,
  levels,
  disabled,
}: {
  folderId: number;
  subject: "rc" | "lc";
  uses: { id: number; label: string; ended: boolean }[];
  terms: TermOption[];
  levels: number[];
  disabled: boolean;
}) {
  const router = useRouter();
  const [termId, setTermId] = useState<number | "">(terms[0]?.id ?? "");
  // 처음 고르는 레벨 — 가장 높은 레벨 (Alan "850반 자료는 매달 바뀌기 때문에"). 레벨 숫자를 코드에 적지 않는다 (작업 원칙 4)
  const [level, setLevel] = useState<number | "">(levels.length > 0 ? Math.max(...levels) : "");
  const [set, setSet] = useState<"A" | "B">("A");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const subjectLabel = subject.toUpperCase();

  const run = (job: () => Promise<{ ok: boolean; error?: string }>, message: string) =>
    startTransition(async () => {
      setError(null);
      setDone(null);
      try {
        const res = await job();
        if (!res.ok) return setError(res.error ?? "하지 못했어요.");
        setDone(message);
        router.refresh();
      } catch {
        setError("연결이 끊겼어요. 새로고침한 뒤 다시 해 주세요.");
      }
    });

  const onAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (termId === "" || level === "") return setError("달과 레벨을 골라 주세요.");
    const term = terms.find((t) => t.id === termId)?.label ?? "";
    run(() => addFolderUse({ folderId, termId, level, set }), `${term} ${level} ${subjectLabel} ${set}과정 자료로 쓰기로 했어요.`);
  };

  return (
    <section aria-labelledby={`uses-${folderId}`} className="card space-y-3 p-4 sm:p-5">
      <div>
        <h3 id={`uses-${folderId}`} className="flex items-center gap-1.5 font-black text-ink">
          <Icon name="calendar" size={18} />
          몇월 수업자료로 쓰기
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-slate">
          고른 달 · 과정 반 학생에게 이 폴더 자료가 <strong className="text-ink">회차 수업일마다 하나씩</strong> 열려요. 그 달 그 과정은 수업자료실 자료 대신
          <strong className="text-ink"> 이 폴더 자료만</strong> 보여요.
        </p>
      </div>

      {uses.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {uses.map((u) => (
            <li key={u.id} className={cn("flex items-center gap-1 rounded-full border px-3 py-1 text-sm font-bold", u.ended ? "border-line bg-surface text-slate" : "border-brand-200 bg-brand-50 text-brand-700")}>
              <span>
                {u.label}
                {u.ended && <span className="ml-1 text-xs font-semibold">(종강)</span>}
              </span>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => run(() => removeFolderUse(u.id), `${u.label} 에서 뺐어요. 그 달 그 과정은 다시 수업자료실 자료가 열려요.`)}
                  disabled={pending}
                  aria-label={`${u.label} 에서 빼기`}
                  className="ml-1 shrink-0 whitespace-nowrap rounded-full px-1.5 text-xs text-slate hover:bg-paper hover:text-red-600"
                >
                  빼기
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate">아직 어느 달에도 쓰지 않아요 — 학생에게는 보이지 않아요.</p>
      )}

      {!disabled &&
        (terms.length === 0 ? (
          <p className="text-xs text-slate">쓸 수 있는 달이 없어요. 반 편성 달력에서 그 달 개강일 · 종강일을 먼저 저장해 주세요.</p>
        ) : (
          <form onSubmit={onAdd} className="flex flex-wrap items-end gap-2 rounded-xl border border-line bg-surface p-3">
            <label className="min-w-0 text-xs font-bold text-slate">
              달
              <select value={termId} onChange={(e) => setTermId(Number(e.target.value))} className="input mt-1 !py-2 text-sm" disabled={pending}>
                {terms.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="min-w-0 text-xs font-bold text-slate">
              레벨
              <select value={level} onChange={(e) => setLevel(Number(e.target.value))} className="input mt-1 !py-2 text-sm" disabled={pending}>
                {levels.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <fieldset className="text-xs font-bold text-slate">
              <legend>과정</legend>
              <div className="mt-1 flex gap-1">
                {(["A", "B"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSet(s)}
                    aria-pressed={set === s}
                    disabled={pending}
                    className={cn("rounded-xl border px-3 py-2 text-sm font-bold", set === s ? "border-brand-500 bg-brand-500 text-white" : "border-line bg-paper text-slate")}
                  >
                    {s}과정
                  </button>
                ))}
              </div>
            </fieldset>
            <button type="submit" disabled={pending} aria-busy={pending} className="btn-primary !px-4 !py-2 text-sm">
              {pending ? "저장 중…" : "이 달 자료로 쓰기"}
            </button>
          </form>
        ))}

      {error && (
        <p role="alert" className="text-xs font-semibold text-red-600">
          {error}
        </p>
      )}
      {done && !error && <p className="text-xs font-semibold text-brand-700">{done}</p>}
    </section>
  );
}
