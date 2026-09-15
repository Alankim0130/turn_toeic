import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { cn, todayKST } from "@/lib/utils";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterTabs } from "@/components/admin/FilterTabs";
import { AudioUploader } from "@/components/admin/lc-audio/AudioUploader";
import { AudioTrackRow, type BookOption } from "@/components/admin/lc-audio/AudioTrackRow";
import { BookEditorCard } from "@/components/admin/lc-audio/BookEditorCard";
import { BookCover } from "@/components/lc/BookCover";
import { BOOK_SET_LABEL, BOOK_SET_MONTHS, BOOK_SETS, bookLabel, bookSetForMonth, coverSrc, pickBook, pickLevel, sortBooks, sortTracks } from "@/lib/lc-audio";

export const metadata: Metadata = { title: "LC 음원", robots: { index: false } };

export default async function LcAudioAdminPage({ searchParams }: { searchParams: Promise<{ level?: string; book?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const month = Number(todayKST().slice(5, 7));
  const currentSet = bookSetForMonth(month);

  const [{ data: levelRows }, { data: bookRows }, { data: trackRows }] = await Promise.all([
    supabase.from("lc_levels").select("level").order("sort_order").order("level"),
    supabase.from("lc_books").select("id, level, book_set, volume, title, description, cover_name, updated_at"),
    supabase.from("lc_audio_tracks").select("id, title, book_id, file_name, file_size"),
  ]);
  const levels = (levelRows ?? []).map((l) => l.level);
  const books = sortBooks(bookRows ?? []);
  const tracks = trackRows ?? [];
  const level = pickLevel(sp.level, levels);

  const header = (
    <PageHeader
      icon="headphones"
      title="LC 음원"
      description="레벨마다 A반(홀수달)·B반(짝수달) 교재 2권씩, 표지·교재명·설명과 음원을 올립니다. 수강생은 LC 음원듣기에서 교재를 골라 들어요."
    />
  );

  if (level === null) {
    return (
      <>
        {header}
        <EmptyState icon="headphones" title="등록된 레벨이 없어요" description="lc_levels 테이블에 레벨을 추가하면 교재 칸 4개가 자동으로 생깁니다." />
      </>
    );
  }

  const levelBooks = books.filter((b) => b.level === level);
  const selected = pickBook(sp.book, levelBooks, currentSet);
  const countByBook = new Map<number, number>();
  for (const t of tracks) if (t.book_id) countByBook.set(t.book_id, (countByBook.get(t.book_id) ?? 0) + 1);
  const levelTrackCount = (l: number) => books.filter((b) => b.level === l).reduce((sum, b) => sum + (countByBook.get(b.id) ?? 0), 0);
  const selectedTracks = selected ? sortTracks(tracks.filter((t) => t.book_id === selected.id)) : [];
  const bookOptions: BookOption[] = books.map((b) => ({ id: b.id, level: b.level, label: `${bookLabel(b)}${b.title ? ` · ${b.title}` : ""}` }));

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
        이번 달({month}월)은 <strong className="text-brand-600">{BOOK_SET_LABEL[currentSet]} 교재</strong>로 수업해요. 수강생 화면에도 “이번 달 교재”로 표시됩니다.
      </p>

      <div className="space-y-6">
        {BOOK_SETS.map((set) => {
          const setBooks = levelBooks.filter((b) => b.book_set === set);
          const current = set === currentSet;
          return (
            <section
              key={set}
              aria-labelledby={`set-${set}`}
              className={cn("rounded-xl3 border p-4 sm:p-6", current ? "border-brand-200 bg-gradient-to-br from-brand-50 via-paper to-paper" : "border-line bg-paper")}
            >
              <div className="grid gap-4 xl:grid-cols-[10rem_1fr] xl:gap-6">
                <header>
                  <p className="text-[11px] font-black tracking-[0.25em] text-brand-600">SET {set}</p>
                  <h2 id={`set-${set}`} className="mt-1 text-xl font-black tracking-tight text-ink">
                    {level} {BOOK_SET_LABEL[set]} 교재
                  </h2>
                  <p className="mt-1 text-xs text-slate">{BOOK_SET_MONTHS[set]}</p>
                  {current && <span className="mt-3 inline-flex rounded-full bg-brand-500 px-3 py-1 text-xs font-black text-white shadow-pink">이번 달 교재</span>}
                </header>
                {setBooks.length === 0 ? (
                  <p className="text-sm text-slate">교재 칸이 없어요.</p>
                ) : (
                  <ul className="grid gap-4 sm:grid-cols-2">
                    {setBooks.map((b) => (
                      <BookEditorCard
                        key={b.id}
                        book={b}
                        trackCount={countByBook.get(b.id) ?? 0}
                        selected={b.id === selected?.id}
                        manageHref={`/admin/lc-audio?level=${level}&book=${b.id}#tracks`}
                      />
                    ))}
                  </ul>
                )}
              </div>
            </section>
          );
        })}
      </div>

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
                {selected.title || bookLabel(selected)} 음원 <span className="text-slate">({selectedTracks.length})</span>
              </h2>
            </div>
          </div>

          <AudioUploader key={selected.id} bookId={selected.id} label={`${level} ${bookLabel(selected)}`} />

          <div className="mt-6">
            {selectedTracks.length === 0 ? (
              <p className="rounded-xl bg-surface px-4 py-8 text-center text-sm text-slate">이 교재에 올린 음원이 아직 없어요.</p>
            ) : (
              <ul className="space-y-3">
                {selectedTracks.map((t) => (
                  <AudioTrackRow key={t.id} track={t} bookOptions={bookOptions} />
                ))}
              </ul>
            )}
          </div>
        </section>
      )}
    </>
  );
}
