import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { FilterTabs } from "@/components/admin/FilterTabs";
import { StaffBoardPager, StaffPostList, type StaffPostListItem } from "@/components/admin/board/StaffPostList";
import { requireCrew } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { materialLinks } from "@/lib/class-materials";
import {
  boardLevel,
  boardPage,
  boardPageCount,
  levelFilter,
  levelsLabel,
  normalizeLevels,
  STAFF_BOARD_PAGE_SIZE,
  STAFF_BOARD_TESTING_NOTE,
  staffPostAttachLabel,
} from "@/lib/staff-board";

export const metadata: Metadata = { title: "직원 게시판", robots: { index: false } };

/**
 * 직원 게시판 (2026-10-21 Alan — "관리자모드에서 직원들만 사용할 수 있는 게시판을 하나 만들어주면 좋겠어" → 물음에 "조교도 읽고 쓰기" · "글만 올리기").
 * 관리자 메뉴 `직원 → 직원 게시판`. 강사 · 관리자 · 조교가 읽고 쓴다 — 열째 조교 화면 (등급 체계 9-1). 학생에게는 메뉴도 데이터도 없다 (DB 정책).
 * **레벨 탭 650 · 750 · 850** (같은 날 Alan "직원게시판도 학습자료실처럼 650,750,850구분이 다 되어있으면 좋겠어") — 수업자료실처럼 레벨이 먼저다.
 * 레벨은 교재 레벨 목록(lc_levels)에서 읽고(코드에 적지 않는다), 탭 하나에는 그 레벨 글과 **모든 레벨 글**이 선다. 전체 탭은 없다 (수업자료실과 같다).
 * 목록은 최근 글부터 한 쪽에 20개. 누르면 그 글 화면(`/admin/board/{id}?level=`).
 */
export default async function StaffBoardPage({ searchParams }: { searchParams: Promise<{ page?: string; level?: string }> }) {
  // 레이아웃이 조교를 통과시키므로 화면마다 막는다 — 이 화면은 조교에게 열려 있다
  const { profile } = await requireCrew();
  const testing = profile.test_role != null;
  const sp = await searchParams;
  const page = boardPage(sp.page);

  // 테스트 등급을 켜면 DB 가 학생으로 보아 글이 0건으로 읽힌다 — 읽지 않고 안내한다 (인수인계 체크와 같은 규칙)
  if (testing) {
    return (
      <>
        <PageHeader icon="offline" title="직원 게시판" description="강사 · 관리자 · 조교만 보는 게시판이에요. 학생에게는 보이지 않아요." />
        <p className="card p-5 text-sm text-slate">{STAFF_BOARD_TESTING_NOTE}</p>
      </>
    );
  }

  const supabase = await createClient();
  const { data: levelRows } = await supabase.from("lc_levels").select("level").order("sort_order").order("level");
  const levels = (levelRows ?? []).map((l) => l.level);
  // 레벨 목록을 못 읽으면 거르지 않고 다 보여 준다 (탭도 그리지 않는다)
  const level = boardLevel(sp.level, levels);
  const from = (page - 1) * STAFF_BOARD_PAGE_SIZE;
  let list = supabase
    .from("staff_posts")
    .select("id, title, levels, author_name, created_at, links, staff_post_files(count)", { count: "exact" })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, from + STAFF_BOARD_PAGE_SIZE - 1);
  if (level !== null) list = list.or(levelFilter(level));
  const [{ data, count, error }, levelCounts] = await Promise.all([
    list,
    // 탭 숫자 = 그 탭에 서는 글 수 (그 레벨 글 + 모든 레벨 글)
    Promise.all(
      levels.map(async (l) => [l, (await supabase.from("staff_posts").select("id", { count: "exact", head: true }).or(levelFilter(l))).count ?? 0] as const),
    ),
  ]);
  const byLevel = new Map(levelCounts);
  const total = count ?? 0;
  const pages = boardPageCount(total);
  const items: StaffPostListItem[] = (data ?? []).map((p) => ({
    id: p.id,
    title: p.title,
    levels: levelsLabel(normalizeLevels(p.levels)),
    author_name: p.author_name,
    created_at: p.created_at,
    attach: staffPostAttachLabel(p.staff_post_files[0]?.count ?? 0, materialLinks(p.links)),
  }));
  const write = level !== null ? `/admin/board/new?level=${level}` : "/admin/board/new";
  const first = level !== null ? `/admin/board?level=${level}` : "/admin/board";

  return (
    <>
      <PageHeader icon="offline" title="직원 게시판" description="강사 · 관리자 · 조교만 보는 게시판이에요. 학생에게는 보이지 않아요.">
        <Link href={write} className="btn-primary">
          글쓰기
        </Link>
      </PageHeader>
      {level !== null && (
        <FilterTabs
          basePath="/admin/board"
          paramKey="level"
          current={String(level)}
          tabs={levels.map((l) => ({ value: String(l), label: `${l}`, count: byLevel.get(l) ?? 0 }))}
        />
      )}
      {error ? (
        <p className="card p-5 text-sm text-red-700">글 목록을 불러오지 못했어요. 잠시 뒤 새로고침해 주세요.</p>
      ) : items.length === 0 ? (
        <div className="card flex flex-col items-start gap-3 p-6">
          <p className="text-sm text-slate">
            {total > 0 ? "이 쪽에는 글이 없어요." : level !== null ? `${level} 글이 아직 없어요. 첫 글을 올려 보세요.` : "아직 올린 글이 없어요. 첫 글을 올려 보세요."}
          </p>
          {total > 0 ? (
            <Link href={first} className="btn-secondary">
              첫 쪽으로
            </Link>
          ) : (
            <Link href={write} className="btn-primary">
              글쓰기
            </Link>
          )}
        </div>
      ) : (
        <>
          <p className="mb-2 text-sm text-slate">
            {level !== null && <>{level} · </>}글 <strong className="tabular-nums text-ink">{total.toLocaleString("ko-KR")}</strong>개
            {level !== null && <span className="text-mist"> — 모든 레벨 글도 함께 보여요</span>}
          </p>
          <StaffPostList items={items} level={level} />
          <StaffBoardPager page={page} pages={pages} level={level} />
        </>
      )}
    </>
  );
}
