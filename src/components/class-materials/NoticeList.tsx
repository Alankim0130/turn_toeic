import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const dateLabel = (iso: string) => new Date(iso).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", year: "2-digit", month: "2-digit", day: "2-digit" }).replace(/\s/g, "").replace(/\.$/, "");

export type NoticeListItem = { id: number; title: string; author_name: string | null; created_at: string; scope?: string; published?: boolean };

/**
 * 수업자료실 공지 목록 (2026-10-05 Alan — 게시판처럼 "공지 · 제목 · 작성자 · 작성일" 줄, 누르면 공지 페이지가 새로 열린다).
 * 학생 수업자료실 · 관리자 수업자료실이 함께 쓴다 — 관리자 줄에는 범위(`scope`)가 붙고, **내린 공지**(`published: false`)는 회색 `내림` 배지다
 * (2026-10-06 Alan "등록했다가 내리기"). `trailing` 은 줄 오른쪽에 링크 밖으로 두는 조각(관리자의 내리기 · 다시 올리기 토글) —
 * 링크 안에 버튼을 넣으면 HTML 이 깨지므로 형제로 둔다.
 * 휴대폰에서는 제목 아래로 작성자 · 날짜를 내린다 (한 줄에 다 두면 제목이 잘린다).
 */
export function NoticeList({
  items,
  hrefOf,
  trailing,
  className,
}: {
  items: NoticeListItem[];
  hrefOf: (id: number) => string;
  trailing?: (item: NoticeListItem) => ReactNode;
  className?: string;
}) {
  return (
    <ul className={cn("divide-y divide-line overflow-hidden rounded-xl2 border border-line bg-white", className)}>
      {items.map((n) => {
        const down = n.published === false;
        return (
          <li key={n.id} className="flex items-center gap-2 pr-2 sm:pr-3">
            <Link href={hrefOf(n.id)} className={cn("flex min-w-0 flex-1 items-center gap-3 px-3 py-3 transition hover:bg-brand-50/60 sm:px-4", down && "opacity-80")}>
              <span className={cn("shrink-0 rounded-md border px-2 py-0.5 text-xs font-bold", down ? "border-line bg-surface text-slate" : "border-brand-300 text-brand-600")}>
                {down ? "내림" : "공지"}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn("block truncate text-sm font-bold sm:text-[15px]", down ? "text-ink-soft" : "text-brand-600")}>{n.title}</span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-mist sm:hidden">
                  {n.scope && <span className="font-bold text-ink-soft">{n.scope}</span>}
                  <span>{n.author_name ?? "강사"}</span>
                  <span className="tabular-nums">{dateLabel(n.created_at)}</span>
                </span>
              </span>
              {n.scope && <span className="hidden shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-bold text-brand-700 sm:inline">{n.scope}</span>}
              <span className="hidden w-20 shrink-0 truncate text-right text-sm text-ink-soft sm:inline">{n.author_name ?? "강사"}</span>
              <span className="hidden w-20 shrink-0 text-right text-sm tabular-nums text-mist sm:inline">{dateLabel(n.created_at)}</span>
            </Link>
            {trailing?.(n)}
          </li>
        );
      })}
    </ul>
  );
}
