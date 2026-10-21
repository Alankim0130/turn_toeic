import Link from "next/link";
import { boardDateLabel } from "@/lib/staff-board";
import { cn } from "@/lib/utils";
import { BulkCheck, BulkSelectAll } from "./BulkSelect";

export type StaffPostListItem = {
  id: number;
  title: string;
  /** 레벨 이름 — `650` · `650 · 750` · `모든 레벨` (2026-10-21) */
  levels: string;
  author_name: string | null;
  created_at: string;
  /** 붙은 것 — `파일 2개 · 링크 1개`. 비면 그리지 않는다 */
  attach: string;
};

/** 글 화면 주소 — 보던 레벨 탭을 들고 간다 (돌아올 때 그 탭으로) */
export const staffPostHref = (id: number, level: number | null) => `/admin/board/${id}${level !== null ? `?level=${level}` : ""}`;

/**
 * 직원 게시판 목록 (2026-10-21) — 게시판처럼 "제목 · 글쓴이 · 날짜" 한 줄, 누르면 그 글 화면. 최근 글이 위.
 * 모양은 수업자료실 공지 목록(`NoticeList`)과 같다 — 휴대폰에서는 제목 아래로 레벨 · 글쓴이 · 날짜를 내린다(한 줄에 다 두면 제목이 잘린다).
 * 레벨(`650` · `모든 레벨`)은 넓은 화면에서 글쓴이 앞 칩 — 레벨 탭 안에도 모든 레벨 글이 함께 서서 어느 쪽인지 보이게 한다.
 * 날짜는 오늘 올린 글이면 시각(`14:05`), 그 밖은 `25.10.21` (`boardDateLabel`).
 * `selectAll` 을 주면(강사 · 관리자 — 여러 개 옮기기, `BoardBulkMove` 안) 줄마다 고르기 칸이 링크 **옆에**(링크 안에 칸을 넣으면 HTML 이 깨진다) 서고
 * 맨 위 줄에 전체 선택(이 쪽 글)이 선다. 조교에게는 없다.
 */
export function StaffPostList({ items, level, selectAll }: { items: StaffPostListItem[]; level: number | null; selectAll?: string }) {
  const selectable = selectAll !== undefined;
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-xl2 border border-line bg-white">
      {selectable && (
        <li className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-surface/70 py-2 pl-3 pr-3 sm:pl-4 sm:pr-4">
          <BulkSelectAll keys={items.map((p) => `post:${p.id}`)} label={selectAll} />
          <span className="text-xs text-mist">골라서 수업자료실로 옮길 수 있어요</span>
        </li>
      )}
      {items.map((p) => {
        const author = p.author_name || "직원";
        const date = boardDateLabel(p.created_at);
        return (
          <li key={p.id} className={cn(selectable && "flex items-stretch")}>
            {selectable && <BulkCheck itemKey={`post:${p.id}`} label={p.title} className="pl-3 pr-1 sm:pl-4" />}
            <Link
              href={staffPostHref(p.id, level)}
              className={cn("flex items-center gap-3 py-3 transition hover:bg-brand-50/60", selectable ? "min-w-0 flex-1 pl-2 pr-3 sm:pr-4" : "px-3 sm:px-4")}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-ink sm:text-[15px]">{p.title}</span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-mist sm:hidden">
                  <span className="font-bold text-ink-soft">{p.levels}</span>
                  <span className="text-ink-soft">{author}</span>
                  <span className="tabular-nums">{date}</span>
                  {p.attach && <span className="font-bold text-ink-soft">{p.attach}</span>}
                </span>
              </span>
              {p.attach && <span className="hidden shrink-0 text-xs font-bold text-slate sm:inline">{p.attach}</span>}
              <span className="hidden shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-bold text-brand-700 sm:inline">{p.levels}</span>
              <span className="hidden w-24 shrink-0 truncate text-right text-sm text-ink-soft sm:inline">{author}</span>
              <span className="hidden w-20 shrink-0 text-right text-sm tabular-nums text-mist sm:inline">{date}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** 쪽 넘기기 — 글이 한 쪽(20개)을 넘을 때만 그린다. 보던 레벨 탭을 그대로 들고 다닌다 */
export function StaffBoardPager({ page, pages, level }: { page: number; pages: number; level: number | null }) {
  if (pages <= 1) return null;
  const href = (p: number) => {
    const q = new URLSearchParams();
    if (level !== null) q.set("level", String(level));
    if (p > 1) q.set("page", String(p));
    const s = q.toString();
    return `/admin/board${s ? `?${s}` : ""}`;
  };
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
