import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { StaffPostForm } from "@/components/admin/board/StaffPostForm";
import { requireCrew } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { materialLinks, sortMaterialFiles } from "@/lib/class-materials";
import { signNoteImages } from "@/lib/note-images";
import {
  canEditStaffPost,
  cellOf,
  normalizeLevels,
  normalizeSet,
  normalizeSubject,
  STAFF_BOARD_BUCKET,
  STAFF_BOARD_TESTING_NOTE,
  staffPostHref,
} from "@/lib/staff-board";

export const metadata: Metadata = { title: "글 고치기 · 직원 게시판", robots: { index: false } };

/**
 * 직원 게시판 글 고치기 (2026-10-21) — **글쓴이만**. 남의 글 주소를 쳐서 들어오면 글을 그리지 않고 돌려보낸다
 * (DB 정책 `staff_posts: 글쓴이 고치기` 도 막는다 — 화면은 먼저 알아듣게 말할 뿐이다).
 * 글 화면에서 보던 탭 · 칸(`?level=&cell=`)을 들고 와서, 취소 · 저장 뒤 글 화면도 그 탭 · 칸으로 돌아간다.
 */
export default async function EditStaffPostPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ level?: string; cell?: string }>;
}) {
  // 레이아웃이 조교를 통과시키므로 화면마다 막는다 — 이 화면은 조교에게 열려 있다
  const { user, profile } = await requireCrew();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const sp = await searchParams;
  const tabLevel = Number(sp.level);
  const from = { level: Number.isInteger(tabLevel) && tabLevel > 0 ? tabLevel : null, cell: cellOf(sp.cell) };
  const header = <PageHeader icon="offline" title="글 고치기" description="고친 내용은 저장하면 바로 직원 게시판에 보여요." />;
  if (profile.test_role) {
    return (
      <>
        {header}
        <p className="card p-5 text-sm text-slate">{STAFF_BOARD_TESTING_NOTE}</p>
      </>
    );
  }

  const supabase = await createClient();
  const { data: post } = await supabase
    .from("staff_posts")
    .select("id, title, body, links, levels, subject, book_set, author_id, staff_post_files(id, file_name, file_size, content_type, sort_order)")
    .eq("id", id)
    .maybeSingle();
  if (!post) notFound();
  if (!canEditStaffPost(post, user.id)) {
    return (
      <>
        {header}
        <div className="card flex flex-col items-start gap-3 p-5">
          <p className="text-sm text-slate">내가 쓴 글만 고칠 수 있어요.</p>
          <Link href={staffPostHref(post.id, from)} className="btn-secondary">
            글로 돌아가기
          </Link>
        </div>
      </>
    );
  }
  const [imageUrls, { data: levelRows }] = await Promise.all([
    signNoteImages(supabase, STAFF_BOARD_BUCKET, post.body),
    supabase.from("lc_levels").select("level").order("sort_order").order("level"),
  ]);
  return (
    <>
      {header}
      <StaffPostForm
        post={{
          id: post.id,
          title: post.title,
          body: post.body,
          levels: normalizeLevels(post.levels),
          subject: normalizeSubject(post.subject),
          set: normalizeSet(post.book_set),
          files: sortMaterialFiles(post.staff_post_files),
          links: materialLinks(post.links),
        }}
        levels={(levelRows ?? []).map((l) => l.level)}
        defaultLevels={[]}
        defaultCell={{ subject: null, set: null }}
        from={from}
        imageUrls={imageUrls}
        back={staffPostHref(post.id, from)}
      />
    </>
  );
}
