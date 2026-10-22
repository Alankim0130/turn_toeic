import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { FilterTabs } from "@/components/admin/FilterTabs";
import { StaffBoardPager, StaffPostList, type BoardTab, type StaffPostListItem } from "@/components/admin/board/StaffPostList";
import { BoardBulkMove } from "@/components/admin/board/BoardBulkMove";
import { isStaff, requireCrew } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { MATERIAL_SUBJECT_LABEL, materialLinks } from "@/lib/class-materials";
import {
  BOARD_CELLS,
  boardCell,
  boardLevel,
  boardListHref,
  boardPage,
  boardPageCount,
  cellLabel,
  cellTagLabel,
  cellValue,
  levelFilter,
  levelsLabel,
  normalizeLevels,
  setFilter,
  STAFF_BOARD_PAGE_SIZE,
  STAFF_BOARD_TESTING_NOTE,
  staffPostAttachLabel,
  subjectFilter,
  type BoardCell,
} from "@/lib/staff-board";

export const metadata: Metadata = { title: "직원 게시판", robots: { index: false } };
// 여러 개 옮기기(서버 액션)가 이 화면의 시간으로 돈다 — 파일 20개 · 50MB 복사가 기본 10초에 끊기지 않게 (글 화면 · 수업자료실과 같다)
export const maxDuration = 60;

/**
 * 직원 게시판 (2026-10-21 Alan — "관리자모드에서 직원들만 사용할 수 있는 게시판을 하나 만들어주면 좋겠어" → 물음에 "조교도 읽고 쓰기" · "글만 올리기").
 * 관리자 메뉴 `직원 → 직원 게시판`. 강사 · 관리자 · 조교가 읽고 쓴다 — 열째 조교 화면 (등급 체계 9-1). 학생에게는 메뉴도 데이터도 없다 (DB 정책).
 * **레벨 탭 650 · 750 · 850** (같은 날 Alan "직원게시판도 학습자료실처럼 650,750,850구분이 다 되어있으면 좋겠어") — 수업자료실처럼 레벨이 먼저다.
 * 레벨은 교재 레벨 목록(lc_levels)에서 읽고(코드에 적지 않는다), 탭 하나에는 그 레벨 글과 **모든 레벨 글**이 선다. 전체 탭은 없다 (수업자료실과 같다).
 * **둘째 줄 과목 × 과정 `RC A과정 · RC B과정 · LC A과정 · LC B과정`** (같은 날 Alan — 수업자료실의 그 줄을 보여 주며 "그리고 A, B과정 표시가 없어. 이렇게해줘") —
 * 수업자료실과 같은 줄 · 같은 주소(`?cell=rc-A`) · 같은 처음 칸(강사는 자기 과목, 관리자 · 조교는 RC A과정)이다. 칸 하나에는 그 칸 글과 과목 · 과정을 비운 글이 선다.
 * 숫자는 수업자료실과 같이 "다른 축은 지금 보고 있는 값 그대로" — 레벨 탭은 지금 칸에서, 칸은 지금 레벨에서 그 탭 · 칸에 서는 글 수.
 * 목록은 최근 글부터 한 쪽에 20개. 누르면 그 글 화면(`/admin/board/{id}?level=&cell=`).
 * **강사 · 관리자는 여러 개를 골라 한꺼번에 수업자료실로 옮긴다** (같은 날 Alan "여러개를 한번에 선택해서 넘길수 있도록 … 전체선택도") — 줄마다 고르기 칸 ·
 * 맨 위 전체 선택(이 쪽 글) · 아래 막대 (`BoardBulkMove`). 목록이 비어도 그 안에 둔다 — 다 옮긴 뒤에도 결과 창이 남게.
 */
