import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { NoticeForm } from "@/components/admin/class-notices/NoticeForm";
import { CLASS_NOTICE_BUCKET, scopeOf } from "@/lib/class-notices";
import { signNoteImages } from "@/lib/note-images";
import { formatDate } from "@/lib/utils";
import { backTo } from "../_back";

export const metadata: Metadata = { title: "공지 고치기 · 수업자료실", robots: { index: false } };

/** 수업자료실 공지 고치기 (2026-10-05) — 편집기가 곧 학생 공지 페이지 모양이라 따로 보기 화면을 두지 않는다 */
export default async function EditClassNoticePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ level?: string; cell?: string; term?: string }>;
}) {
  // 레이아웃이 조교를 통과시키므로 화면마다 막는다
  await requireStaff();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const supabase = await createClient();
  const [{ data: notice }, { data: levelRows }] = await Promise.all([
    supabase.from("class_notices").select("id, title, body, levels, subjects, author_name, created_at, updated_at").eq("id", Number(id)).maybeSingle(),
    supabase.from("lc_levels").select("level").order("sort_order").order("level"),
  ]);
  if (!notice) notFound();
  const imageUrls = await signNoteImages(supabase, CLASS_NOTICE_BUCKET, notice.body);
  const scope = scopeOf(notice);
  return (
    <>
      <PageHeader
        icon="download"
        title="공지 고치기"
        description={`${notice.author_name ?? "강사"} · ${formatDate(notice.created_at)} 올림${notice.updated_at.slice(0, 16) !== notice.created_at.slice(0, 16) ? ` · ${formatDate(notice.updated_at)} 고침` : ""}`}
      />
      <NoticeForm
        notice={{ id: notice.id, title: notice.title, body: notice.body, levels: scope.levels, subjects: scope.subjects }}
        levels={(levelRows ?? []).map((l) => l.level)}
        imageUrls={imageUrls}
        defaultLevels={[]}
        back={backTo(sp)}
      />
    </>
  );
}
