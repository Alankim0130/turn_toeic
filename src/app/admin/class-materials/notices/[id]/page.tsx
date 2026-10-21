import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { NoticeForm } from "@/components/admin/class-notices/NoticeForm";
import { NoticePublishToggle } from "@/components/admin/class-notices/NoticePublishToggle";
import { MoveToBoardButton } from "@/components/admin/board/MoveToBoardButton";
import { CLASS_NOTICE_BUCKET, scopeOf } from "@/lib/class-notices";
import { materialLinks, sortMaterialFiles } from "@/lib/class-materials";
import { signNoteImages } from "@/lib/note-images";
import { levelsLabel } from "@/lib/staff-board";
import { formatDate } from "@/lib/utils";
import { backTo } from "../_back";

export const metadata: Metadata = { title: "공지 고치기 · 수업자료실", robots: { index: false } };

/** 직원 게시판으로 옮기기(서버 액션)가 사진 · 파일을 복사하는 동안 — 넉넉히 (직원 게시판 글 화면과 같은 값) */
export const maxDuration = 60;

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
    supabase
      .from("class_notices")
      .select("id, title, body, levels, subjects, links, author_name, created_at, updated_at, published, class_notice_files(id, file_name, file_size, content_type, sort_order)")
      .eq("id", Number(id))
      .maybeSingle(),
    supabase.from("lc_levels").select("level").order("sort_order").order("level"),
  ]);
  if (!notice) notFound();
  const imageUrls = await signNoteImages(supabase, CLASS_NOTICE_BUCKET, notice.body);
  const scope = scopeOf(notice);
  const levels = (levelRows ?? []).map((l) => l.level);
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
        {/* 글이 12rem 보다 좁아지면 단추 둘이 다음 줄 오른쪽으로 내려간다 — 휴대폰에서 글이 한 글자씩 쪼개지지 않게 */}
        <span className="min-w-[12rem] flex-1 text-sm text-slate">
          {notice.published ? "학생 수업자료실 맨 위에 보이는 중이에요. 내리면 글·사진·파일은 그대로 두고 학생에게만 안 보여요." : "내려 둔 공지예요 — 학생에게 보이지 않아요. 다시 올리면 그대로 보여요."}
        </span>
        <span className="ml-auto flex flex-wrap items-start justify-end gap-2">
          {/* 직원 게시판으로 옮기기 (2026-10-21 Alan) — 학생 화면에서 바로 빠지고 직원 게시판의 그 레벨 글이 된다 */}
          <MoveToBoardButton kind="notice" id={notice.id} title={notice.title} levels={levelsLabel(scope.levels.filter((l) => levels.includes(l)))} variant="bar" />
          <NoticePublishToggle id={notice.id} published={notice.published} title={notice.title} />
        </span>
      </div>
      <NoticeForm
        notice={{
          id: notice.id,
          title: notice.title,
          body: notice.body,
          levels: scope.levels,
          subjects: scope.subjects,
          // 첨부 파일 · 링크 (2026-10-13 — "공지사항에서도 파일올리기 등등")
          files: sortMaterialFiles(notice.class_notice_files),
          links: materialLinks(notice.links),
        }}
        levels={levels}
        imageUrls={imageUrls}
        defaultLevels={[]}
        back={backTo(sp)}
      />
    </>
  );
}
