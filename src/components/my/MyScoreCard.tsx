"use client";

import { useState, useTransition } from "react";
import { Icon } from "@/components/ui/Icon";
import { cn, formatDate } from "@/lib/utils";
import { goalPercent, pointsToGo } from "@/lib/student-survey";
import { saveMyScores } from "@/app/my/survey/actions";

export type MyScores = {
  now_total: number | null;
  now_lc: number | null;
  now_rc: number | null;
  now_target: number;
  now_updated_at: string;
};

/**
 * 마이페이지 맨 위 — **지금 점수와 목표 점수** (2026-10-28 Alan "현재점수와 목표점수는 학생 개인 프로필을 누르면 보일 수 있으면 좋겠어.
 * 학생 마이페이지 최상단에 넣어놓으면 동기부여가 되지 않을까싶어. 목표점수와 현재점수는 수정이 가능하도록 해줘").
 *
 * 처음 값은 수강생 설문의 답이고, `고치기` 로 바꾼다 (`saveMyScores` — 내 줄의 now_* 칸만). 설문 때 점수는 그대로 남아 강사 · 관리자가 함께 본다.
 * 막대는 지금 ÷ 목표. 이모지 없이 글자와 막대만.
 */
export function MyScoreCard({ scores }: { scores: MyScores }) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [hasScore, setHasScore] = useState(scores.now_total != null);
  const [total, setTotal] = useState("");
  const [lc, setLc] = useState("");
  const [rc, setRc] = useState("");
  const [target, setTarget] = useState("");

  const now = scores.now_total;
  const goal = scores.now_target;
  const left = pointsToGo(now, goal);
  const percent = goalPercent(now, goal);
  const reached = left === 0;

  function open() {
    setHasScore(now != null);
    setTotal(now != null ? String(now) : "");
    setLc(scores.now_lc != null ? String(scores.now_lc) : "");
    setRc(scores.now_rc != null ? String(scores.now_rc) : "");
    setTarget(String(goal));
    setError(null);
    setEditing(true);
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await saveMyScores({ hasScore, total, lc, rc, target });
      if (!res.ok) return setError(res.error);
      // 서버 액션이 마이페이지를 다시 그려 새 점수가 그대로 들어온다
      setEditing(false);
    });
  }

  return (
    <section aria-labelledby="my-score-title" className="card p-4 sm:p-5">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50">
          <Icon name="target" size={24} />
        </span>
        <h2 id="my-score-title" className="text-sm font-black text-ink">
          내 점수와 목표
        </h2>
        {!editing && (
          <button type="button" onClick={open} className="ml-auto rounded-full border border-line px-3 py-1.5 text-xs font-bold text-ink-soft hover:border-brand-300 hover:text-brand-600">
            점수 고치기
          </button>
        )}
      </div>

      {editing ? (
        <form onSubmit={save} className="mt-4 space-y-4" noValidate>
          <div>
            <span className="label">지금 토익 점수</span>
            <div className="flex flex-wrap gap-2">
              {[
                { on: true, label: "점수가 있어요" },
                { on: false, label: "아직 시험을 본 적이 없어요" },
              ].map((o) => (
                <button
                  key={o.label}
                  type="button"
                  aria-pressed={hasScore === o.on}
                  disabled={pending}
                  onClick={() => setHasScore(o.on)}
                  className={cn(
                    "rounded-full border px-3.5 py-2 text-sm font-bold transition disabled:opacity-50",
                    hasScore === o.on ? "border-brand-400 bg-brand-500 text-white shadow-pink" : "border-line bg-paper text-ink-soft hover:border-brand-300 hover:text-brand-600",
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          {hasScore && (
            <div className="grid grid-cols-3 gap-2 sm:max-w-md">
              <div>
                <label htmlFor="score-total" className="label">
                  총점
                </label>
                <input id="score-total" value={total} onChange={(e) => setTotal(e.target.value)} inputMode="numeric" maxLength={3} className="input tabular-nums" placeholder="650" disabled={pending} />
              </div>
              <div>
                <label htmlFor="score-lc" className="label">
                  LC <span className="font-normal text-mist">(선택)</span>
                </label>
                <input id="score-lc" value={lc} onChange={(e) => setLc(e.target.value)} inputMode="numeric" maxLength={3} className="input tabular-nums" placeholder="330" disabled={pending} />
              </div>
              <div>
                <label htmlFor="score-rc" className="label">
                  RC <span className="font-normal text-mist">(선택)</span>
                </label>
                <input id="score-rc" value={rc} onChange={(e) => setRc(e.target.value)} inputMode="numeric" maxLength={3} className="input tabular-nums" placeholder="320" disabled={pending} />
              </div>
            </div>
          )}
          <div className="sm:max-w-[10rem]">
            <label htmlFor="score-target" className="label">
              목표 점수
            </label>
            <input id="score-target" value={target} onChange={(e) => setTarget(e.target.value)} inputMode="numeric" maxLength={3} className="input tabular-nums" placeholder="850" disabled={pending} />
          </div>
          {error && (
            <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={pending} className="btn-primary !py-2 text-sm">
              {pending ? "저장하는 중…" : "저장"}
            </button>
            <button type="button" disabled={pending} onClick={() => setEditing(false)} className="btn-secondary !py-2 text-sm">
              취소
            </button>
          </div>
        </form>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <div className="rounded-xl bg-surface px-3 py-2.5">
              <p className="text-xs font-bold text-slate">지금</p>
              {now != null ? (
                <>
                  <p className="text-2xl font-black tabular-nums text-ink">
                    {now}
                    <span className="ml-0.5 text-sm font-bold">점</span>
                  </p>
                  {scores.now_lc != null && scores.now_rc != null && (
                    <p className="text-xs tabular-nums text-slate">
                      LC {scores.now_lc} · RC {scores.now_rc}
                    </p>
                  )}
                </>
              ) : (
                <p className="mt-1 text-sm font-bold text-ink-soft">아직 없어요</p>
              )}
            </div>
            <div className="rounded-xl bg-brand-50 px-3 py-2.5">
              <p className="text-xs font-bold text-brand-700">목표</p>
              <p className="text-2xl font-black tabular-nums text-brand-600">
                {goal}
                <span className="ml-0.5 text-sm font-bold">점</span>
              </p>
            </div>
          </div>
          <div className="mt-3">
            <div
              className="h-2.5 overflow-hidden rounded-full bg-brand-50"
              role="progressbar"
              aria-label="목표까지"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
            >
              <div className="h-full rounded-full bg-brand-500 transition-[width] duration-500" style={{ width: `${percent}%` }} />
            </div>
            <p className="mt-1.5 text-sm font-bold text-ink">
              {now == null
                ? "첫 토익을 보면 점수를 적어 주세요."
                : reached
                  ? "목표를 이뤘어요! 새 목표를 세워 볼까요?"
                  : `목표까지 ${left}점 남았어요`}
            </p>
            <p className="mt-0.5 text-xs text-mist">
              {formatDate(scores.now_updated_at, { month: "long", day: "numeric" })}에 적은 점수
            </p>
          </div>
        </>
      )}
    </section>
  );
}
