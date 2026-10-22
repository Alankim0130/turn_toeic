"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { finishBoardMoves, type MoveResult } from "@/app/admin/board/move-actions";
import { bulkSummary } from "@/lib/board-move";
import { cn } from "@/lib/utils";

/**
 * 여러 개 골라 한꺼번에 옮기기 (2026-10-21 Alan — "자료를 넘길때 여러개를 한번에 선택해서 넘길수 있도록 하면 좋겠어. 그리고 전체선택도 같이 만들어줘").
 * 직원 게시판 목록(`BoardBulkMove`) · 수업자료실(`ClassBulkMove`)이 함께 쓰는 조각:
 *  - `BulkCheck` 줄마다 고르기 칸 · `BulkSelectAll` 전체 선택(일부만 골랐으면 반쯤 찬 칸) — 옮기기 묶음(Provider) 밖이면 아무것도 그리지 않는다
 *    (조교 화면 · 테스트 등급에는 칸이 없다 — 옮기기는 강사 · 관리자만이다)
 *  - `BulkBar` 고르면 아래에 서는 막대 (숙제 미제출 알림과 같은 자리 — 휴대폰은 하단 메뉴 위)
 *  - `useBulkRunner` **하나씩 차례로** 옮긴다 — 하나 옮기기와 같은 서버 액션(`quiet`)이라 규칙 · 되돌리기가 같고, 한 번에 하나라 서버 시간(60초)에 걸리지 않는다.
 *    실패해도 나머지는 계속 옮기고, 권한처럼 다음 것도 똑같이 막힐 실패(`stop`)면 거기서 멈춘다. 다 끝나면 `finishBoardMoves` 로 화면을 한 번 새로 그린다.
 * 열쇠는 `post:12` · `notice:3` · `material:9`.
 */

type BulkCtx = {
  selected: ReadonlySet<string>;
  toggle: (key: string, on: boolean) => void;
  setMany: (keys: readonly string[], on: boolean) => void;
  busy: boolean;
};

const BulkContext = createContext<BulkCtx | null>(null);

export function BulkProvider({ value, children }: { value: BulkCtx; children: ReactNode }) {
  return <BulkContext.Provider value={value}>{children}</BulkContext.Provider>;
}

/** 고른 것 — 화면이 새로 그려져 사라진 열쇠(옮겨졌거나 지워졌다)는 저절로 빠진다 */
export function useBulkSelection(validKeys: readonly string[]) {
  const [raw, setRaw] = useState<ReadonlySet<string>>(() => new Set());
  const selected = useMemo(() => {
    const valid = new Set(validKeys);
    return new Set([...raw].filter((k) => valid.has(k)));
  }, [raw, validKeys]);
  const toggle = useCallback(
    (key: string, on: boolean) =>
      setRaw((prev) => {
        const next = new Set(prev);
        if (on) next.add(key);
        else next.delete(key);
        return next;
      }),
    [],
  );
  const setMany = useCallback(
    (keys: readonly string[], on: boolean) =>
      setRaw((prev) => {
        const next = new Set(prev);
        for (const k of keys) {
          if (on) next.add(k);
          else next.delete(k);
        }
        return next;
      }),
    [],
  );
  const clear = useCallback(() => setRaw(new Set()), []);
  /** 끝난 뒤 — 못 옮긴 것만 골라 둔다 (까닭을 보고 다시 옮기게) */
  const keepOnly = useCallback((keys: readonly string[]) => setRaw(new Set(keys)), []);
  return { selected, toggle, setMany, clear, keepOnly };
}

/** 줄의 고르기 칸 — 칸을 둘러싼 자리까지 눌린다(휴대폰 손가락). 옮기기 묶음 밖이면 그리지 않는다 */
export function BulkCheck({ itemKey, label, className }: { itemKey: string; label: string; className?: string }) {
  const ctx = useContext(BulkContext);
  if (!ctx) return null;
  return (
    <label className={cn("flex shrink-0 cursor-pointer items-center", className)}>
      <input
        type="checkbox"
        checked={ctx.selected.has(itemKey)}
        onChange={(e) => ctx.toggle(itemKey, e.target.checked)}
        disabled={ctx.busy}
        aria-label={`${label} 고르기`}
        className="size-4 accent-brand-500"
      />
    </label>
  );
}

