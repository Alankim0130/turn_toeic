import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { StaffPostForm } from "@/components/admin/board/StaffPostForm";
import { requireCrew } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { boardLevel, STAFF_BOARD_TESTING_NOTE } from "@/lib/staff-board";

export const metadata: Metadata = { title: "글쓰기 · 직원 게시판", robots: { index: false } };

/**
 * 직원 게시판 글쓰기 (2026-10-21) — 강사 · 관리자 · 조교. 편집기는 수업자료실 공지와 같다 (굵게 · 색 · 표 · 사진 · 워드 붙여 넣기).
 * 레벨은 보던 탭(`?level=`)으로 미리 골라 둔다 — 비우면 모든 레벨 글
 */
export default async function NewStaffPostPage({ searchParams }: { searchParams: Promise<{ level?: string }> }) {
  // 레이아웃이 조교를 통과시키므로 화면마다 막는다 — 이 화면은 조교에게 열려 있다
  const { profile } = await requireCrew();
  const header = <PageHeader icon="offline" title="글쓰기" description="직원 게시판에 올라가요. 강사 · 관리자 · 조교만 보고, 학생에게는 보이지 않아요." />;
  if (profile.test_role) {
    return (
      <>
        {header}
        <p className="card p-5 text-sm text-slate">{STAFF_BOARD_TESTING_NOTE}</p>
      </>
    );
  }
  const sp = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.from("lc_levels").select("level").order("sort_order").order("level");
  const levels = (data ?? []).map((l) => l.level);
  const level = sp.level ? boardLevel(sp.level, levels) : null;
  return (
    <>
      {header}
      <StaffPostForm levels={levels} defaultLevels={level ? [level] : []} imageUrls={{}} back={level ? `/admin/board?level=${level}` : "/admin/board"} />
    </>
  );
}