export default async function StaffBoardPage({ searchParams }: { searchParams: Promise<{ page?: string; level?: string; cell?: string }> }) {
  // 레이아웃이 조교를 통과시키므로 화면마다 막는다 — 이 화면은 조교에게 열려 있다
  const { profile } = await requireCrew();
  const testing = profile.test_role != null;
  // 여러 개 옮기기는 강사 · 관리자만 (수업자료실이 강사 · 관리자 화면이다 — 서버 액션도 requireStaff)
  const staff = isStaff(profile.role);
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
  // 레벨 목록을 못 읽으면 레벨로는 거르지 않고 다 보여 준다 (레벨 탭도 그리지 않는다). 칸(과목 × 과정)은 늘 있다
  const level = boardLevel(sp.level, levels);
  const cell = boardCell(sp.cell, profile.subject);
  const tab: BoardTab = { level, cell: { subject: cell.subject, set: cell.set } };
  const from = (page - 1) * STAFF_BOARD_PAGE_SIZE;
  let list = supabase
    .from("staff_posts")
    .select("id, title, levels, subject, book_set, author_name, created_at, links, staff_post_files(count)", { count: "exact" })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, from + STAFF_BOARD_PAGE_SIZE - 1);
  // `.or()` 를 따로 걸면 모두 맞아야 한다 — 레벨 · 과목 · 과정마다 "그 값 글 + 비운 글"
  if (level !== null) list = list.or(levelFilter(level));
  list = list.or(subjectFilter(cell.subject)).or(setFilter(cell.set));
  /** 탭 · 칸 숫자 = 거기에 서는 글 수 (다른 축은 지금 보고 있는 값 그대로 — 수업자료실과 같은 규칙) */
  const countIn = async (l: number | null, c: BoardCell) => {
    let q = supabase.from("staff_posts").select("id", { count: "exact", head: true });
    if (l !== null) q = q.or(levelFilter(l));
    return (await q.or(subjectFilter(c.subject)).or(setFilter(c.set))).count ?? 0;
  };
  const [{ data, count: listCount, error }, levelCounts, cellCounts] = await Promise.all([
    list,
    Promise.all(levels.map(async (l) => [l, await countIn(l, cell)] as const)),
    Promise.all(BOARD_CELLS.map(async (c) => [cellValue(c), await countIn(level, c)] as const)),
  ]);
  const byLevel = new Map(levelCounts);
  const byCell = new Map(cellCounts);
  // 글 수보다 뒤 쪽을 열면(옮기거나 지워 쪽이 줄었다) PostgREST 가 416(PGRST103)으로 답하고 수를 주지 않는다 — 오류가 아니라 빈 쪽이다
  // (2026-10-22 오류 점검 — 예전에는 "글 목록을 불러오지 못했어요" 가 떠 첫 쪽으로 갈 길이 없었다). 수는 같은 거르기로 센 칸 숫자를 쓴다
  const outOfRange = error?.code === "PGRST103";
  const listError = outOfRange ? null : error;
  const total = listCount ?? (outOfRange ? (byCell.get(cellValue(cell)) ?? 0) : 0);
  const pages = boardPageCount(total);
  const items: StaffPostListItem[] = (data ?? []).map((p) => ({
    id: p.id,
    title: p.title,
    levels: levelsLabel(normalizeLevels(p.levels)),
    cell: cellTagLabel(p.subject, p.book_set),
    author_name: p.author_name,
    created_at: p.created_at,
    attach: staffPostAttachLabel(p.staff_post_files[0]?.count ?? 0, materialLinks(p.links)),
  }));
  const here = `${level !== null ? `${level} ` : ""}${cellLabel(cell)}`;
  const write = `/admin/board/new?${new URLSearchParams({ ...(level !== null ? { level: String(level) } : {}), cell: cellValue(cell) })}`;
  const first = boardListHref(tab);

  const body = listError ? (
    <p className="card p-5 text-sm text-red-700">글 목록을 불러오지 못했어요. 잠시 뒤 새로고침해 주세요.</p>
  ) : items.length === 0 ? (
    <div className="card flex flex-col items-start gap-3 p-6">
      <p className="text-sm text-slate">
        {total > 0 ? "이 쪽에는 글이 없어요." : `${here} 글이 아직 없어요. 첫 글을 올려 보세요.`}
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
        {here} · 글 <strong className="tabular-nums text-ink">{total.toLocaleString("ko-KR")}</strong>개
        <span className="text-mist"> — {level !== null ? "모든 레벨 · " : ""}모든 과목 · 과정 글도 함께 보여요</span>
      </p>
      <StaffPostList items={items} tab={tab} selectAll={staff ? (pages > 1 ? "이 쪽 전체 선택" : "전체 선택") : undefined} />
      <StaffBoardPager page={page} pages={pages} tab={tab} />
    </>
  );

  return (
    <>
      <PageHeader icon="offline" title="직원 게시판" description="강사 · 관리자 · 조교만 보는 게시판이에요. 학생에게는 보이지 않아요.">
        <Link href={write} className="btn-primary">
          글쓰기
        </Link>
      </PageHeader>
      {/* **레벨이 먼저, 그 안에서 과목 × 과정** (수업자료실과 같다). 첫째 줄은 채운 세그먼트, 둘째 줄은 테두리 (FilterTabs 무게 규칙) */}
      {level !== null && (
        <FilterTabs
          basePath="/admin/board"
          paramKey="level"
          current={String(level)}
          keep={{ cell: cellValue(cell) }}
          tabs={levels.map((l) => ({ value: String(l), label: `${l}`, count: byLevel.get(l) ?? 0 }))}
        />
      )}
      <FilterTabs
        basePath="/admin/board"
        paramKey="cell"
        current={cellValue(cell)}
        keep={{ level: level !== null ? String(level) : undefined }}
        variant="outline"
        tabs={BOARD_CELLS.map((c) => ({ value: cellValue(c), label: cellLabel(c), count: byCell.get(cellValue(c)) ?? 0 }))}
      />
      {/* 기본값으로 걸린 과목은 말해 준다 — 안 그러면 다른 과목 글이 사라진 것처럼 보인다 (수업자료실과 같은 말) */}
      {cell.defaulted && (
        <p className="-mt-1 mb-3 text-xs text-mist">내 과목({MATERIAL_SUBJECT_LABEL[cell.subject]}) 글부터 보여 주고 있어요. 위에서 레벨 · 과목 · 과정을 바꿀 수 있어요.</p>
      )}
      {staff && !listError && levels.length > 0 ? (
        <BoardBulkMove items={items.map((p) => ({ key: `post:${p.id}`, id: p.id, title: p.title }))} levels={levels} tab={tab}>
          {body}
        </BoardBulkMove>
      ) : (
        body
      )}
    </>
  );
}
