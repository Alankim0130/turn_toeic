"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/Dialog";
import { moveClassMaterialToBoard, moveClassNoticeToBoard } from "@/app/admin/board/move-actions";
import { cn } from "@/lib/utils";

/**
 * 수업자료실 공지 · 회차 자료 → 직원 게시판 옮기기 (2026-10-21 Alan — "반대로 수업게시물에 있는 내용을 다시 직원게시판으로 옮길 수 도 있어야해").
 * 강사 · 관리자 화면(수업자료실)에만 선다. 옮기면 학생 화면에서 바로 빠지고 직원 게시판의 그 레벨 · 칸(과목 · 과정) 글이 된다 — 원래 자리는 글에 적어 두어
 * 다시 수업자료실로 옮길 때 미리 골라진다. 끝나면 옮겨 간 직원 게시판 글 화면으로 간다.
 * `row` = 회차 자료 줄의 작은 단추 · `bar` = 공지 고치기 화면 상태 줄의 알약 (공지 내리기 토글 옆)
 */
export function MoveToBoardButton({
  kind,
  id,
  title,
  place,
  variant = "row",
}: {
  kind: "notice" | "material";
  id: number;
  title: string;
  /** 직원 게시판에서 설 곳 — `650 · RC A과정` · `모든 레벨` (`boardPlaceLabel`) */
  place: string;
  variant?: "row" | "bar";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const what = kind === "notice" ? "공지" : "자료";

  async function move() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = kind === "notice" ? await moveClassNoticeToBoard(id) : await moveClassMaterialToBoard(id);
    if (!res.ok) {
      setBusy(false);
      return setError(res.error ?? "옮기지 못했어요.");
    }
    router.push(res.href ?? "/admin/board");
    router.refresh();
  }

  const close = () => {
    if (!busy) setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        aria-label={`${title} — 직원 게시판으로 옮기기`}
        className={cn(
          variant === "bar"
            ? "shrink-0 whitespace-nowrap rounded-full border border-line bg-white px-3 py-1.5 text-xs font-bold text-ink-soft transition hover:border-brand-300 hover:text-brand-600"
            : "btn-ghost !px-3 !py-1.5 text-xs",
        )}
      >
        직원 게시판으로
      </button>
      <Dialog open={open} title="직원 게시판으로 옮기기" onClose={close}>
        <div className="space-y-3">
          <p className="font-bold text-ink [overflow-wrap:anywhere]">{title}</p>
          <ul className="list-disc space-y-1 pl-5 text-ink-soft">
            <li>
              학생 수업자료실에서 <strong className="text-ink">바로 빠져요</strong>. 강사 · 관리자 · 조교만 보는 직원 게시판의 <strong className="text-ink">{place}</strong> 글이 돼요.
            </li>
            <li>본문 · 사진 · 첨부 파일 · 링크는 그대로 옮겨 가고, 글쓴이는 옮기는 사람이 돼요.</li>
            <li>나중에 그 글에서 &lsquo;수업자료실로 옮기기&rsquo; 를 누르면 지금 자리({what === "공지" ? "공지 범위" : "레벨 · 과목 · 과정 · 회차"})가 미리 골라져 있어요.</li>
          </ul>
          {error && (
            <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 font-bold text-red-700">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            <button type="button" onClick={move} disabled={busy} className="btn-primary">
              {busy ? "옮기는 중…" : `이 ${what} 옮기기`}
            </button>
            <button type="button" onClick={close} disabled={busy} className="btn-secondary">
              취소
            </button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
