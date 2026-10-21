"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Dialog } from "@/components/ui/Dialog";
import { moveClassMaterialToBoard, moveClassNoticeToBoard } from "@/app/admin/board/move-actions";
import { BulkBar, BulkProgress, BulkProvider, BulkResult, useBulkRunner, useBulkSelection } from "./BulkSelect";

/** 수업자료실에서 고를 수 있는 것 하나 — 공지 또는 회차 자료 (열쇠 `notice:id` · `material:id`) */
export type ClassBulkItem = {
  key: string;
  kind: "notice" | "material";
  id: number;
  title: string;
  /** 지금 자리 — `공지 · 650 RC` · `3회차` · `과정 · 회차 미정` */
  place: string;
  /** 직원 게시판에서 설 곳 — `650 · RC A과정` · `모든 레벨` (`boardPlaceLabel`) */
  boardPlace: string;
};

/**
 * 수업자료실 공지 · 회차 자료 → 직원 게시판 **여러 개 한꺼번에** (2026-10-21 Alan — "자료를 넘길때 여러개를 한번에 선택해서 넘길수 있도록 하면 좋겠어.
 * 그리고 전체선택도 같이 만들어줘"). 수업자료실 관리 화면(강사 · 관리자)의 공지 · 회차 자료를 감싼다 — 줄마다 고르기 칸, 목록마다 전체 선택
 * (`BulkSelectAll` — 공지 · 내린 공지 · 회차 자료 · 과정 회차 미정 자료), 고르면 아래 막대의 `직원 게시판으로`.
 * 고른 것은 화면에 선 순서(공지 → 회차 자료 회차 · 순서)대로 하나씩 옮긴다 — 하나 옮기기와 같은 서버 액션이라 레벨 · 원래 자리가 글마다 그대로 적힌다
 * (나중에 직원 게시판에서 여러 개를 골라 `원래 자리로` 를 고르면 한꺼번에 돌아온다).
 */
export function ClassBulkMove({ items, boardHref, children }: { items: ClassBulkItem[]; boardHref: string; children: ReactNode }) {
  const sel = useBulkSelection(items.map((i) => i.key));
  const runner = useBulkRunner();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const running = runner.state.phase === "running";
  const chosen = items.filter((i) => sel.selected.has(i.key));

  function openDialog() {
    if (chosen.length === 0) return;
    setCount(chosen.length);
    runner.reset();
    setOpen(true);
  }

  const close = () => {
    if (running) return;
    setOpen(false);
    runner.reset();
  };

  async function start() {
    if (running || chosen.length === 0) return;
    const jobs = chosen.map((i) => ({
      key: i.key,
      title: i.title,
      run: () => (i.kind === "notice" ? moveClassNoticeToBoard(i.id, { quiet: true }) : moveClassMaterialToBoard(i.id, { quiet: true })),
    }));
    const outcome = await runner.run(jobs);
    sel.keepOnly([...outcome.failed, ...outcome.notRun].map((n) => n.key));
  }

  const notices = chosen.filter((i) => i.kind === "notice").length;
  const materials = chosen.length - notices;

  return (
    <BulkProvider value={{ selected: sel.selected, toggle: sel.toggle, setMany: sel.setMany, busy: running }}>
      {children}
      <BulkBar count={sel.selected.size} onClear={sel.clear}>
        <button type="button" onClick={openDialog} className="btn-primary !px-4 !py-2 text-sm">
          직원 게시판으로
        </button>
      </BulkBar>
      <Dialog open={open} title={`고른 ${count}개 직원 게시판으로 옮기기`} onClose={close} dismissible={false}>
        {runner.state.phase === "running" ? (
          <BulkProgress state={runner.state} onStop={runner.stop} />
        ) : runner.state.phase === "done" ? (
          <BulkResult outcome={runner.state.outcome}>
            {runner.state.outcome.moved.length > 0 && (
              <Link href={boardHref} className="btn-primary" onClick={close}>
                직원 게시판 보기
              </Link>
            )}
            <button type="button" onClick={close} className="btn-secondary">
              닫기
            </button>
          </BulkResult>
        ) : (
          <div className="space-y-3">
            <ul className="list-disc space-y-1 pl-5 text-ink-soft">
              <li>
                학생 수업자료실에서 <strong className="text-ink">바로 빠져요</strong>. 강사 · 관리자 · 조교만 보는 직원 게시판의 글이 되고, 레벨 · 과목 · 과정은 공지 · 자료의 것 그대로예요.
              </li>
              <li>본문 · 사진 · 첨부 파일 · 링크는 그대로 옮겨 가고, 글쓴이는 옮기는 사람이 돼요.</li>
              <li>나중에 직원 게시판에서 골라 &lsquo;원래 자리로&rsquo; 를 고르면 지금 자리(공지 범위 · 회차)로 한꺼번에 돌아와요.</li>
            </ul>
            <p className="text-sm font-bold text-ink">
              {[notices > 0 ? `공지 ${notices}개` : null, materials > 0 ? `자료 ${materials}개` : null].filter(Boolean).join(" · ")}
            </p>
            <ul className="max-h-56 space-y-2 overflow-y-auto overscroll-contain rounded-xl border border-line p-2.5">
              {chosen.map((i) => (
                <li key={i.key} className="min-w-0">
                  <p className="truncate text-sm font-bold text-ink">{i.title}</p>
                  <p className="text-xs text-slate">
                    {i.place} → 직원 게시판 {i.boardPlace}
                  </p>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2 pt-1">
              <button type="button" onClick={start} disabled={chosen.length === 0} className="btn-primary">
                {chosen.length}개 옮기기
              </button>
              <button type="button" onClick={close} className="btn-secondary">
                취소
              </button>
            </div>
          </div>
        )}
      </Dialog>
    </BulkProvider>
  );
}
