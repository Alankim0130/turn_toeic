import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { cn, todayKST, TRACK_LABEL } from "@/lib/utils";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterTabs } from "@/components/admin/FilterTabs";
import { AudioDays } from "@/components/admin/lc-audio/AudioDays";
import { BookEditorCard } from "@/components/admin/lc-audio/BookEditorCard";
import { BookCover } from "@/components/lc/BookCover";
import { BOOK_SET_LABEL, BOOK_SETS, DAY_COUNT, bookLabel, bookSectionsByLevel, bookTimesLabel, coverSrc, pickBook, pickLevel, sortBooks, sortTracks } from "@/lib/lc-audio";
import { getCurrentOrUpcomingTerm, termLabel } from "../_lib/queries";
import { requireStaff } from "@/lib/auth";

export const metadata: Metadata = { title: "LC 음원", robots: { index: false } };

export default async function LcAudioAdminPage({ searchParams }: { searchParams: Promise<{ level?: string; book?: string }> }) {
  // 조교는 이 화면을 쓸 수 없다 — 레이아웃이 조교를 통과시키므로 화면마다 막는다
  await requireStaff();
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: levelRows }, { data: bookRows }, { data: trackRows }] = await Promise.all([
    supabase.from("lc_levels").select("level").order("sort_order").order("level"),
    supabase.from("lc_books").select("id, level, book_set, title, description, cover_name, lesson_offset, updated_at"),
    supabase.from("lc_audio_tracks").select("id, day, kind, label, sort_order, book_id, file_name, file_size"),
  ]);
  // **이 교재를 실제로 쓰는 반**을 보여 주려고 이번(또는 곧 올) 기수의 편성을 함께 읽는다 —
  // 달 홀짝으로 "이번 달 교재" 를 찍던 자리다 (2026-09-19 Alan: 그 구분은 틀렸다)
  const term = await getCurrentOrUpcomingTerm(supabase, todayKST());
  const { data: termSections } = term
    ? await supabase
        .from("class_sections")
        .select("track, time_block, book_set, course:courses(target_score, program)")
        .eq("term_id", term.id)
        .not("book_set", "is", null)
    : { data: null };
  const usedBy = bookSectionsByLevel(termSections ?? []);

  const levels = (levelRows ?? []).map((l) => l.level);
  const books = sortBooks(bookRows ?? []);
  const tracks = trackRows ?? [];
  const level = pickLevel(sp.level, levels);

  const header = (
    <PageHeader
      icon="headphones"
      title="LC 음원"
      description={`레벨마다 A반·B반 교재 한 권씩이고, 교재마다 수업 음원과 숙제 음원을 강(${DAY_COUNT}칸)별로 올립니다. 한 강에 파일이 여러 개여도 됩니다.`}
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
  const selected = pickBook(sp.book, levelBooks);
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

      {/* 홀수달 A · 짝수달 B 라고 적지 말 것 — 틀린 말이다 (2026-09-19 Alan). 진실은 반 편성의 book_set 하나뿐이다 */}
      <p className="mb-5 text-sm text-slate">
        <strong className="text-ink">A반·B반은 달이 아니라 시간대·트랙이 정합니다</strong> — 같은 9월에도 650 은 화목금 10:00 이 A, 월수금 11:10 이 B 예요.
        학생에게는 <strong className="text-brand-600">반 편성에서 지정한 그 반의 교재</strong>만 보입니다.
      </p>

      <ul className="grid gap-4 sm:grid-cols-2">
        {BOOK_SETS.map((set) => {
          const book = levelBooks.find((b) => b.book_set === set);
          // 이 교재를 쓰는 이번 기수의 반들 — 달이 아니라 이것이 A/B 의 진짜 뜻이다
          const when = bookTimesLabel(usedBy.get(level)?.get(set) ?? [], TRACK_LABEL);
          return (
            <li key={set}>
              <section
                aria-labelledby={`set-${set}`}
                className={cn("h-full rounded-xl3 border p-4 sm:p-5", book && book.id === selected?.id ? "border-brand-200 bg-gradient-to-br from-brand-50 via-paper to-paper" : "border-line bg-paper")}
              >
                <header className="mb-3">
                  <p className="text-[11px] font-black tracking-[0.25em] text-brand-600">SET {set}</p>
                  <h2 id={`set-${set}`} className="mt-1 text-xl font-black tracking-tight text-ink">
                    {level} {BOOK_SET_LABEL[set]} 교재
                  </h2>
                  <p className="mt-1 text-xs text-slate">
                    {when ? (
                      <>
                        <span className="font-bold text-brand-700">{termLabel(term, true)} {when}</span> 수업에서 써요
                      </>
                    ) : (
                      "이번 기수에 이 교재를 쓰는 반이 아직 없어요 — 반 편성에서 LC 교재를 골라 주세요"
                    )}
                  </p>
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
