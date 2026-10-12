"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { decideStudyLevel } from "@/app/admin/study/actions";
import { Icon } from "@/components/ui/Icon";
import { Alert } from "@/components/ui/Alert";
import { cn } from "@/lib/utils";

/** 레벨 변경 요청 한 줄 — **글자는 서버가 다 만들어 넘긴다** (이름 · 지금 · 요청 · 시각) */
export type LevelRequestRow = { id: number; name: string; from: string; to: string; at: string };

/**
 * 레벨 변경 요청 — 조교 · 강사가 승인 · 거절한다 (2026-10-12 Alan "학생이 스터디 레벨을 변경하고 싶다면 신청한 후 조교나 강사승인이 있어야지").
 * 승인하면 학생의 레벨(단어 스터디는 시간대)이 그 자리에서 바뀐다 — DB 함수 decide_study_level. 학생은 내 스터디에서 결과를 본다 (알림은 가지 않는다).
 */
export function LevelRequests({ rows }: { rows: LevelRequestRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ kind: "success" | "warning"; text: string } | null>(null);

  const decide = (id: number, approve: boolean) =>
    startTransition(async () => {
      setBusyId(id);
      setMsg(null);
      const res = await decideStudyLevel(id, approve);
      setBusyId(null);
      if (res.error) return setMsg({ kind: "warning", text: res.error });
      setMsg({ kind: "success", text: res.message ?? "처리했어요." });
      router.refresh();
    });

  if (rows.length === 0) return null;
  return (
    <section aria-labelledby="level-requests-title" className="card mb-5 overflow-hidden border-amber-200">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-amber-50/70 px-5 py-3">
        <h2 id="level-requests-title" className="flex items-center gap-2 font-black text-ink">
          <Icon name="warning" size={20} />
          레벨 변경 요청 <span className="text-sm font-bold text-amber-800">{rows.length}건</span>
        </h2>
        <p className="text-xs text-slate">승인하면 바로 바뀌고 학생은 내 스터디에서 결과를 봐요. 알림은 가지 않아요.</p>
      </div>
      {msg && (
        <div className="px-5 pt-3">
          <Alert kind={msg.kind}>{msg.text}</Alert>
        </div>
      )}
      <ul className="divide-y divide-line">
        {rows.map((r) => {
          const busy = pending && busyId === r.id;
          return (
            <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 text-sm">
              <span className="min-w-0 flex-1">
                <b className="font-black text-ink">{r.name || "-"}</b>
                <span className="ml-2 text-ink-soft">
                  {r.from} <span aria-hidden className="text-mist">→</span>
                  <span className="sr-only">에서</span> <b className="font-bold text-brand-700">{r.to}</b>
                </span>
                <span className="ml-2 text-xs text-mist">{r.at} 요청</span>
              </span>
              <span className="flex gap-1">
                <button type="button" onClick={() => decide(r.id, true)} disabled={pending} className={cn("btn-primary !px-3 !py-1.5 text-xs", busy && "opacity-60")}>
                  {busy ? "처리 중…" : "승인"}
                </button>
                <button type="button" onClick={() => decide(r.id, false)} disabled={pending} className="btn-ghost !px-3 !py-1.5 text-xs text-red-600 hover:!bg-red-50">
                  거절
                </button>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
