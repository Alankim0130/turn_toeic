import Link from "next/link";
import { cn } from "@/lib/utils";

const dateLabel = (iso: string) => new Date(iso).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", year: "2-digit", month: "2-digit", day: "2-digit" }).replace(/\s/g, "").replace(/\.$/, "");

/**
 * 수업자료실 공지 목록 (2026-10-05 Alan — 게시판처럼 "공지 · 제목 · 작성자 · 작성일" 줄, 누르면 공지 페이지가 새로 열린다).
 * 학생 수업자료실 · 관리자 수업자료실이 함께 쓴다 — 관리자 줄에는 범위(`scope`)가 붙는다.
 * 휴대폰에서는 제목 아래로 작성자 · 날짜를 내린다 (한 줄에 다 두면 제목이 잘린다).
 */
export function NoticeList({
  items,
  hrefOf,
  className,
}: {
  items: { id: number; title: string; author_name: string | null; created_at: string; scope?: string }[];
  hrefOf: (id: number) => string;
  className?: string;
}) {
  return (
    <ul className={cn("divide-y divide-line overflow-hidden rounded-xl2 border border-line bg-white", className)}>
      {items.map((n) => (
        <li key={n.id}>
          <Link href={hrefOf(n.id)} className="flex items-center gap-3 px-3 py-3 transition hover:bg-brand-50/60 sm:px-4">
            <span className="shrink-0 rounded-md border border-brand-300 px-2 py-0.5 text-xs font-bold text-brand-600">공지</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold text-brand-600 sm:text-[15px]">{n.title}</span>
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
        </li>
      ))}
    </ul>
  );
}
