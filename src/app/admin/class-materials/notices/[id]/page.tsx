import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { NoticeForm } from "@/components/admin/class-notices/NoticeForm";
import { NoticePublishToggle } from "@/components/admin/class-notices/NoticePublishToggle";
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
    supabase.from("class_notices").select("id, title, body, levels, subjects, author_name, created_at, updated_at, published").eq("id", Number(id)).maybeSingle(),
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
      {/* 내리기 · 다시 올리기 (2026-10-06 Alan) — 지우지 않고 학생 화면에서만 뺀다. 상태 배지 + 토글 */}
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl2 border border-line bg-white px-4 py-3">
        <span className={notice.published ? "rounded-md border border-brand-300 px-2 py-0.5 text-xs font-bold text-brand-600" : "rounded-md border border-line bg-surface px-2 py-0.5 text-xs font-bold text-slate"}>
          {notice.published ? "공지" : "내림"}
        </span>
        <span className="min-w-0 flex-1 text-sm text-slate">
          {notice.published ? "학생 수업자료실 맨 위에 보이는 중이에요. 내리면 글·사진은 그대로 두고 학생에게만 안 보여요." : "내려 둔 공지예요 — 학생에게 보이지 않아요. 다시 올리면 그대로 보여요."}
        </span>
        <NoticePublishToggle id={notice.id} published={notice.published} title={notice.title} />
      </div>
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
