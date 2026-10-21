import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { StaffBoardPager, StaffPostList, type StaffPostListItem } from "@/components/admin/board/StaffPostList";
import { requireCrew } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { materialLinks } from "@/lib/class-materials";
import { boardPage, boardPageCount, STAFF_BOARD_PAGE_SIZE, STAFF_BOARD_TESTING_NOTE, staffPostAttachLabel } from "@/lib/staff-board";

export const metadata: Metadata = { title: "직원 게시판", robots: { index: false } };

/**
 * 직원 게시판 (2026-10-21 Alan — "관리자모드에서 직원들만 사용할 수 있는 게시판을 하나 만들어주면 좋겠어" → 물음에 "조교도 읽고 쓰기" · "글만 올리기").
 * 관리자 메뉴 `직원 → 직원 게시판`. 강사 · 관리자 · 조교가 읽고 쓴다 — 열째 조교 화면 (등급 체계 9-1). 학생에게는 메뉴도 데이터도 없다 (DB 정책).
 * 목록은 최근 글부터 한 쪽에 20개. 누르면 그 글 화면(`/admin/board/{id}`).
 */
export default async function StaffBoardPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  // 레이아웃이 조교를 통과시키므로 화면마다 막는다 — 이 화면은 조교에게 열려 있다
  const { profile } = await requireCrew();
  const testing = profile.test_role != null;
  const page = boardPage((await searchParams).page);

  const header = (
    <PageHeader icon="offline" title="직원 게시판" description="강사 · 관리자 · 조교만 보는 게시판이에요. 학생에게는 보이지 않아요.">
      {!testing && (
        <Link href="/admin/board/new" className="btn-primary">
          글쓰기
        </Link>
      )}
    </PageHeader>
  );

  // 테스트 등급을 켜면 DB 가 학생으로 보아 글이 0건으로 읽힌다 — 읽지 않고 안내한다 (인수인계 체크와 같은 규칙)
  if (testing) {
    return (
      <>
        {header}
        <p className="card p-5 text-sm text-slate">{STAFF_BOARD_TESTING_NOTE}</p>
      </>
    );
  }

  const supabase = await createClient();
  const from = (page - 1) * STAFF_BOARD_PAGE_SIZE;
  const { data, count, error } = await supabase
    .from("staff_posts")
    .select("id, title, author_name, created_at, links, staff_post_files(count)", { count: "exact" })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, from + STAFF_BOARD_PAGE_SIZE - 1);
  const total = count ?? 0;
  const pages = boardPageCount(total);
  const items: StaffPostListItem[] = (data ?? []).map((p) => ({
    id: p.id,
    title: p.title,
    author_name: p.author_name,
    created_at: p.created_at,
    attach: staffPostAttachLabel(p.staff_post_files[0]?.count ?? 0, materialLinks(p.links)),
  }));

  return (
    <>
      {header}
      {error ? (
        <p className="card p-5 text-sm text-red-700">글 목록을 불러오지 못했어요. 잠시 뒤 새로고침해 주세요.</p>
      ) : items.length === 0 ? (
        <div className="card flex flex-col items-start gap-3 p-6">
          <p className="text-sm text-slate">{total > 0 ? "이 쪽에는 글이 없어요." : "아직 올린 글이 없어요. 첫 글을 올려 보세요."}</p>
          {total > 0 ? (
            <Link href="/admin/board" className="btn-secondary">
              첫 쪽으로
            </Link>
          ) : (
            <Link href="/admin/board/new" className="btn-primary">
              글쓰기
            </Link>
          )}
        </div>
      ) : (
        <>
          <p className="mb-2 text-sm text-slate">
            글 <strong className="tabular-nums text-ink">{total.toLocaleString("ko-KR")}</strong>개
          </p>
          <StaffPostList items={items} />
          <StaffBoardPager page={page} pages={pages} />
        </>
      )}
    </>
  );
}
