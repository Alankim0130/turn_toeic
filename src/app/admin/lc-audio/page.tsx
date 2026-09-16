import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { cn, todayKST } from "@/lib/utils";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterTabs } from "@/components/admin/FilterTabs";
import { AudioDays } from "@/components/admin/lc-audio/AudioDays";
import { BookEditorCard } from "@/components/admin/lc-audio/BookEditorCard";
import { BookCover } from "@/components/lc/BookCover";
import { BOOK_SET_LABEL, BOOK_SET_MONTHS, BOOK_SETS, DAY_COUNT, bookLabel, bookSetForMonth, coverSrc, pickBook, pickLevel, sortBooks, sortTracks } from "@/lib/lc-audio";

export const metadata: Metadata = { title: "LC 음원", robots: { index: false } };

export default async function LcAudioAdminPage({ searchParams }: { searchParams: Promise<{ level?: string; book?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const month = Number(todayKST().slice(5, 7));
  const currentSet = bookSetForMonth(month);

  const [{ data: levelRows }, { data: bookRows }, { data: trackRows }] = await Promise.all([
    supabase.from("lc_levels").select("level").order("sort_order").order("level"),
    supabase.from("lc_books").select("id, level, book_set, title, description, cover_name, lesson_offset, updated_at"),
    supabase.from("lc_audio_tracks").select("id, day, kind, label, sort_order, book_id, file_name, file_size"),
  ]);
  const levels = (levelRows ?? []).map((l) => l.level);
  const books = sortBooks(bookRows ?? []);
  const tracks = trackRows ?? [];
  const level = pickLevel(sp.level, levels);

  const header = (
    <PageHeader
      icon="headphones"
      title="LC 음원"
      description={`레벨마다 A반(홀수달)·B반(짝수달) 교재 한 권씩이고, 교재마다 수업 음원과 숙제 음원을 강(${DAY_COUNT}칸)별로 올립니다. 한 강에 파일이 여러 개여도 됩니다.`}
    />
  );

  if (level === null) {
    return (
      <>
        {header}
        <EmptyState icon="headphones" title="등록된 레벨이 없어요" description="lc_levels 테이블에 레벨을 추가하면 A반·B반 교재 칸이 자동으로 생깁니다." />
      </>
    );
  }

  const levelBooks = books.filter((b) => b.level === level);
  const selected = pickBook(sp.book, levelBooks, currentSet);
  const countByBook = new Map<number, number>();
  for (const t of tracks) if (t.book_id) countByBook.set(t.book_id, (countByBook.get(t.book_id) ?? 0) + 1);
  const levelTrackCount = (l: number) => books.filter((b) => b.level === l).reduce((sum, b) => sum + (countByBook.get(b.id) ?? 0), 0);
  const selectedTracks = selected ? sortTracks(tracks.filter((t) => t.book_id === selected.id)) : [];

  return (
    <>
      {header}
      <FilterTabs
        basePath="/admin/lc-audio"
        paramKey="level"
        current={String(level)}
        tabs={levels.map((l) => ({ value: String(l), label: String(l), count: levelTrackCount(l) }))}
      />

      <p className="mb-5 text-sm text-slate">
        이번 달({month}월) 기본값은 <strong className="text-brand-600">{BOOK_SET_LABEL[currentSet]} 교재</strong>예요. 다만 <strong className="text-ink">교재는 시간대마다 다릅니다</strong> — 학생에게는 반 편성에서 지정한 그 반의 교재가 보입니다.
      </p>

      <ul className="grid gap-4 sm:grid-cols-2">
        {BOOK_SETS.map((set) => {
          const book = levelBooks.find((b) => b.book_set === set);
          const current = set === currentSet;
          return (
            <li key={set}>
              <section
                aria-labelledby={`set-${set}`}
                className={cn("h-full rounded-xl3 border p-4 sm:p-5", current ? "border-brand-200 bg-gradient-to-br from-brand-50 via-paper to-paper" : "border-line bg-paper")}
              >
                <header className="mb-3">
                  <p className="text-[11px] font-black tracking-[0.25em] text-brand-600">SET {set}</p>
                  <h2 id={`set-${set}`} className="mt-1 text-xl font-black tracking-tight text-ink">
                    {level} {BOOK_SET_LABEL[set]} 교재
                  </h2>
                  <p className="mt-1 text-xs text-slate">{BOOK_SET_MONTHS[set]}</p>
                  {current && <span className="mt-3 inline-flex rounded-full bg-brand-500 px-3 py-1 text-xs font-black text-white shadow-pink">이번 달 교재</span>}
                </header>
                {book ? (
                  <ul>
                    <BookEditorCard
                      book={book}
                      trackCount={countByBook.get(book.id) ?? 0}
                      selected={book.id === selected?.id}
                      manageHref={`/admin/lc-audio?level=${level}&book=${book.id}#tracks`}
                    />
                  </ul>
                ) : (
                  <p className="text-sm text-slate">교재 칸이 없어요.</p>
                )}
              </section>
            </li>
          );
        })}
      </ul>

      {selected && (
        <section id="tracks" aria-labelledby="tracks-title" className="card mt-8 scroll-mt-24 p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-4">
            <div className="w-12 shrink-0">
              <BookCover size="sm" src={selected.cover_name ? coverSrc(selected, 160) : null} alt="" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-black tracking-[0.18em] text-brand-600">
                {level} · {bookLabel(selected)}
              </p>
              <h2 id="tracks-title" className="truncate text-lg font-black text-ink">
                {selected.title || bookLabel(selected)} 음원{" "}
                <span className="tabular-nums text-slate">({selectedTracks.length}개)</span>
              </h2>
            </div>
          </div>

          <AudioDays
            key={selected.id}
            bookId={selected.id}
            label={`${level} ${bookLabel(selected)}`}
            lessonOffset={selected.lesson_offset ?? 0}
            tracks={selectedTracks}
          />
        </section>
      )}
    </>
  );
}
