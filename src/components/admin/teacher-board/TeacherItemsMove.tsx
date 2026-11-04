"use client";

import { useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { moveTeacherItems } from "@/app/admin/teacher-board/actions";
import { Dialog } from "@/components/ui/Dialog";
import { ChoiceChip } from "@/components/admin/ChoiceChip";
import { BulkBar, BulkProvider, useBulkSelection } from "@/components/admin/board/BulkSelect";
import { ROUND_MAX, type RoundSubject } from "@/lib/class-rounds";
import { BOARD_LABEL, planItemMove, type MovingItem } from "@/lib/teacher-board";

/** 옮길 곳 고르기에 쓰는 폴더 */
export type MoveFolderOption = { id: number; subject: RoundSubject; name: string };
/** 고를 수 있는 자료 — 열쇠는 `item:id` */
export type MoveItemOption = MovingItem & { title: string };

export const itemKey = (id: number) => `item:${id}`;

/**
 * **강사 자료 게시판 — 고른 자료를 다른 폴더 · 회차로** (2026-11-04 Alan — "R 자료를 A 폴더에 잘못 넣어버렸는데 R 로 옮기려는데 옮길수가 없네용").
 * 폴더 안 자료 줄마다 고르기 칸 · 맨 위 `전체 선택`, 고르면 아래 막대의 `다른 폴더로 옮기기` → RC/LC · 폴더 · 회차(그대로 / 모두 이 회차로).
 * 같은 폴더를 고르면 회차만 바뀐다. 한 번의 서버 액션(`moveTeacherItems`)이 다 옮긴다 — 파일은 자료에 붙어 따라간다.
 * 고르기 칸(`BulkCheck`)은 직원 게시판 옮기기와 같은 조각이다 — 이 묶음 밖(테스트 등급)에서는 그리지 않는다.
 */
export function TeacherItemsMove({
  folder,
  folders,
  items,
  children,
}: {
  folder: MoveFolderOption;
  folders: MoveFolderOption[];
  items: MoveItemOption[];
  children: ReactNode;
}) {
  const router = useRouter();
  const sel = useBulkSelection(items.map((i) => itemKey(i.id)));
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState<RoundSubject>(folder.subject);
  const [target, setTarget] = useState<number | null>(null);
  const [keepSeq, setKeepSeq] = useState(true);
  const [seq, setSeq] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ moved: number; folderId: number; subject: RoundSubject } | null>(null);
  const [pending, startTransition] = useTransition();

  const picked = items.filter((i) => sel.selected.has(itemKey(i.id)));
  const list = folders.filter((f) => f.subject === subject);
  const to = list.find((f) => f.id === target) ?? null;
  // 미리 보기 — 서버와 같은 규칙. 옮길 폴더의 순서 번호는 서버가 다시 읽으므로 여기서는 회차만 본다
  const plan = to ? planItemMove(picked, to.id, new Map(), keepSeq ? null : seq) : [];
  const seqOf = new Map(plan.map((p) => [p.id, p.seq]));
  const sameFolder = to?.id === folder.id;

  /** 처음 고를 폴더 — 그 게시판에서 지금 폴더가 아닌 첫 폴더 (없으면 지금 폴더) */
  const firstOf = (s: RoundSubject) => {
    const inBoard = folders.filter((f) => f.subject === s);
    return (inBoard.find((f) => f.id !== folder.id) ?? inBoard[0] ?? null)?.id ?? null;
  };

  function openDialog() {
    if (picked.length === 0) return;
    setSubject(folder.subject);
    setTarget(firstOf(folder.subject));
    setKeepSeq(true);
    setSeq(Math.min(...picked.map((p) => p.seq)));
    setError(null);
    setDone(null);
    setOpen(true);
  }

  const close = () => {
    if (pending) return;
    setOpen(false);
  };

  const start = () => {
    if (!to || plan.length === 0) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await moveTeacherItems({ ids: picked.map((p) => p.id), folderId: to.id, seq: keepSeq ? null : seq });
        // 일부만 옮겼으면 고른 것을 그대로 둔다 — 다른 폴더로 간 것은 새로 그려지며 저절로 빠지고 남은 것만 골라져 있다
        if (res.moved) router.refresh();
        if (!res.ok) return setError(res.error ?? "옮기지 못했어요.");
        sel.clear();
        setDone({ moved: res.moved ?? plan.length, folderId: to.id, subject: to.subject });
      } catch {
        setError("연결이 끊겼어요. 새로고침한 뒤 옮겨졌는지 보고 다시 해 주세요.");
      }
    });
  };

  return (
    <BulkProvider value={{ selected: sel.selected, toggle: sel.toggle, setMany: sel.setMany, busy: pending }}>
      {children}
      <BulkBar count={sel.selected.size} onClear={sel.clear}>
        <button type="button" onClick={openDialog} className="btn-primary !px-4 !py-2 text-sm">
          다른 폴더로 옮기기
        </button>
      </BulkBar>
      <Dialog open={open} title={`고른 자료 ${picked.length || done?.moved || 0}개 옮기기`} onClose={close} dismissible={false}>
        {done ? (
          <div className="space-y-4">
            <p role="status" className="rounded-xl bg-brand-50 px-3 py-2 font-bold text-brand-700">
              {done.moved}개를 옮겼어요.
            </p>
            <div className="flex flex-wrap gap-2">
              {done.folderId !== folder.id && (
                <Link href={`/admin/teacher-board?subject=${done.subject}&folder=${done.folderId}`} className="btn-primary" onClick={() => setOpen(false)}>
                  그 폴더 보기
                </Link>
              )}
              <button type="button" onClick={() => setOpen(false)} className="btn-secondary">
                닫기
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-ink-soft">
              자료와 붙은 파일이 함께 옮겨져요. 학생에게는 <strong className="text-ink">옮긴 폴더</strong>를 쓰는 달 · 과정에서 그 회차 수업일부터 보여요.
            </p>
            <fieldset className="space-y-2">
              <legend className="mb-1.5 text-sm font-bold text-ink">어느 게시판 · 폴더로 옮길까요</legend>
              <div className="flex flex-wrap gap-1.5">
                {(["rc", "lc"] as const).map((s) => (
                  <ChoiceChip
                    key={s}
                    on={subject === s}
                    disabled={pending}
                    onClick={() => {
                      setSubject(s);
                      setTarget(firstOf(s));
                    }}
                  >
                    {BOARD_LABEL[s]}
                  </ChoiceChip>
                ))}
              </div>
              {list.length > 0 ? (
                <label className="block text-xs font-bold text-slate">
                  폴더
                  <select value={to?.id ?? ""} onChange={(e) => setTarget(Number(e.target.value))} disabled={pending} className="input mt-1 !py-2 text-sm">
                    {list.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                        {f.id === folder.id ? " (지금 폴더)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">{BOARD_LABEL[subject]}에 폴더가 없어요. 폴더를 먼저 더해 주세요.</p>
              )}
            </fieldset>
            <fieldset className="space-y-2">
              <legend className="mb-1.5 text-sm font-bold text-ink">회차는요</legend>
              <div className="flex flex-wrap items-center gap-2">
                <ChoiceChip on={keepSeq} disabled={pending} onClick={() => setKeepSeq(true)}>
                  회차 그대로
                </ChoiceChip>
                <ChoiceChip on={!keepSeq} disabled={pending} onClick={() => setKeepSeq(false)}>
                  모두 이 회차로
                </ChoiceChip>
                {!keepSeq && (
                  <select value={seq} onChange={(e) => setSeq(Number(e.target.value))} aria-label="회차" disabled={pending} className="input !w-32 !py-2 text-sm">
                    {Array.from({ length: ROUND_MAX }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        {n}회차
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <p className="rounded-xl bg-brand-50 px-3 py-2 text-ink-soft">
                {keepSeq ? "지금 회차 그대로 들어가요." : <>모두 <strong className="text-brand-700">{seq}회차</strong>에 들어가요.</>} 그 회차의 맨 뒤에 지금 순서대로 서요.
                {sameFolder && " 같은 폴더를 고르면 회차만 바뀌어요."}
              </p>
            </fieldset>
            {to && (
              <div className="space-y-1.5">
                <p className="text-sm font-bold text-ink">
                  옮길 자료 <span className="tabular-nums text-brand-700">{plan.length}</span>개
                  {picked.length > plan.length && <span className="font-semibold text-mist"> · 이미 그 자리 {picked.length - plan.length}개</span>}
                </p>
                <ul className="max-h-56 space-y-2 overflow-y-auto overscroll-contain rounded-xl border border-line p-2.5">
                  {picked.map((p) => (
                    <li key={p.id} className="min-w-0">
                      <p className={seqOf.has(p.id) ? "truncate text-sm font-bold text-ink" : "truncate text-sm font-bold text-mist"}>{p.title}</p>
                      <p className="text-xs text-slate">
                        {seqOf.has(p.id) ? `${p.seq}회차 → ${to.name} · ${seqOf.get(p.id)}회차` : `이미 ${to.name} · ${p.seq}회차예요`}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button type="button" onClick={start} disabled={!to || plan.length === 0 || pending} aria-busy={pending} className="btn-primary">
                {pending ? "옮기는 중…" : plan.length > 0 ? `${plan.length}개 옮기기` : "옮길 자료가 없어요"}
              </button>
              <button type="button" onClick={close} disabled={pending} className="btn-secondary">
                취소
              </button>
            </div>
            {error && (
              <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
                {error}
              </p>
            )}
          </div>
        )}
      </Dialog>
    </BulkProvider>
  );
}
