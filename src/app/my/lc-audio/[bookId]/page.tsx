import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { studentGate } from "@/components/student/StudentGate";
import { PageHeader } from "@/components/ui/PageHeader";
import { Icon } from "@/components/ui/Icon";
import { BookCover } from "@/components/lc/BookCover";
import { LessonCalendar, type LessonSlot, type LessonTrack } from "@/components/lc/LessonCalendar";
import { createClient } from "@/lib/supabase/server";
import { todayKST, TRACK_LABEL } from "@/lib/utils";
import { holidayNamesBetween } from "@/lib/holidays";
import { BOOK_SET_LABEL, BOOK_SET_MONTHS, DAYS, DAY_COUNT, bookLabel, bookSetForMonth, coverSrc, lessonLabel, sortTracks } from "@/lib/lc-audio";
import { getMySessions } from "../../_lib/queries";

export const metadata: Metadata = { title: "LC 음원듣기", robots: { index: false } };

export default async function LcBookPage({ params }: { params: Promise<{ bookId: string }> }) {
  const locked = await studentGate("lc-audio");
  if (locked) return locked;

  const { bookId } = await params;
  const id = Number(bookId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const supabase = await createClient();
  const [{ data: book }, { data: trackRows }, sessions] = await Promise.all([
    supabase.from("lc_books").select("id, level, book_set, title, description, cover_name, lesson_offset, updated_at").eq("id", id).maybeSingle(),
    supabase.from("lc_audio_tracks").select("id, day, kind, label, file_name, sort_order").eq("book_id", id),
    getMySessions(),
  ]);
  if (!book) notFound();

  const offset = book.lesson_offset ?? 0;
  const tracks = sortTracks(trackRows ?? []);
  const pick = (day: number, kind: string): LessonTrack[] =>
    tracks.filter((t) => t.day === day && (t.kind ?? "lesson") === kind).map((t) => ({ id: t.id, kind: t.kind, label: t.label, file_name: t.file_name }));

  /**
   * 이 교재를 쓰는 달의 내 수업일을 찾는다.
   * A반 교재는 홀수달, B반 교재는 짝수달에 쓴다. 내 반의 회차(seq)가 곧 강 번호 칸이다.
   */
  const sameSet = sessions.filter((s) => s.section?.term && bookSetForMonth(s.section.term.month) === book.book_set);
  const levelMatch = sameSet.filter((s) => s.section?.course?.target_score === book.level);
  const usable = levelMatch.length ? levelMatch : sameSet;

  // 여러 반(주5일)이면 회차가 많은 쪽을 쓴다
  const bySection = new Map<number, typeof usable>();
  for (const s of usable) {
    const sid = s.section?.id;
    if (sid == null) continue;
    bySection.set(sid, [...(bySection.get(sid) ?? []), s]);
  }
  const chosen = [...bySection.values()].sort((a, b) => b.length - a.length)[0] ?? [];
  const ordered = [...chosen].sort((a, b) => a.seq - b.seq).slice(0, DAY_COUNT);
  const section = ordered[0]?.section ?? null;
  const dateOfDay = new Map(ordered.map((s) => [s.seq, s.date]));

  const slots: LessonSlot[] = DAYS.map((day) => ({
    day,
    lessonNo: offset + day,
    date: dateOfDay.get(day) ?? null,
    lesson: pick(day, "lesson"),
    homework: pick(day, "homework"),
  }));

  const dates = slots.map((s) => s.date).filter((d): d is string => !!d);
  const year = section?.term?.year ?? null;
  const month = section?.term?.month ?? null;
  const names = dates.length ? holidayNamesBetween(dates[0], dates[dates.length - 1]) : new Map<string, string[]>();
  const holidays: Record<string, string> = {};
  for (const [d, list] of names) if (list.length) holidays[d] = list[0];

  const total = tracks.length;
  const thisMonth = bookSetForMonth(Number(todayKST().slice(5, 7))) === book.book_set;

  return (
    <div className="space-y-6">
      <PageHeader
        icon="headphones"
        title={`${book.level} ${bookLabel(book)}`}
        description={book.description || `${BOOK_SET_MONTHS[book.book_set]} · ${lessonLabel(1, offset)}부터 ${lessonLabel(DAY_COUNT, offset)}까지`}
      >
        <Link href="/my/lc-audio" className="btn-secondary">
          <Icon name="headphones" size={18} />
          다른 교재
        </Link>
      </PageHeader>

      <section className="flex items-center gap-4 rounded-xl3 border border-line bg-paper p-4">
        <div className="w-16 shrink-0 sm:w-20">
          <BookCover size="sm" src={book.cover_name ? coverSrc(book, 240) : null} alt="" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-black tracking-[0.18em] text-brand-600">
            {book.level} · {BOOK_SET_LABEL[book.book_set]}
          </p>
          <h2 className="truncate text-lg font-black text-ink">{book.title || bookLabel(book)}</h2>
          <p className="mt-0.5 text-xs text-slate">
            음원 {total}개
            {thisMonth && <span className="ml-1.5 rounded-full bg-brand-500 px-2 py-0.5 text-[10px] font-black text-white">이번 달 교재</span>}
          </p>
        </div>
      </section>

      <LessonCalendar
        slots={slots}
        year={year}
        month={month}
        today={todayKST()}
        holidays={holidays}
        trackLabel={section?.track ? (TRACK_LABEL[section.track] ?? section.track) : null}
      />

      <p className="text-xs text-mist">음원과 교재 이미지는 수강생 본인만 이용할 수 있습니다. 파일을 외부에 공유하지 마세요.</p>
    </div>
  );
}
