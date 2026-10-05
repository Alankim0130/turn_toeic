import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { NoticeForm } from "@/components/admin/class-notices/NoticeForm";
import { backTo } from "../_back";

export const metadata: Metadata = { title: "공지 올리기 · 수업자료실", robots: { index: false } };

/** 수업자료실 공지 새로 쓰기 (2026-10-05) — 강사·관리자만. 범위는 보던 레벨로 미리 골라 둔다 */
export default async function NewClassNoticePage({ searchParams }: { searchParams: Promise<{ level?: string; cell?: string; term?: string }> }) {
  // 레이아웃이 조교를 통과시키므로 화면마다 막는다
  await requireStaff();
  const sp = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.from("lc_levels").select("level").order("sort_order").order("level");
  const levels = (data ?? []).map((l) => l.level);
  const level = Number(sp.level);
  return (
    <>
      <PageHeader icon="download" title="공지 올리기" description="수업자료실 맨 위 공지사항에 올라가요. 범위를 고르면 그 학생들에게만 보여요." />
      <NoticeForm levels={levels} imageUrls={{}} defaultLevels={levels.includes(level) ? [level] : []} back={backTo(sp)} />
    </>
  );
}
