import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadGated } from "@/components/student/StudentGate";
import { NoteBody } from "@/components/note/NoteBody";
import { MaterialFileList } from "@/components/class-materials/MaterialFileList";
import { MaterialLinkList } from "@/components/class-materials/MaterialLinkList";
import { createClient } from "@/lib/supabase/server";
import { CLASS_NOTICE_BUCKET } from "@/lib/class-notices";
import { parseDoc, trimDoc } from "@/lib/note-format";
import { signNoteImages } from "@/lib/note-images";
import { formatDate } from "@/lib/utils";
import { getMyClassNotice } from "../../../_lib/queries";

export const metadata: Metadata = { title: "공지사항 · 수업자료실", robots: { index: false } };

/**
 * 수업자료실 공지 한 편 (2026-10-05 Alan — "제목을 누르면 펼침이 아니라, 해당 공지 페이지가 새로 열리면 좋겠어").
 * 내 범위 공지가 아니면 404 (주소의 숫자를 바꿔도 남의 범위 공지는 안 열린다 — DB 정책 + `getMyClassNotice`).
 * 사진 주소는 내 세션으로 만든다 — 저장소 정책이 "그 사진을 품은 공지를 볼 수 있는 사람" 만 연다.
 * 첨부 파일 · 링크(2026-10-13 — "공지사항에서도 파일올리기 등등")는 본문 아래 — 수업자료실 자료와 같은 목록이다
 * (파일은 `/files/notice/{파일 id}` — 그 공지가 보이는 사람에게만 열린다. 유튜브 영상은 그 자리에서 재생).
 */
export default async function ClassNoticePage({ params }: { params: Promise<{ id: string }> }) {
  // 잠금 판정과 공지 · 사진 주소를 함께 받는다 (loadGated)
  const g = await loadGated("materials", async () => {
    const notice = await getMyClassNotice(Number((await params).id));
    return { notice, images: notice ? await signNoteImages(await createClient(), CLASS_NOTICE_BUCKET, notice.body) : {} };
  });
  if (g.locked) return g.locked;
  const { notice, images } = g.data;
  if (!notice) notFound();
  const { runs, aligns } = trimDoc(parseDoc(notice.body));
  const edited = notice.updated_at.slice(0, 16) !== notice.created_at.slice(0, 16);

  return (
    <article className="space-y-4">
      <Link href="/my/materials" className="inline-flex items-center gap-1 text-sm font-bold text-brand-700 hover:text-brand-600">
        <svg viewBox="0 0 24 24" aria-hidden className="size-4 fill-none stroke-current stroke-[2.5]">
          <path d="m15 6-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        수업자료실
      </Link>
      <header className="border-b border-line pb-3">
        <span className="rounded-md border border-brand-300 px-2 py-0.5 text-xs font-bold text-brand-600">공지</span>
        <h1 className="mt-2 text-xl font-black leading-snug text-ink sm:text-2xl">{notice.title}</h1>
        <p className="mt-1.5 text-sm text-mist">
          {notice.author_name ?? "강사"} · {formatDate(notice.created_at)}
          {edited && <> · {formatDate(notice.updated_at)} 고침</>}
        </p>
      </header>
      {runs.length > 0 ? (
        <NoteBody runs={runs} aligns={aligns} images={images} className="card p-4 text-[15px] leading-relaxed text-ink-soft sm:p-6" />
      ) : (
        notice.files.length + notice.links.length === 0 && <p className="text-sm text-mist">본문이 없는 공지예요.</p>
      )}
      {notice.files.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-black text-ink">첨부 파일 {notice.files.length}개</h2>
          <MaterialFileList files={notice.files} base="/files/notice" />
        </section>
      )}
      {notice.links.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-black text-ink">링크</h2>
          <MaterialLinkList links={notice.links} />
        </section>
      )}
    </article>
  );
}
