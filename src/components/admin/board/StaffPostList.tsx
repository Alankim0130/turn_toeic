import Link from "next/link";
import { boardDateLabel } from "@/lib/staff-board";

export type StaffPostListItem = {
  id: number;
  title: string;
  author_name: string | null;
  created_at: string;
  /** 붙은 것 — `파일 2개 · 링크 1개`. 비면 그리지 않는다 */
  attach: string;
};

/**
 * 직원 게시판 목록 (2026-10-21) — 게시판처럼 "제목 · 글쓴이 · 날짜" 한 줄, 누르면 그 글 화면. 최근 글이 위.
 * 모양은 수업자료실 공지 목록(`NoticeList`)과 같다 — 휴대폰에서는 제목 아래로 글쓴이 · 날짜를 내린다(한 줄에 다 두면 제목이 잘린다).
 * 날짜는 오늘 올린 글이면 시각(`14:05`), 그 밖은 `25.10.21` (`boardDateLabel`).
 */
export function StaffPostList({ items }: { items: StaffPostListItem[] }) {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-xl2 border border-line bg-white">
      {items.map((p) => {
        const author = p.author_name || "직원";
        const date = boardDateLabel(p.created_at);
        return (
          <li key={p.id}>
            <Link href={`/admin/board/${p.id}`} className="flex items-center gap-3 px-3 py-3 transition hover:bg-brand-50/60 sm:px-4">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-ink sm:text-[15px]">{p.title}</span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-mist sm:hidden">
                  <span className="text-ink-soft">{author}</span>
                  <span className="tabular-nums">{date}</span>
                  {p.attach && <span className="font-bold text-ink-soft">{p.attach}</span>}
                </span>
              </span>
              {p.attach && <span className="hidden shrink-0 text-xs font-bold text-slate sm:inline">{p.attach}</span>}
              <span className="hidden w-24 shrink-0 truncate text-right text-sm text-ink-soft sm:inline">{author}</span>
              <span className="hidden w-20 shrink-0 text-right text-sm tabular-nums text-mist sm:inline">{date}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** 쪽 넘기기 — 글이 한 쪽(20개)을 넘을 때만 그린다 */
export function StaffBoardPager({ page, pages }: { page: number; pages: number }) {
  if (pages <= 1) return null;
  const href = (p: number) => (p <= 1 ? "/admin/board" : `/admin/board?page=${p}`);
  return (
    <nav aria-label="쪽 넘기기" className="mt-4 flex items-center justify-center gap-2">
      {page > 1 ? (
        <Link href={href(page - 1)} className="btn-secondary !px-4 !py-2 text-sm">
          이전
        </Link>
      ) : (
        <span className="btn-secondary pointer-events-none !px-4 !py-2 text-sm opacity-40">이전</span>
      )}
      <span className="min-w-16 text-center text-sm tabular-nums text-slate">
        {page} / {pages}
      </span>
      {page < pages ? (
        <Link href={href(page + 1)} className="btn-secondary !px-4 !py-2 text-sm">
          다음
        </Link>
      ) : (
        <span className="btn-secondary pointer-events-none !px-4 !py-2 text-sm opacity-40">다음</span>
      )}
    </nav>
  );
}
