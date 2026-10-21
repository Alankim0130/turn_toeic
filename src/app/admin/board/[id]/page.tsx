import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { NoteBody } from "@/components/note/NoteBody";
import { MaterialFileList } from "@/components/class-materials/MaterialFileList";
import { MaterialLinkList } from "@/components/class-materials/MaterialLinkList";
import { StaffPostDeleteButton } from "@/components/admin/board/StaffPostDeleteButton";
import { isStaff, requireCrew } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { materialLinks, sortMaterialFiles } from "@/lib/class-materials";
import { parseDoc, trimDoc } from "@/lib/note-format";
import { signNoteImages } from "@/lib/note-images";
import { canDeleteStaffPost, canEditStaffPost, isEditedPost, STAFF_BOARD_BUCKET, STAFF_BOARD_TESTING_NOTE } from "@/lib/staff-board";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "직원 게시판", robots: { index: false } };

const when = (iso: string) => formatDate(iso, { year: "numeric", month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" });

/**
 * 직원 게시판 글 한 편 (2026-10-21) — 강사 · 관리자 · 조교. 다른 사람이 주소의 숫자를 바꿔도 DB 정책이 막는다 (학생에게는 404).
 * 사진 주소는 보는 사람의 세션으로 만든다 (저장소 정책 `staff-board: 직원 조회`). 첨부 파일은 `/files/board/{파일 id}`.
 * `고치기` 는 글쓴이에게만, `글 지우기` 는 글쓴이와 강사 · 관리자에게만 보인다 — DB 정책과 같은 규칙(`canEditStaffPost` · `canDeleteStaffPost`).
 */
export default async function StaffPostPage({ params }: { params: Promise<{ id: string }> }) {
  // 레이아웃이 조교를 통과시키므로 화면마다 막는다 — 이 화면은 조교에게 열려 있다
  const { user, profile } = await requireCrew();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  if (profile.test_role) {
    return <p className="card p-5 text-sm text-slate">{STAFF_BOARD_TESTING_NOTE}</p>;
  }

  const supabase = await createClient();
  const { data: post } = await supabase
    .from("staff_posts")
    .select("id, title, body, links, author_id, author_name, created_at, updated_at, staff_post_files(id, file_name, file_size, content_type, sort_order)")
    .eq("id", id)
    .maybeSingle();
  if (!post) notFound();
  const images = await signNoteImages(supabase, STAFF_BOARD_BUCKET, post.body);
  const { runs, aligns } = trimDoc(parseDoc(post.body));
  const files = sortMaterialFiles(post.staff_post_files);
  const links = materialLinks(post.links);
  const mine = canEditStaffPost(post, user.id);
  const canDelete = canDeleteStaffPost(post, user.id, isStaff(profile.role));

  return (
    <article className="space-y-4">
      <Link href="/admin/board" className="inline-flex items-center gap-1 text-sm font-bold text-brand-700 hover:text-brand-600">
        <svg viewBox="0 0 24 24" aria-hidden className="size-4 fill-none stroke-current stroke-[2.5]">
          <path d="m15 6-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        직원 게시판
      </Link>
      <header className="border-b border-line pb-3">
        <h1 className="text-xl font-black leading-snug text-ink [overflow-wrap:anywhere] sm:text-2xl">{post.title}</h1>
        <p className="mt-1.5 text-sm text-mist">
          <span className="font-bold text-ink-soft">{post.author_name || "직원"}</span> · {when(post.created_at)}
          {isEditedPost(post) && <> · {when(post.updated_at)} 고침</>}
        </p>
      </header>
      {runs.length > 0 ? (
        <NoteBody runs={runs} aligns={aligns} images={images} className="card p-4 text-[15px] leading-relaxed text-ink-soft sm:p-6" />
      ) : (
        files.length + links.length === 0 && <p className="text-sm text-mist">본문이 없는 글이에요.</p>
      )}
      {files.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-black text-ink">첨부 파일 {files.length}개</h2>
          <MaterialFileList files={files} base="/files/board" />
        </section>
      )}
      {links.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-black text-ink">링크</h2>
          <MaterialLinkList links={links} />
        </section>
      )}
      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <Link href="/admin/board" className="btn-secondary">
          목록으로
        </Link>
        {mine && (
          <Link href={`/admin/board/${post.id}/edit`} className="btn-primary">
            고치기
          </Link>
        )}
        {canDelete && (
          <span className="ml-auto flex flex-wrap items-center justify-end gap-2">
            <StaffPostDeleteButton id={post.id} others={!mine} />
          </span>
        )}
      </div>
    </article>
  );
}