/** 전체 선택 — 이 묶음을 모두 고르거나 모두 푼다. 일부만 골랐으면 반쯤 찬 칸이고 누르면 모두 고른다 */
export function BulkSelectAll({ keys, label = "전체 선택", className }: { keys: readonly string[]; label?: string; className?: string }) {
  const ctx = useContext(BulkContext);
  if (!ctx || keys.length === 0) return null;
  const n = keys.filter((k) => ctx.selected.has(k)).length;
  const all = n === keys.length;
  return (
    <label className={cn("inline-flex cursor-pointer items-center gap-2 text-sm font-bold text-ink-soft", className)}>
      <input
        type="checkbox"
        checked={all}
        ref={(el) => {
          if (el) el.indeterminate = n > 0 && !all;
        }}
        onChange={() => ctx.setMany(keys, !all)}
        disabled={ctx.busy}
        className="size-4 accent-brand-500"
      />
      {label}
      <span className="font-semibold tabular-nums text-mist">{n > 0 ? `${n}/${keys.length}` : `${keys.length}개`}</span>
    </label>
  );
}

/** 고르면 아래에 서는 막대 — `N개 선택` + 옮기기 단추 (children). 휴대폰은 하단 메뉴 위 (숙제 미제출 알림과 같은 자리) */
export function BulkBar({ count, onClear, children }: { count: number; onClear: () => void; children: ReactNode }) {
  if (count === 0) return null;
  return (
    <div className="bar-above-nav z-20 mt-4 flex items-center gap-2 rounded-xl2 border border-line bg-paper/95 p-2.5 shadow-soft backdrop-blur sm:p-3">
      <button type="button" onClick={onClear} aria-label="선택 해제" title="선택 해제" className="flex size-9 shrink-0 items-center justify-center rounded-full text-slate hover:bg-surface">
        <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>
      <span className="shrink-0 rounded-full bg-brand-50 px-3 py-1 text-sm font-black tabular-nums text-brand-700">{count}개 선택</span>
      <span className="ml-auto">{children}</span>
    </div>
  );
}

/** 옮길 것 하나 — 하나 옮기기와 같은 서버 액션을 `quiet` 로 부른다 */
export type BulkJob = { key: string; title: string; run: () => Promise<MoveResult> };
/** 옮기지 않은 것 하나 — 까닭과 함께 */
export type BulkNote = { key: string; title: string; why: string };
export type BulkOutcome = { moved: string[]; failed: BulkNote[]; skipped: BulkNote[]; notRun: BulkNote[] };
export type BulkState =
  | { phase: "idle" }
  | { phase: "running"; done: number; total: number; current: string; stopping: boolean }
  | { phase: "done"; outcome: BulkOutcome };

const RUN_FAIL = "옮기지 못했어요. 잠시 후 다시 시도해 주세요.";

/** 하나씩 차례로 옮긴다 — 진행 · 멈추기 · 결과 */
export function useBulkRunner() {
  const router = useRouter();
  const [state, setState] = useState<BulkState>({ phase: "idle" });
  const stopRef = useRef(false);

  const run = useCallback(
    async (jobs: readonly BulkJob[], skipped: readonly BulkNote[] = []): Promise<BulkOutcome> => {
      stopRef.current = false;
      const moved: string[] = [];
      const failed: BulkNote[] = [];
      let i = 0;
      for (; i < jobs.length; i++) {
        if (stopRef.current) break;
        const job = jobs[i];
        setState({ phase: "running", done: i, total: jobs.length, current: job.title, stopping: false });
        let res: MoveResult;
        try {
          res = await job.run();
        } catch {
          res = { ok: false, error: RUN_FAIL };
        }
        if (res.ok) {
          moved.push(job.key);
        } else {
          failed.push({ key: job.key, title: job.title, why: res.error ?? RUN_FAIL });
          // 권한 · 테스트 등급처럼 다음 것도 똑같이 막히면 거기서 멈춘다
          if (res.stop) {
            i += 1;
            break;
          }
        }
      }
      const notRun = jobs.slice(i).map((j) => ({ key: j.key, title: j.title, why: "멈춰서 옮기지 않았어요." }));
      if (moved.length > 0) {
        // 하나씩은 화면을 다시 그리지 않고 옮겼다 — 여기서 한 번 (실패해도 아래 refresh 가 이 화면은 새로 받는다)
        try {
          await finishBoardMoves();
        } catch {
          // 다른 화면이 30초 늦게 바뀔 뿐이다
        }
        router.refresh();
      }
      const outcome: BulkOutcome = { moved, failed, skipped: [...skipped], notRun };
      setState({ phase: "done", outcome });
      return outcome;
    },
    [router],
  );

  /** 지금 것만 옮기고 멈춘다 (하나 옮기기는 중간에 끊으면 안 된다 — 사진 · 파일 복사와 글 지우기가 한 묶음이다) */
  const stop = useCallback(() => {
    stopRef.current = true;
    setState((s) => (s.phase === "running" ? { ...s, stopping: true } : s));
  }, []);
  const reset = useCallback(() => setState({ phase: "idle" }), []);
  return { state, run, stop, reset };
}

/** 옮기는 동안 — `옮기는 중 3/10` · 지금 옮기는 글 · 막대 · 멈추기 */
export function BulkProgress({ state, onStop }: { state: Extract<BulkState, { phase: "running" }>; onStop: () => void }) {
  const pct = Math.round((state.done / Math.max(state.total, 1)) * 100);
  return (
    <div className="space-y-2.5" role="status" aria-live="polite">
      <p className="font-black text-ink">
        옮기는 중 <span className="tabular-nums">{state.done + 1}/{state.total}</span>
      </p>
      <p className="truncate text-xs text-slate">{state.current}</p>
      <div className="h-2 overflow-hidden rounded-full bg-surface" aria-hidden>
        <div className="h-full rounded-full bg-brand-500 transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-mist">하나씩 차례로 옮겨요. 다 끝날 때까지 이 창을 닫지 말아 주세요.</p>
      <button type="button" onClick={onStop} disabled={state.stopping} className="btn-secondary !px-4 !py-2 text-sm">
        {state.stopping ? "지금 것만 옮기고 멈출게요…" : "멈추기"}
      </button>
    </div>
  );
}

/** 끝난 뒤 — 한 줄 요약 · 못 옮긴 것과 까닭 · 단추 (children) */
export function BulkResult({ outcome, children }: { outcome: BulkOutcome; children: ReactNode }) {
  const problems = [...outcome.failed, ...outcome.skipped, ...outcome.notRun];
  const summary = bulkSummary({ moved: outcome.moved.length, failed: outcome.failed.length, skipped: outcome.skipped.length, notRun: outcome.notRun.length });
  return (
    <div className="space-y-3">
      <p role="status" className={cn("rounded-xl px-3 py-2 font-bold", problems.length > 0 ? "bg-amber-50 text-amber-800" : "bg-brand-50 text-brand-700")}>
        {summary}
      </p>
      {problems.length > 0 && (
        <>
          <ul className="max-h-56 space-y-2 overflow-y-auto overscroll-contain rounded-xl border border-line p-2.5">
            {problems.map((p) => (
              <li key={p.key} className="min-w-0">
                <p className="truncate text-sm font-bold text-ink">{p.title}</p>
                <p className="text-xs text-amber-800">{p.why}</p>
              </li>
            ))}
          </ul>
          <p className="text-xs text-mist">옮기지 못한 것은 그대로 골라 두었어요. 까닭을 보고 다시 옮겨 주세요.</p>
        </>
      )}
      <div className="flex flex-wrap items-center gap-2 pt-1">{children}</div>
    </div>
  );
}
